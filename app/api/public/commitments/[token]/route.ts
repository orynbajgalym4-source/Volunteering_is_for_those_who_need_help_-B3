import { hashToken } from "../../../../../lib/security";
import { reconfirmationExpiry } from "../../../../../lib/reconfirmation";
import { database, ensureDatabase, getAsarView } from "../../../../../lib/store.server";
import { telegramBotCall } from "../../../../../lib/telegram-bot.server";

type ManageRow = {
  id: string; status: string; participant_name: string; contact_type: string; contact_value: string;
  participant_key: string | null; reminder_opt_in: number; quantity: number; comment: string;
  requirement_id: string; requirement_title: string; asar_id: string; active_reconfirmation_round_id: string | null;
  asar_title: string; starts_at: string; time_mode: "EXACT" | "MORNING" | "AFTERNOON" | "EVENING" | "FLEXIBLE"; public_location: string; exact_address: string; lifecycle_status: string;
};

async function commitmentByToken(token: string) {
  await ensureDatabase();
  return database().prepare(`SELECT c.*, r.title as requirement_title, r.asar_id, a.title as asar_title, a.starts_at, a.time_mode, a.public_location,
    a.exact_address, a.lifecycle_status, rr.id AS active_reconfirmation_round_id
    FROM commitments c JOIN requirements r ON r.id = c.requirement_id
    JOIN asars a ON a.id = r.asar_id
    LEFT JOIN reconfirmation_rounds rr ON rr.asar_id = a.id AND rr.closed_at IS NULL
    WHERE c.manage_token_hash = ?`).bind(await hashToken(token)).first<ManageRow>();
}

function contributionIsOpen(row: ManageRow) {
  const expiresAt = reconfirmationExpiry(row.starts_at, row.time_mode ?? "EXACT");
  return Boolean(expiresAt) && new Date(expiresAt).getTime() > Date.now();
}

function canUpdateReminderPreference(row: ManageRow) {
  return row.contact_type === "TELEGRAM"
    && Boolean(row.participant_key?.startsWith("telegram:"))
    && ["CLAIMED", "CONFIRMED"].includes(row.status)
    && row.lifecycle_status === "PUBLISHED"
    && !row.active_reconfirmation_round_id
    && contributionIsOpen(row);
}

function shape(row: ManageRow) {
  const confirmed = ["CONFIRMED", "ATTENDED"].includes(row.status);
  return {
    id: row.id,
    participantName: row.participant_name,
    contactType: row.contact_type,
    contactValue: row.contact_value,
    quantity: row.quantity,
    comment: row.comment,
    status: row.status,
    reminderOptIn: Boolean(row.reminder_opt_in),
    canUpdateReminderPreference: canUpdateReminderPreference(row),
    canCancel: ["CLAIMED", "CONFIRMED"].includes(row.status) && row.lifecycle_status === "PUBLISHED" && contributionIsOpen(row),
    reconfirmationActive: Boolean(row.active_reconfirmation_round_id),
    requirementTitle: row.requirement_title,
    asar: {
      id: row.asar_id,
      title: row.asar_title,
      startsAt: row.starts_at,
      timeMode: row.time_mode ?? "EXACT",
      publicLocation: row.public_location,
      exactAddress: confirmed ? row.exact_address : undefined,
      lifecycleStatus: row.lifecycle_status,
    },
  };
}

async function asarStatus(asarId: string) {
  const asar = await getAsarView(asarId);
  return asar ? {
    lifecycleStatus: asar.lifecycleStatus,
    readiness: asar.readiness,
  } : null;
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const item = await commitmentByToken(token);
  return item ? Response.json({ commitment: shape(item), asarStatus: await asarStatus(item.asar_id) }) : Response.json({ code: "NOT_FOUND", message: "Ссылка управления недоступна" }, { status: 404 });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const current = await commitmentByToken(token);
  if (!current) return Response.json({ code: "NOT_FOUND", message: "Ссылка управления недоступна" }, { status: 404 });
  const payload = await request.json() as { action?: string; comment?: string; reminderOptIn?: boolean };
  if (payload.action === "confirm") {
    if (current.status !== "CLAIMED") return Response.json({ code: "INVALID_TRANSITION", message: "Участие уже обработано" }, { status: 409 });
    const expiresAt = reconfirmationExpiry(current.starts_at, current.time_mode ?? "EXACT");
    const result = await database().prepare(`UPDATE commitments
      SET status = 'CONFIRMED', confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'CLAIMED' AND julianday(?) > julianday('now')
        AND EXISTS (
          SELECT 1 FROM requirements r JOIN asars a ON a.id = r.asar_id
          WHERE r.id = commitments.requirement_id AND a.lifecycle_status = 'PUBLISHED'
        )`)
      .bind(current.id, expiresAt).run();
    if (!result.meta.changes) {
      return Response.json({ code: "CONFIRMATION_CLOSED", message: "Подтверждение уже недоступно после начала асара" }, { status: 409 });
    }
  } else if (payload.action === "cancel") {
    if (!["CLAIMED", "CONFIRMED"].includes(current.status)) return Response.json({ code: "INVALID_TRANSITION", message: "Участие уже обработано" }, { status: 409 });
    if (current.lifecycle_status !== "PUBLISHED" || !contributionIsOpen(current)) {
      return Response.json({ code: "CANCELLATION_CLOSED", message: "Отменить участие можно только до начала асара" }, { status: 409 });
    }
    const db = database();
    const now = new Date().toISOString();
    const expiresAt = reconfirmationExpiry(current.starts_at, current.time_mode ?? "EXACT");
    const results = await db.batch([
      db.prepare(`UPDATE commitments SET status = 'CANCELLED', cancelled_at = ?, updated_at = ?
        WHERE id = ? AND status IN ('CLAIMED','CONFIRMED') AND julianday(?) > julianday('now')
          AND EXISTS (
            SELECT 1 FROM requirements r JOIN asars a ON a.id = r.asar_id
            WHERE r.id = commitments.requirement_id AND a.lifecycle_status = 'PUBLISHED'
          )`).bind(now, now, current.id, expiresAt),
      db.prepare(`UPDATE reconfirmation_items SET state = 'CANCELLED', responded_at = ?, updated_at = ?
        WHERE commitment_id = ? AND state IN ('PENDING','CONFIRMED')
          AND round_id IN (
            SELECT id FROM reconfirmation_rounds
            WHERE asar_id = ? AND closed_at IS NULL AND julianday(expires_at) > julianday(?)
          )
          AND EXISTS (
            SELECT 1 FROM commitments c
            WHERE c.id = reconfirmation_items.commitment_id
              AND c.status = 'CANCELLED' AND c.cancelled_at = ?
          )`)
        .bind(now, now, current.id, current.asar_id, now, now),
    ]);
    if (!results[0].meta.changes) {
      return Response.json({ code: "CANCELLATION_CLOSED", message: "Отменить участие можно только до начала асара" }, { status: 409 });
    }
    const risk = await database().prepare(`SELECT r.title as requirement_title, r.is_critical, a.title as asar_title, a.owner_email
      FROM requirements r JOIN asars a ON a.id = r.asar_id WHERE r.id = ?`).bind(current.requirement_id)
      .first<{ requirement_title: string; is_critical: number; asar_title: string; owner_email: string }>();
    if (risk?.is_critical && risk.owner_email.startsWith("telegram:")) {
      const ownerChatId = Number(risk.owner_email.slice("telegram:".length));
      if (Number.isSafeInteger(ownerChatId)) {
        try {
          await telegramBotCall("sendMessage", {
            chat_id: ownerChatId,
            text: `⚠️ Асар снова не готов. Критическая роль «${risk.requirement_title}» освободилась в деле «${risk.asar_title}».`,
            reply_markup: { inline_keyboard: [[{ text: "Найти замену", web_app: { url: `${new URL(request.url).origin}/app/asars/${current.asar_id}/share` } }]] },
          });
        } catch { /* The cancellation itself must succeed even if notifications are unavailable. */ }
      }
    }
  } else if (payload.action === "reminder-opt-in") {
    if (typeof payload.reminderOptIn !== "boolean") {
      return Response.json({ code: "INVALID_REMINDER_PREFERENCE", message: "Укажите настройку сообщения" }, { status: 400 });
    }
    if (!canUpdateReminderPreference(current)) {
      return Response.json({ code: "REMINDER_PREFERENCE_LOCKED", message: "Настройку нельзя изменить после запуска переклички или начала асара" }, { status: 409 });
    }
    const expiresAt = reconfirmationExpiry(current.starts_at, current.time_mode ?? "EXACT");
    const result = await database().prepare(`UPDATE commitments SET reminder_opt_in = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND contact_type = 'TELEGRAM' AND participant_key LIKE 'telegram:%'
        AND status IN ('CLAIMED','CONFIRMED')
        AND julianday(?) > julianday('now')
        AND EXISTS (
          SELECT 1 FROM requirements r JOIN asars a ON a.id = r.asar_id
          WHERE r.id = commitments.requirement_id AND a.lifecycle_status = 'PUBLISHED'
        )
        AND NOT EXISTS (
          SELECT 1 FROM requirements r JOIN reconfirmation_rounds rr ON rr.asar_id = r.asar_id
          WHERE r.id = commitments.requirement_id AND rr.closed_at IS NULL
        )`)
      .bind(payload.reminderOptIn ? 1 : 0, current.id, expiresAt).run();
    if (!result.meta.changes) {
      return Response.json({ code: "REMINDER_PREFERENCE_LOCKED", message: "Перекличка уже началась или время настройки закончилось" }, { status: 409 });
    }
  } else if (payload.action === "comment") {
    await database().prepare("UPDATE commitments SET comment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(payload.comment?.trim() ?? "", current.id).run();
  } else {
    return Response.json({ code: "INVALID_ACTION", message: "Неизвестное действие" }, { status: 400 });
  }
  const updated = await commitmentByToken(token);
  return Response.json({ commitment: shape(updated!), asarStatus: await asarStatus(current.asar_id) });
}
