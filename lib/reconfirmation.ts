import type { CommitmentStatus } from "./domain";
import type { AsarTimeMode, ReconfirmationDeliveryStatus, ReconfirmationItemState } from "./types";

export const RECONFIRMATION_WINDOW_MS = 48 * 60 * 60 * 1000;
export const RECONFIRMATION_REMINDER_DELAY_MS = 6 * 60 * 60 * 1000;

const PERIOD_LENGTH_HOURS: Record<AsarTimeMode, number> = {
  EXACT: 0,
  MORNING: 3,
  AFTERNOON: 5,
  EVENING: 6,
  FLEXIBLE: 12,
};

export type ReconfirmationWindowReason = "INVALID_SCHEDULE" | "TOO_EARLY" | "STARTED";

export function reconfirmationExpiry(startsAt: string, timeMode: AsarTimeMode) {
  const start = new Date(startsAt).getTime();
  if (!Number.isFinite(start)) return "";
  return new Date(start + PERIOD_LENGTH_HOURS[timeMode] * 60 * 60 * 1000).toISOString();
}

export function reconfirmationWindow(startsAt: string, timeMode: AsarTimeMode, now: number) {
  const start = new Date(startsAt).getTime();
  const expiry = reconfirmationExpiry(startsAt, timeMode);
  const expiresAt = new Date(expiry).getTime();
  if (!Number.isFinite(start) || !expiry || !Number.isFinite(expiresAt)) {
    return { isOpen: false, opensAt: "", expiresAt: "", reason: "INVALID_SCHEDULE" as const };
  }
  const opensAt = new Date(start - RECONFIRMATION_WINDOW_MS).toISOString();
  if (now < start - RECONFIRMATION_WINDOW_MS) return { isOpen: false, opensAt, expiresAt: expiry, reason: "TOO_EARLY" as const };
  if (now >= start) return { isOpen: false, opensAt, expiresAt: expiry, reason: "STARTED" as const };
  return { isOpen: true, opensAt, expiresAt: expiry };
}

export function reconfirmationParticipantRef(value: { participantKey?: string | null; normalizedContactHash: string }) {
  const key = value.participantKey?.trim();
  return key ? `participant:${key}` : `contact:${value.normalizedContactHash}`;
}

export function reconfirmationScheduleKey(startsAt: string, timeMode: AsarTimeMode) {
  const parsed = new Date(startsAt).getTime();
  const normalized = Number.isFinite(parsed) ? new Date(parsed).toISOString() : startsAt.trim();
  return `${normalized}|${timeMode}`;
}

export function canSendReconfirmationReminder(value: {
  deliveryStatus: ReconfirmationDeliveryStatus;
  deliveryAttempts: number;
  reminderCount: number;
  lastSentAt?: string | null;
  hasPendingItems?: boolean;
}, now: number) {
  if (value.hasPendingItems === false || value.deliveryStatus === "MANUAL_REQUIRED" || value.deliveryStatus === "MANUAL_LINK_ISSUED") return false;
  // A failed initial delivery may be retried once immediately. A failed
  // reminder has reminderCount=1 and cannot turn into an unlimited send loop.
  if (value.deliveryStatus === "BOT_FAILED") return !value.lastSentAt && value.reminderCount < 1 && value.deliveryAttempts < 2;
  if (value.deliveryStatus !== "BOT_SENT" || value.reminderCount >= 1 || !value.lastSentAt) return false;
  const lastSentAt = new Date(value.lastSentAt).getTime();
  return Number.isFinite(lastSentAt) && now >= lastSentAt + RECONFIRMATION_REMINDER_DELAY_MS;
}

export function quantitiesWithReconfirmation(items: Array<{
  status: CommitmentStatus;
  quantity: number;
  reconfirmationState?: ReconfirmationItemState | null;
}>) {
  return items.reduce((result, item) => {
    const cancelledByRound = item.reconfirmationState === "CANCELLED";
    const active = ["CLAIMED", "CONFIRMED", "ATTENDED"].includes(item.status) && !cancelledByRound;
    const confirmed = ["CONFIRMED", "ATTENDED"].includes(item.status)
      && item.reconfirmationState !== "PENDING"
      && !cancelledByRound;
    if (active) result.claimed += item.quantity;
    if (confirmed) result.confirmed += item.quantity;
    return result;
  }, { claimed: 0, confirmed: 0 });
}
