import { canSendReconfirmationReminder, reconfirmationParticipantRef, reconfirmationScheduleKey, reconfirmationWindow } from "./reconfirmation";
import type {
  AsarTimeMode,
  ReconfirmationDeliveryStatus,
  ReconfirmationItemState,
  ReconfirmationItemView,
  ReconfirmationOverview,
  ReconfirmationRequestView,
} from "./types";

export type ReconfirmationAsarRow = {
  id: string;
  lifecycle_status: string;
  starts_at: string;
  time_mode: string | null;
};

type ConfirmedParticipantRow = {
  participant_key: string | null;
  normalized_contact_hash: string;
  reminder_opt_in: number;
};

type RoundRow = {
  id: string;
  created_at: string;
  expires_at: string;
};

type OverviewItemRow = {
  request_id: string;
  participant_name: string;
  contact_value: string;
  delivery_status: ReconfirmationDeliveryStatus;
  opened_at: string | null;
  delivery_attempts: number;
  reminder_count: number;
  last_sent_at: string | null;
  commitment_id: string;
  requirement_id: string;
  requirement_title: string;
  quantity: number;
  is_critical: number;
  state: ReconfirmationItemState;
};

function normalizeTimeMode(value: string | null): AsarTimeMode {
  return (["EXACT", "MORNING", "AFTERNOON", "EVENING", "FLEXIBLE"] as const).includes(value as AsarTimeMode)
    ? value as AsarTimeMode
    : "EXACT";
}

export async function recoverStalledReconfirmationDeliveries(db: D1Database, asarId: string, now = Date.now()) {
  const recoveredAt = new Date(now).toISOString();
  const staleBefore = new Date(now - 2 * 60 * 1000).toISOString();
  await db.prepare(`UPDATE reconfirmation_requests
    SET delivery_status = 'BOT_FAILED', delivery_attempts = MAX(delivery_attempts, 2), updated_at = ?
    WHERE delivery_status = 'PENDING' AND last_attempt_at IS NOT NULL AND last_attempt_at <= ?
      AND round_id IN (
        SELECT id FROM reconfirmation_rounds WHERE asar_id = ? AND closed_at IS NULL
      )`)
    .bind(recoveredAt, staleBefore, asarId).run();
}

export async function getReconfirmationOverview(
  db: D1Database,
  asar: ReconfirmationAsarRow,
  options: { includeContacts?: boolean; now?: number } = {},
): Promise<ReconfirmationOverview> {
  const now = options.now ?? Date.now();
  const timeMode = normalizeTimeMode(asar.time_mode);
  const window = reconfirmationWindow(asar.starts_at, timeMode, now);
  await recoverStalledReconfirmationDeliveries(db, asar.id, now);

  const participantRows = await db.prepare(`SELECT c.participant_key, c.normalized_contact_hash, c.reminder_opt_in
    FROM commitments c JOIN requirements r ON r.id = c.requirement_id
    WHERE r.asar_id = ? AND c.status = 'CONFIRMED'`)
    .bind(asar.id).all<ConfirmedParticipantRow>();
  const people = new Map<string, { botEligible: boolean }>();
  for (const row of participantRows.results) {
    const ref = reconfirmationParticipantRef({ participantKey: row.participant_key, normalizedContactHash: row.normalized_contact_hash });
    const botEligible = Boolean(row.reminder_opt_in) && Boolean(row.participant_key?.startsWith("telegram:"));
    const current = people.get(ref);
    people.set(ref, { botEligible: Boolean(current?.botEligible || botEligible) });
  }
  const botEligiblePeople = [...people.values()].filter((person) => person.botEligible).length;
  const scheduleKey = reconfirmationScheduleKey(asar.starts_at, timeMode);
  const existingForSchedule = await db.prepare("SELECT id, closed_at FROM reconfirmation_rounds WHERE asar_id = ? AND schedule_key = ?")
    .bind(asar.id, scheduleKey).first<{ id: string; closed_at: string | null }>();
  let reason: string | undefined;
  if (asar.lifecycle_status !== "PUBLISHED") reason = "Перекличку можно запустить только для опубликованного асара";
  else if (existingForSchedule) reason = existingForSchedule.closed_at ? "Для текущего времени перекличка уже проводилась" : "Перекличка уже запущена";
  else if (!window.isOpen) reason = window.reason === "TOO_EARLY"
    ? "Перекличка откроется за 48 часов до начала"
    : window.reason === "STARTED" ? "Асар уже начался" : "Не удалось определить время асара";
  else if (!people.size) reason = "Нет подтвердившихся участников для переклички";

  const eligibility = {
    canStart: !reason,
    ...(reason ? { reason } : {}),
    windowOpensAt: window.opensAt,
    expiresAt: window.expiresAt,
    confirmedPeople: people.size,
    botEligiblePeople,
    manualPeople: people.size - botEligiblePeople,
  };

  const round = await db.prepare(`SELECT id, created_at, expires_at FROM reconfirmation_rounds
    WHERE asar_id = ? AND closed_at IS NULL ORDER BY created_at DESC LIMIT 1`)
    .bind(asar.id).first<RoundRow>();
  if (!round) return { eligibility };

  const rows = await db.prepare(`SELECT rq.id AS request_id, rq.participant_name, rq.contact_value, rq.delivery_status,
    rq.opened_at, rq.delivery_attempts, rq.reminder_count, rq.last_sent_at, ri.commitment_id,
    r.id AS requirement_id, r.title AS requirement_title, c.quantity, r.is_critical, ri.state
    FROM reconfirmation_requests rq
    JOIN reconfirmation_items ri ON ri.request_id = rq.id
    JOIN commitments c ON c.id = ri.commitment_id
    JOIN requirements r ON r.id = c.requirement_id
    WHERE rq.round_id = ? ORDER BY rq.created_at, r.sort_order, ri.created_at`)
    .bind(round.id).all<OverviewItemRow>();
  const grouped = new Map<string, ReconfirmationRequestView & { lastSentAt: string | null; deliveryAttempts: number }>();
  for (const row of rows.results) {
    const request: ReconfirmationRequestView & { lastSentAt: string | null; deliveryAttempts: number } = grouped.get(row.request_id) ?? {
      id: row.request_id,
      displayName: row.participant_name,
      ...(options.includeContacts ? { contactValue: row.contact_value } : {}),
      deliveryStatus: row.delivery_status,
      ...(row.opened_at ? { openedAt: row.opened_at } : {}),
      reminderCount: Number(row.reminder_count),
      canRemind: false,
      items: [] as ReconfirmationItemView[],
      lastSentAt: row.last_sent_at,
      deliveryAttempts: Number(row.delivery_attempts),
    };
    request.items.push({
      commitmentId: row.commitment_id,
      requirementId: row.requirement_id,
      requirementTitle: row.requirement_title,
      quantity: Number(row.quantity),
      isCritical: Boolean(row.is_critical),
      state: row.state,
    });
    grouped.set(row.request_id, request);
  }
  const isOpen = new Date(round.expires_at).getTime() > now && asar.lifecycle_status === "PUBLISHED";
  const canDeliver = isOpen && new Date(asar.starts_at).getTime() > now;
  const requests = [...grouped.values()].map(({ lastSentAt, deliveryAttempts, ...request }) => ({
    ...request,
    canRemind: canDeliver && canSendReconfirmationReminder({
      deliveryStatus: request.deliveryStatus,
      deliveryAttempts,
      reminderCount: request.reminderCount,
      lastSentAt,
      hasPendingItems: request.items.some((item) => item.state === "PENDING"),
    }, now),
  }));
  const items = requests.flatMap((request) => request.items);
  return {
    eligibility,
    round: {
      id: round.id,
      createdAt: round.created_at,
      expiresAt: round.expires_at,
      isOpen,
      canDeliver,
      totalPeople: requests.length,
      answeredPeople: requests.filter((request) => request.items.every((item) => item.state !== "PENDING")).length,
      totalItems: items.length,
      confirmedItems: items.filter((item) => item.state === "CONFIRMED").length,
      pendingItems: items.filter((item) => item.state === "PENDING").length,
      cancelledItems: items.filter((item) => item.state === "CANCELLED").length,
      criticalPendingItems: items.filter((item) => item.isCritical && item.state === "PENDING").length,
      requests,
    },
  };
}
