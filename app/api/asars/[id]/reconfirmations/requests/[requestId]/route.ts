import { organizerFromRequest, unauthorized } from "../../../../../../../lib/auth.server";
import { hashToken, randomToken } from "../../../../../../../lib/security";
import { database, ensureDatabase } from "../../../../../../../lib/store.server";
import { telegramBotCall, telegramReconfirmationLink } from "../../../../../../../lib/telegram-bot.server";
import { canSendReconfirmationReminder } from "../../../../../../../lib/reconfirmation";
import {
  getReconfirmationOverview,
  recoverStalledReconfirmationDeliveries,
  type ReconfirmationAsarRow,
} from "../../../../../../../lib/reconfirmation.server";
import type { ReconfirmationDeliveryStatus } from "../../../../../../../lib/types";

type RequestRow = {
  id: string;
  participant_key: string | null;
  participant_name: string;
  token_hash: string;
  delivery_status: ReconfirmationDeliveryStatus;
  delivery_attempts: number;
  reminder_count: number;
  last_sent_at: string | null;
  expires_at: string;
  closed_at: string | null;
  pending_items: number;
  reminder_opt_in: number;
};

function telegramChatId(participantKey: string | null) {
  if (!participantKey?.startsWith("telegram:")) return null;
  const value = Number(participantKey.slice("telegram:".length));
  return Number.isSafeInteger(value) ? value : null;
}

async function ownedAsar(id: string, ownerKey: string) {
  return database().prepare(`SELECT id, lifecycle_status, starts_at, time_mode
    FROM asars WHERE id = ? AND owner_email = ?`)
    .bind(id, ownerKey).first<ReconfirmationAsarRow>();
}

async function requestRow(asarId: string, requestId: string) {
  return database().prepare(`SELECT rq.id, rq.participant_key, rq.participant_name, rq.token_hash, rq.delivery_status,
    rq.delivery_attempts, rq.reminder_count, rq.last_sent_at, rr.expires_at, rr.closed_at,
    (SELECT COUNT(*) FROM reconfirmation_items ri WHERE ri.request_id = rq.id AND ri.state = 'PENDING') AS pending_items,
    (SELECT COALESCE(MAX(c.reminder_opt_in), 0) FROM reconfirmation_items ri
      JOIN commitments c ON c.id = ri.commitment_id
      WHERE ri.request_id = rq.id AND ri.state = 'PENDING' AND c.status = 'CONFIRMED') AS reminder_opt_in
    FROM reconfirmation_requests rq
    JOIN reconfirmation_rounds rr ON rr.id = rq.round_id
    WHERE rq.id = ? AND rr.asar_id = ?`)
    .bind(requestId, asarId).first<RequestRow>();
}

export async function POST(request: Request, context: { params: Promise<{ id: string; requestId: string }> }) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const { id, requestId } = await context.params;
  const payload = await request.json() as { action?: string };
  if (!new Set(["remind", "manual-link"]).has(payload.action ?? "")) {
    return Response.json({ code: "INVALID_ACTION", message: "Неизвестное действие" }, { status: 400 });
  }

  await ensureDatabase();
  const db = database();
  const asar = await ownedAsar(id, owner.email);
  if (!asar) return Response.json({ code: "NOT_FOUND", message: "Асар не найден" }, { status: 404 });
  await recoverStalledReconfirmationDeliveries(db, id);
  const current = await requestRow(id, requestId);
  if (!current) return Response.json({ code: "NOT_FOUND", message: "Запрос переклички не найден" }, { status: 404 });
  const nowMs = Date.now();
  if (current.closed_at || new Date(current.expires_at).getTime() <= nowMs || asar.lifecycle_status !== "PUBLISHED") {
    return Response.json({ code: "RECONFIRMATION_CLOSED", message: "Перекличка уже закрыта" }, { status: 410 });
  }
  if (new Date(asar.starts_at).getTime() <= nowMs) {
    return Response.json({ code: "RECONFIRMATION_DELIVERY_CLOSED", message: "Новые ссылки и напоминания доступны только до начала асара" }, { status: 409 });
  }
  if (!current.pending_items) {
    return Response.json({ code: "NO_PENDING_RESPONSES", message: "Участник уже ответил по всем ролям" }, { status: 409 });
  }

  const token = randomToken();
  const tokenHash = await hashToken(token);
  const now = new Date().toISOString();

  if (payload.action === "manual-link") {
    if (current.delivery_status === "PENDING") {
      return Response.json({ code: "DELIVERY_IN_PROGRESS", message: "Дождитесь результата текущей отправки" }, { status: 409 });
    }
    const rotated = await db.prepare(`UPDATE reconfirmation_requests SET token_hash = ?, token_issued_at = ?,
      delivery_status = 'MANUAL_LINK_ISSUED', updated_at = ?
      WHERE id = ? AND token_hash = ? AND delivery_status = ?
        AND EXISTS (
          SELECT 1 FROM reconfirmation_rounds rr JOIN asars a ON a.id = rr.asar_id
          WHERE rr.id = reconfirmation_requests.round_id AND rr.asar_id = ?
            AND rr.closed_at IS NULL AND a.lifecycle_status = 'PUBLISHED'
            AND julianday(rr.expires_at) > julianday(?)
            AND julianday(a.starts_at) > julianday(?)
        )
        AND EXISTS (
          SELECT 1 FROM reconfirmation_items ri
          WHERE ri.request_id = reconfirmation_requests.id AND ri.state = 'PENDING'
        )`)
      .bind(tokenHash, now, now, requestId, current.token_hash, current.delivery_status, id, now, now).run();
    if (!rotated.meta.changes) {
      return Response.json({ code: "REQUEST_CHANGED", message: "Состояние запроса изменилось. Обновите перекличку" }, { status: 409 });
    }
    const shareUrl = current.participant_key?.startsWith("telegram:")
      ? telegramReconfirmationLink(token)
      : new URL(`/reconfirm/${token}`, request.url).toString();
    return Response.json({
      ...(await getReconfirmationOverview(db, asar, { includeContacts: true })),
      shareUrl,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const chatId = telegramChatId(current.participant_key);
  const canRemind = Boolean(current.reminder_opt_in) && chatId !== null && canSendReconfirmationReminder({
    deliveryStatus: current.delivery_status,
    deliveryAttempts: Number(current.delivery_attempts),
    reminderCount: Number(current.reminder_count),
    lastSentAt: current.last_sent_at,
    hasPendingItems: Boolean(current.pending_items),
  }, Date.now());
  if (!canRemind || chatId === null) {
    return Response.json({ code: "REMINDER_UNAVAILABLE", message: "Повторное сообщение сейчас недоступно" }, { status: 409 });
  }

  const countsAsReminder = Boolean(current.last_sent_at);
  const reserved = await db.prepare(`UPDATE reconfirmation_requests SET token_hash = ?, token_issued_at = ?,
    delivery_status = 'PENDING', delivery_attempts = delivery_attempts + 1,
    reminder_count = reminder_count + ?, last_attempt_at = ?, updated_at = ?
    WHERE id = ? AND token_hash = ? AND delivery_status = ?
      AND delivery_attempts = ? AND reminder_count = ? AND last_sent_at IS ?
      AND EXISTS (
        SELECT 1 FROM reconfirmation_rounds rr JOIN asars a ON a.id = rr.asar_id
        WHERE rr.id = reconfirmation_requests.round_id AND rr.asar_id = ?
          AND rr.closed_at IS NULL AND a.lifecycle_status = 'PUBLISHED'
          AND julianday(rr.expires_at) > julianday(?)
          AND julianday(a.starts_at) > julianday(?)
      )
      AND EXISTS (
        SELECT 1 FROM reconfirmation_items ri
        JOIN commitments c ON c.id = ri.commitment_id
        WHERE ri.request_id = reconfirmation_requests.id AND ri.state = 'PENDING'
          AND c.status = 'CONFIRMED' AND c.reminder_opt_in = 1
      )`)
    .bind(tokenHash, now, countsAsReminder ? 1 : 0, now, now, requestId,
      current.token_hash, current.delivery_status, current.delivery_attempts,
      current.reminder_count, current.last_sent_at, id, now, now).run();
  if (!reserved.meta.changes) {
    return Response.json({ code: "REQUEST_CHANGED", message: "Сообщение уже отправляется или состояние запроса изменилось" }, { status: 409 });
  }
  try {
    await telegramBotCall("sendMessage", {
      chat_id: chatId,
      text: `${current.participant_name}, напоминаем: подтвердите, пожалуйста, свои роли перед асаром.`,
      reply_markup: { inline_keyboard: [[{ text: "Ответить на перекличку", url: telegramReconfirmationLink(token) }]] },
    });
    await db.prepare(`UPDATE reconfirmation_requests SET delivery_status = 'BOT_SENT',
      last_sent_at = ?, updated_at = ?
      WHERE id = ? AND token_hash = ? AND delivery_status = 'PENDING'`)
      .bind(now, now, requestId, tokenHash).run();
  } catch {
    await db.prepare(`UPDATE reconfirmation_requests SET delivery_status = 'BOT_FAILED',
      updated_at = ? WHERE id = ? AND token_hash = ? AND delivery_status = 'PENDING'`)
      .bind(now, requestId, tokenHash).run();
    return Response.json({
      ...(await getReconfirmationOverview(db, asar, { includeContacts: true })),
      code: "TELEGRAM_SEND_FAILED",
      message: "Telegram не доставил сообщение. Создайте личную ссылку и отправьте её вручную.",
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }

  return Response.json(await getReconfirmationOverview(db, asar, { includeContacts: true }), {
    headers: { "Cache-Control": "no-store" },
  });
}
