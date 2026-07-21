import { organizerFromRequest, unauthorized } from "../../../../../lib/auth.server";
import { hashToken, randomToken } from "../../../../../lib/security";
import { database, ensureDatabase } from "../../../../../lib/store.server";
import { telegramBotCall, telegramReconfirmationLink } from "../../../../../lib/telegram-bot.server";
import {
  getReconfirmationOverview,
  type ReconfirmationAsarRow,
} from "../../../../../lib/reconfirmation.server";
import {
  reconfirmationParticipantRef,
  reconfirmationScheduleKey,
} from "../../../../../lib/reconfirmation";
import type { AsarTimeMode } from "../../../../../lib/types";

type ConfirmedCommitmentRow = {
  id: string;
  participant_key: string | null;
  normalized_contact_hash: string;
  participant_name: string;
  contact_type: "PHONE" | "TELEGRAM";
  contact_value: string;
  reminder_opt_in: number;
};

type PendingDelivery = {
  requestId: string;
  participantKey: string;
  participantName: string;
  token: string;
};

function normalizeTimeMode(value: string | null): AsarTimeMode {
  return (["EXACT", "MORNING", "AFTERNOON", "EVENING", "FLEXIBLE"] as const).includes(value as AsarTimeMode)
    ? value as AsarTimeMode
    : "EXACT";
}

async function ownedAsar(id: string, ownerKey: string) {
  return database().prepare(`SELECT id, lifecycle_status, starts_at, time_mode
    FROM asars WHERE id = ? AND owner_email = ?`)
    .bind(id, ownerKey).first<ReconfirmationAsarRow>();
}

function telegramChatId(participantKey: string) {
  if (!participantKey.startsWith("telegram:")) return null;
  const id = Number(participantKey.slice("telegram:".length));
  return Number.isSafeInteger(id) ? id : null;
}

async function deliverInitialRequests(deliveries: PendingDelivery[]) {
  const db = database();
  const attemptedAt = new Date().toISOString();
  await Promise.all(deliveries.map(async (delivery) => {
    const chatId = telegramChatId(delivery.participantKey);
    if (chatId === null) return;
    const pending = await db.prepare(`SELECT rq.id FROM reconfirmation_requests rq
      JOIN reconfirmation_rounds rr ON rr.id = rq.round_id
      JOIN asars a ON a.id = rr.asar_id
      WHERE rq.id = ? AND rq.delivery_status = 'PENDING'
        AND rr.closed_at IS NULL AND a.lifecycle_status = 'PUBLISHED'
        AND julianday(a.starts_at) > julianday('now')
        AND julianday(rr.expires_at) > julianday('now')
        AND EXISTS (
          SELECT 1 FROM reconfirmation_items ri
          JOIN commitments c ON c.id = ri.commitment_id
          WHERE ri.request_id = rq.id AND ri.state = 'PENDING'
            AND c.status = 'CONFIRMED' AND c.reminder_opt_in = 1
        )`)
      .bind(delivery.requestId).first();
    if (!pending) return;
    try {
      await telegramBotCall("sendMessage", {
        chat_id: chatId,
        text: `${delivery.participantName}, пожалуйста, подтвердите, что ваши роли перед асаром остаются в силе.`,
        reply_markup: {
          inline_keyboard: [[{
            text: "Ответить на перекличку",
            url: telegramReconfirmationLink(delivery.token),
          }]],
        },
      });
      await db.prepare(`UPDATE reconfirmation_requests
        SET delivery_status = 'BOT_SENT', last_sent_at = ?, updated_at = ?
        WHERE id = ? AND delivery_status = 'PENDING'`)
        .bind(attemptedAt, attemptedAt, delivery.requestId).run();
    } catch {
      await db.prepare(`UPDATE reconfirmation_requests
        SET delivery_status = 'BOT_FAILED', updated_at = ?
        WHERE id = ? AND delivery_status = 'PENDING'`)
        .bind(attemptedAt, delivery.requestId).run();
    }
  }));
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const { id } = await context.params;
  await ensureDatabase();
  const asar = await ownedAsar(id, owner.email);
  if (!asar) return Response.json({ code: "NOT_FOUND", message: "Асар не найден" }, { status: 404 });
  const overview = await getReconfirmationOverview(database(), asar, { includeContacts: true });
  return Response.json(overview, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const { id } = await context.params;
  await ensureDatabase();
  const db = database();
  const asar = await ownedAsar(id, owner.email);
  if (!asar) return Response.json({ code: "NOT_FOUND", message: "Асар не найден" }, { status: 404 });

  const current = await getReconfirmationOverview(db, asar, { includeContacts: true });
  if (current.round) return Response.json(current, { headers: { "Cache-Control": "no-store" } });
  if (!current.eligibility.canStart) {
    return Response.json({ code: "RECONFIRMATION_UNAVAILABLE", message: current.eligibility.reason ?? "Перекличка сейчас недоступна" }, { status: 409 });
  }

  const rows = await db.prepare(`SELECT c.id, c.participant_key, c.normalized_contact_hash,
    c.participant_name, c.contact_type, c.contact_value, c.reminder_opt_in
    FROM commitments c JOIN requirements r ON r.id = c.requirement_id
    WHERE r.asar_id = ? AND c.status = 'CONFIRMED'
    ORDER BY c.created_at`)
    .bind(id).all<ConfirmedCommitmentRow>();
  if (!rows.results.length) {
    return Response.json({ code: "NO_CONFIRMED_PARTICIPANTS", message: "Нет подтвердившихся участников для переклички" }, { status: 409 });
  }

  const grouped = new Map<string, ConfirmedCommitmentRow[]>();
  for (const row of rows.results) {
    const ref = reconfirmationParticipantRef({
      participantKey: row.participant_key,
      normalizedContactHash: row.normalized_contact_hash,
    });
    grouped.set(ref, [...(grouped.get(ref) ?? []), row]);
  }

  const roundId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const timeMode = normalizeTimeMode(asar.time_mode);
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO reconfirmation_rounds
      (id, asar_id, organizer_key, schedule_key, starts_at, time_mode, expires_at, created_at, updated_at)
      SELECT ?, a.id, ?, ?, a.starts_at, a.time_mode, ?, ?, ? FROM asars a
      WHERE a.id = ? AND a.owner_email = ? AND a.lifecycle_status = 'PUBLISHED'
        AND a.starts_at = ? AND a.time_mode = ?
        AND julianday(a.starts_at) > julianday('now') AND julianday(?) > julianday('now')`)
      .bind(roundId, owner.email, reconfirmationScheduleKey(asar.starts_at, timeMode),
        current.eligibility.expiresAt, createdAt, createdAt, id, owner.email,
        asar.starts_at, timeMode, current.eligibility.expiresAt),
  ];
  const deliveries: PendingDelivery[] = [];

  for (const [participantRef, commitments] of grouped) {
    const first = commitments[0];
    const requestId = crypto.randomUUID();
    const token = randomToken();
    const tokenHash = await hashToken(token);
    statements.push(db.prepare(`INSERT INTO reconfirmation_requests
      (id, round_id, participant_ref, participant_key, normalized_contact_hash, participant_name,
        contact_type, contact_value, delivery_status, token_hash, token_issued_at,
        delivery_attempts, last_attempt_at, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM reconfirmation_rounds WHERE id = ?)`)
      .bind(requestId, roundId, participantRef, first.participant_key, first.normalized_contact_hash,
        first.participant_name, first.contact_type, first.contact_value,
        "MANUAL_REQUIRED", tokenHash, createdAt, 0, null, createdAt, createdAt, roundId));
    for (const commitment of commitments) {
      statements.push(db.prepare(`INSERT INTO reconfirmation_items
        (id, round_id, request_id, commitment_id, state, created_at, updated_at)
        SELECT ?, ?, ?, c.id, 'PENDING', ?, ? FROM commitments c
        WHERE c.id = ? AND c.status = 'CONFIRMED'
          AND EXISTS (SELECT 1 FROM reconfirmation_requests WHERE id = ? AND round_id = ?)`)
        .bind(crypto.randomUUID(), roundId, requestId, createdAt, createdAt, commitment.id, requestId, roundId));
    }
    if (first.participant_key?.startsWith("telegram:")) {
      statements.push(db.prepare(`UPDATE reconfirmation_requests
        SET delivery_status = 'PENDING', delivery_attempts = 1,
          last_attempt_at = ?, updated_at = ?
        WHERE id = ? AND round_id = ?
          AND EXISTS (
            SELECT 1 FROM reconfirmation_items ri
            JOIN commitments c ON c.id = ri.commitment_id
            WHERE ri.request_id = reconfirmation_requests.id
              AND c.status = 'CONFIRMED' AND c.reminder_opt_in = 1
          )`).bind(createdAt, createdAt, requestId, roundId));
      deliveries.push({ requestId, participantKey: first.participant_key, participantName: first.participant_name, token });
    }
  }
  statements.push(db.prepare(`DELETE FROM reconfirmation_requests
    WHERE round_id = ? AND NOT EXISTS (
      SELECT 1 FROM reconfirmation_items ri WHERE ri.request_id = reconfirmation_requests.id
    )`).bind(roundId));

  try {
    await db.batch(statements);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (!/UNIQUE|constraint/i.test(message)) throw caught;
    const raced = await getReconfirmationOverview(db, asar, { includeContacts: true });
    if (raced.round) return Response.json(raced, { headers: { "Cache-Control": "no-store" } });
    throw caught;
  }

  const createdRound = await db.prepare("SELECT id FROM reconfirmation_rounds WHERE id = ?").bind(roundId).first();
  if (!createdRound) {
    return Response.json({ code: "RECONFIRMATION_UNAVAILABLE", message: "Расписание или состояние асара изменилось. Обновите страницу" }, { status: 409 });
  }
  const itemCount = await db.prepare("SELECT COUNT(*) AS total FROM reconfirmation_items WHERE round_id = ?")
    .bind(roundId).first<{ total: number }>();
  if (!Number(itemCount?.total)) {
    await db.prepare("DELETE FROM reconfirmation_rounds WHERE id = ?").bind(roundId).run();
    return Response.json({ code: "NO_CONFIRMED_PARTICIPANTS", message: "Подтверждённые роли успели измениться. Обновите асар и попробуйте снова" }, { status: 409 });
  }

  await deliverInitialRequests(deliveries);
  return Response.json(await getReconfirmationOverview(db, asar, { includeContacts: true }), {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}
