import { telegramUserFromRequest } from "../../../../../lib/auth.server";
import { hashToken } from "../../../../../lib/security";
import { database, ensureDatabase } from "../../../../../lib/store.server";
import { telegramBotCall } from "../../../../../lib/telegram-bot.server";
import type { AsarTimeMode, PublicReconfirmationView, ReconfirmationItemState } from "../../../../../lib/types";

type TokenRow = {
  request_id: string;
  participant_key: string | null;
  participant_name: string;
  expires_at: string;
  closed_at: string | null;
  asar_id: string;
  asar_title: string;
  starts_at: string;
  time_mode: AsarTimeMode;
  public_location: string;
  exact_address: string;
  lifecycle_status: string;
  owner_email: string;
};

type ItemRow = {
  commitment_id: string;
  requirement_title: string;
  quantity: number;
  is_critical: number;
  state: ReconfirmationItemState;
  commitment_status: string;
};

async function requestByToken(token: string) {
  await ensureDatabase();
  return database().prepare(`SELECT rq.id AS request_id, rq.participant_key, rq.participant_name,
    rr.expires_at, rr.closed_at, a.id AS asar_id, a.title AS asar_title, a.starts_at,
    a.time_mode, a.public_location, a.exact_address, a.lifecycle_status, a.owner_email
    FROM reconfirmation_requests rq
    JOIN reconfirmation_rounds rr ON rr.id = rq.round_id
    JOIN asars a ON a.id = rr.asar_id
    WHERE rq.token_hash = ?`)
    .bind(await hashToken(token)).first<TokenRow>();
}

async function itemsForRequest(requestId: string) {
  return database().prepare(`SELECT ri.commitment_id, r.title AS requirement_title, c.quantity, r.is_critical,
    ri.state, c.status AS commitment_status
    FROM reconfirmation_items ri
    JOIN commitments c ON c.id = ri.commitment_id
    JOIN requirements r ON r.id = c.requirement_id
    WHERE ri.request_id = ? ORDER BY r.sort_order, ri.created_at`)
    .bind(requestId).all<ItemRow>();
}

function isClosed(row: TokenRow) {
  return Boolean(row.closed_at)
    || !["PUBLISHED"].includes(row.lifecycle_status)
    || new Date(row.expires_at).getTime() <= Date.now();
}

async function authorizeParticipant(request: Request, row: TokenRow) {
  if (!row.participant_key?.startsWith("telegram:")) return true;
  const identity = await telegramUserFromRequest(request);
  return identity?.ownerKey === row.participant_key;
}

async function shape(row: TokenRow): Promise<PublicReconfirmationView> {
  const items = await itemsForRequest(row.request_id);
  const hasActiveCommitment = items.results.some((item) => ["CONFIRMED", "ATTENDED"].includes(item.commitment_status));
  return {
    asar: {
      title: row.asar_title,
      startsAt: row.starts_at,
      timeMode: row.time_mode ?? "EXACT",
      publicLocation: row.public_location,
      ...(hasActiveCommitment ? { exactAddress: row.exact_address } : {}),
      lifecycleStatus: row.lifecycle_status,
    },
    participantName: row.participant_name,
    expiresAt: row.expires_at,
    items: items.results.map((item) => ({
      commitmentId: item.commitment_id,
      requirementTitle: item.requirement_title,
      quantity: Number(item.quantity),
      isCritical: Boolean(item.is_critical),
      state: item.commitment_status === "CANCELLED" ? "CANCELLED" : item.state,
    })),
  };
}

async function notifyCriticalCancellation(request: Request, row: TokenRow, titles: string[]) {
  if (!titles.length || !row.owner_email.startsWith("telegram:")) return;
  const chatId = Number(row.owner_email.slice("telegram:".length));
  if (!Number.isSafeInteger(chatId)) return;
  try {
    await telegramBotCall("sendMessage", {
      chat_id: chatId,
      text: `⚠️ После переклички асар снова не готов. Освободились критические роли: ${titles.join(", ")}.`,
      reply_markup: {
        inline_keyboard: [[{
          text: "Найти замену",
          web_app: { url: `${new URL(request.url).origin}/app/asars/${row.asar_id}/share` },
        }]],
      },
    });
  } catch {
    // A participant response must never be rolled back by a notification failure.
  }
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const row = await requestByToken(token);
  if (!row) return Response.json({ code: "NOT_FOUND", message: "Ссылка переклички недоступна" }, { status: 404 });
  if (isClosed(row)) return Response.json({ code: "RECONFIRMATION_CLOSED", message: "Перекличка уже закрыта" }, { status: 410 });
  if (!await authorizeParticipant(request, row)) {
    return Response.json({ code: "PARTICIPANT_MISMATCH", message: "Эта ссылка предназначена другому участнику Telegram" }, { status: 403 });
  }
  const opened = await database().prepare(`UPDATE reconfirmation_requests
    SET opened_at = COALESCE(opened_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND token_hash = ?
      AND EXISTS (
        SELECT 1 FROM reconfirmation_rounds rr JOIN asars a ON a.id = rr.asar_id
        WHERE rr.id = reconfirmation_requests.round_id AND rr.closed_at IS NULL
          AND a.lifecycle_status = 'PUBLISHED' AND julianday(rr.expires_at) > julianday('now')
      )`)
    .bind(row.request_id, await hashToken(token)).run();
  if (!opened.meta.changes) {
    const latest = await requestByToken(token);
    return latest
      ? Response.json({ code: "RECONFIRMATION_CLOSED", message: "Перекличка уже закрыта" }, { status: 410 })
      : Response.json({ code: "NOT_FOUND", message: "Ссылка переклички была заменена" }, { status: 404 });
  }
  return Response.json({ reconfirmation: await shape(row) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const row = await requestByToken(token);
  if (!row) return Response.json({ code: "NOT_FOUND", message: "Ссылка переклички недоступна" }, { status: 404 });
  if (isClosed(row)) return Response.json({ code: "RECONFIRMATION_CLOSED", message: "Перекличка уже закрыта" }, { status: 410 });
  if (!await authorizeParticipant(request, row)) {
    return Response.json({ code: "PARTICIPANT_MISMATCH", message: "Эта ссылка предназначена другому участнику Telegram" }, { status: 403 });
  }

  const payload = await request.json() as { responses?: Array<{ commitmentId?: string; action?: string }> };
  const responses = payload.responses ?? [];
  if (!responses.length || responses.some((item) => !item.commitmentId || !["confirm", "cancel"].includes(item.action ?? ""))) {
    return Response.json({ code: "INVALID_RESPONSES", message: "Проверьте ответы по ролям" }, { status: 400 });
  }
  if (new Set(responses.map((item) => item.commitmentId)).size !== responses.length) {
    return Response.json({ code: "DUPLICATE_RESPONSE", message: "Одна роль указана несколько раз" }, { status: 400 });
  }

  const currentRows = await itemsForRequest(row.request_id);
  const current = new Map(currentRows.results.map((item) => [item.commitment_id, item]));
  for (const response of responses) {
    const item = current.get(response.commitmentId!);
    if (!item) return Response.json({ code: "ROLE_FORBIDDEN", message: "Роль не относится к этой ссылке" }, { status: 403 });
    if (response.action === "confirm" && (item.state === "CANCELLED" || item.commitment_status === "CANCELLED")) {
      return Response.json({ code: "CANCELLED_ROLE_LOCKED", message: "Отменённую роль нельзя вернуть по этой ссылке" }, { status: 409 });
    }
  }

  const db = database();
  const now = new Date().toISOString();
  const presentedTokenHash = await hashToken(token);
  const statements: D1PreparedStatement[] = [];
  const criticalCancellationStatements: Array<{ index: number; title: string }> = [];
  for (const response of responses) {
    const item = current.get(response.commitmentId!)!;
    if (response.action === "confirm") {
      if (item.state === "CONFIRMED") continue;
      statements.push(db.prepare(`UPDATE reconfirmation_items SET state = 'CONFIRMED', responded_at = ?, updated_at = ?
        WHERE request_id = ? AND commitment_id = ? AND state = 'PENDING'
          AND EXISTS (SELECT 1 FROM commitments c WHERE c.id = ? AND c.status = 'CONFIRMED')
          AND EXISTS (
            SELECT 1 FROM reconfirmation_requests rq
            JOIN reconfirmation_rounds rr ON rr.id = rq.round_id
            JOIN asars a ON a.id = rr.asar_id
            WHERE rq.id = reconfirmation_items.request_id AND rq.token_hash = ?
              AND rr.closed_at IS NULL AND a.lifecycle_status = 'PUBLISHED'
              AND julianday(rr.expires_at) > julianday(?)
          )`)
        .bind(now, now, row.request_id, response.commitmentId, response.commitmentId, presentedTokenHash, now));
    } else {
      if (item.state === "CANCELLED" || item.commitment_status === "CANCELLED") continue;
      const baseStatementIndex = statements.length + 1;
      statements.push(
        db.prepare(`UPDATE reconfirmation_items SET state = 'CANCELLED', responded_at = ?, updated_at = ?
          WHERE request_id = ? AND commitment_id = ? AND state IN ('PENDING','CONFIRMED')
            AND EXISTS (
              SELECT 1 FROM reconfirmation_requests rq
              JOIN reconfirmation_rounds rr ON rr.id = rq.round_id
              JOIN asars a ON a.id = rr.asar_id
              WHERE rq.id = reconfirmation_items.request_id AND rq.token_hash = ?
                AND rr.closed_at IS NULL AND a.lifecycle_status = 'PUBLISHED'
                AND julianday(rr.expires_at) > julianday(?)
            )`)
          .bind(now, now, row.request_id, response.commitmentId, presentedTokenHash, now),
        db.prepare(`UPDATE commitments SET status = 'CANCELLED', cancelled_at = ?, updated_at = ?
          WHERE id = ? AND status = 'CONFIRMED'
            AND EXISTS (
              SELECT 1 FROM reconfirmation_items ri
              JOIN reconfirmation_requests rq ON rq.id = ri.request_id
              JOIN reconfirmation_rounds rr ON rr.id = rq.round_id
              JOIN asars a ON a.id = rr.asar_id
              WHERE ri.request_id = ? AND ri.commitment_id = commitments.id
                AND ri.state = 'CANCELLED' AND ri.responded_at = ? AND rq.token_hash = ?
                AND rr.closed_at IS NULL AND a.lifecycle_status = 'PUBLISHED'
                AND julianday(rr.expires_at) > julianday(?)
            )`)
          .bind(now, now, response.commitmentId, row.request_id, now, presentedTokenHash, now),
      );
      if (item.is_critical) criticalCancellationStatements.push({ index: baseStatementIndex, title: item.requirement_title });
    }
  }
  const results = statements.length ? await db.batch(statements) : [];
  if (statements.length && !results.some((result) => Number(result.meta.changes) > 0)) {
    const latest = await requestByToken(token);
    if (!latest) return Response.json({ code: "NOT_FOUND", message: "Ссылка переклички была заменена" }, { status: 404 });
    if (isClosed(latest)) return Response.json({ code: "RECONFIRMATION_CLOSED", message: "Перекличка уже закрыта" }, { status: 410 });
  }
  const newlyCancelledCritical = criticalCancellationStatements
    .filter(({ index }) => Number(results[index]?.meta.changes) > 0)
    .map(({ title }) => title);
  await notifyCriticalCancellation(request, row, newlyCancelledCritical);
  return Response.json({ reconfirmation: await shape(row) }, { headers: { "Cache-Control": "no-store" } });
}
