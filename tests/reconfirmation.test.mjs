import assert from "node:assert/strict";
import test from "node:test";

import { calculateReadiness } from "../lib/domain.ts";
import {
  RECONFIRMATION_REMINDER_DELAY_MS,
  RECONFIRMATION_WINDOW_MS,
  canSendReconfirmationReminder,
  quantitiesWithReconfirmation,
  reconfirmationExpiry,
  reconfirmationParticipantRef,
  reconfirmationScheduleKey,
  reconfirmationWindow,
} from "../lib/reconfirmation.ts";
import { hashToken, randomToken } from "../lib/security.ts";

const HOUR = 60 * 60 * 1000;

function requirement(overrides = {}) {
  return {
    id: "critical",
    type: "SPECIALIST",
    customTitle: "Водитель",
    description: "",
    requiredQuantity: 1,
    isCritical: true,
    claimedQuantity: 0,
    confirmedQuantity: 0,
    ...overrides,
  };
}

test("reconfirmation expiry follows the end of exact and approximate periods", () => {
  assert.equal(reconfirmationExpiry("2026-07-25T09:00:00.000Z", "EXACT"), "2026-07-25T09:00:00.000Z");
  assert.equal(reconfirmationExpiry("2026-07-25T09:00:00.000Z", "MORNING"), "2026-07-25T12:00:00.000Z");
  assert.equal(reconfirmationExpiry("2026-07-25T13:00:00.000Z", "AFTERNOON"), "2026-07-25T18:00:00.000Z");
  assert.equal(reconfirmationExpiry("2026-07-25T18:00:00.000Z", "EVENING"), "2026-07-26T00:00:00.000Z");
  assert.equal(reconfirmationExpiry("2026-07-25T12:00:00.000Z", "FLEXIBLE"), "2026-07-26T00:00:00.000Z");
  assert.equal(reconfirmationExpiry("not-a-date", "EXACT"), "");
});

test("the launch window opens exactly 48 hours before the stored start", () => {
  const startsAt = "2026-07-25T09:00:00.000Z";
  const start = Date.parse(startsAt);

  const early = reconfirmationWindow(startsAt, "EXACT", start - RECONFIRMATION_WINDOW_MS - 1);
  assert.equal(early.isOpen, false);
  assert.equal(early.reason, "TOO_EARLY");
  assert.equal(early.opensAt, "2026-07-23T09:00:00.000Z");

  assert.equal(reconfirmationWindow(startsAt, "EXACT", start - RECONFIRMATION_WINDOW_MS).isOpen, true);
  assert.equal(reconfirmationWindow(startsAt, "EXACT", start - 1).isOpen, true);

  const started = reconfirmationWindow(startsAt, "EXACT", start);
  assert.equal(started.isOpen, false);
  assert.equal(started.reason, "STARTED");
});

test("an approximate period keeps a later token expiry but cannot launch after its start", () => {
  const startsAt = "2026-07-25T09:00:00.000Z";
  const start = Date.parse(startsAt);
  const started = reconfirmationWindow(startsAt, "MORNING", start);
  assert.equal(started.isOpen, false);
  assert.equal(started.reason, "STARTED");
  assert.equal(started.expiresAt, "2026-07-25T12:00:00.000Z");
  assert.equal(reconfirmationExpiry(startsAt, "MORNING"), "2026-07-25T12:00:00.000Z");
});

test("invalid schedules never expose a reconfirmation window", () => {
  assert.deepEqual(reconfirmationWindow("invalid", "EXACT", Date.now()), {
    isOpen: false,
    opensAt: "",
    expiresAt: "",
    reason: "INVALID_SCHEDULE",
  });
});

test("participant grouping prefers Telegram identity and falls back to contact hash", () => {
  const telegram = reconfirmationParticipantRef({ participantKey: " telegram:42 ", normalizedContactHash: "same" });
  const sameTelegramOtherContact = reconfirmationParticipantRef({ participantKey: "telegram:42", normalizedContactHash: "other" });
  const guest = reconfirmationParticipantRef({ participantKey: null, normalizedContactHash: "same" });
  const blankKeyGuest = reconfirmationParticipantRef({ participantKey: "  ", normalizedContactHash: "same" });

  assert.equal(telegram, "participant:telegram:42");
  assert.equal(sameTelegramOtherContact, telegram);
  assert.equal(guest, "contact:same");
  assert.equal(blankKeyGuest, guest);
  assert.notEqual(telegram, guest, "identity and contact namespaces must not collide");
});

test("changing either date/time or mode produces a new schedule key", () => {
  const original = reconfirmationScheduleKey("2026-07-25T09:00:00.000Z", "EXACT");
  assert.equal(reconfirmationScheduleKey("2026-07-25T09:00:00.000Z", "EXACT"), original);
  assert.equal(reconfirmationScheduleKey("2026-07-25T14:00:00+05:00", "EXACT"), original);
  assert.notEqual(reconfirmationScheduleKey("2026-07-25T10:00:00.000Z", "EXACT"), original);
  assert.notEqual(reconfirmationScheduleKey("2026-07-25T09:00:00.000Z", "MORNING"), original);
});

test("pending freshness preserves claimed quantity but removes confirmed quantity", () => {
  assert.deepEqual(quantitiesWithReconfirmation([
    { status: "CONFIRMED", quantity: 2, reconfirmationState: "PENDING" },
  ]), { claimed: 2, confirmed: 0 });

  assert.deepEqual(quantitiesWithReconfirmation([
    { status: "CONFIRMED", quantity: 2, reconfirmationState: "CONFIRMED" },
  ]), { claimed: 2, confirmed: 2 });

  assert.deepEqual(quantitiesWithReconfirmation([
    { status: "CONFIRMED", quantity: 2, reconfirmationState: "CANCELLED" },
  ]), { claimed: 0, confirmed: 0 });
});

test("reconfirmation state cannot promote an unconfirmed or cancelled base commitment", () => {
  assert.deepEqual(quantitiesWithReconfirmation([
    { status: "CLAIMED", quantity: 1, reconfirmationState: "CONFIRMED" },
    { status: "CANCELLED", quantity: 3, reconfirmationState: "CONFIRMED" },
  ]), { claimed: 1, confirmed: 0 });
});

test("freshness drives readiness without masking a real critical gap", () => {
  const pending = quantitiesWithReconfirmation([
    { status: "CONFIRMED", quantity: 1, reconfirmationState: "PENDING" },
  ]);
  assert.equal(calculateReadiness([requirement({ claimedQuantity: pending.claimed, confirmedQuantity: pending.confirmed })]).state, "PROVISIONAL");

  const missing = quantitiesWithReconfirmation([
    { status: "CANCELLED", quantity: 1, reconfirmationState: "CANCELLED" },
  ]);
  assert.equal(calculateReadiness([requirement({ claimedQuantity: missing.claimed, confirmedQuantity: missing.confirmed })]).state, "NOT_READY");

  const fresh = quantitiesWithReconfirmation([
    { status: "CONFIRMED", quantity: 1, reconfirmationState: "CONFIRMED" },
  ]);
  assert.equal(calculateReadiness([requirement({ claimedQuantity: fresh.claimed, confirmedQuantity: fresh.confirmed })]).state, "READY");
});

test("pending optional roles affect progress but never lower READY", () => {
  const result = calculateReadiness([
    requirement({ claimedQuantity: 1, confirmedQuantity: 1 }),
    requirement({
      id: "optional",
      customTitle: "Термос",
      isCritical: false,
      claimedQuantity: 1,
      confirmedQuantity: 0,
    }),
  ]);
  assert.equal(result.state, "READY");
  assert.ok(result.percentage < 100);
});

test("a Telegram reminder unlocks at six hours and can be sent only once", () => {
  const lastSentAt = "2026-07-25T01:00:00.000Z";
  const threshold = Date.parse(lastSentAt) + RECONFIRMATION_REMINDER_DELAY_MS;
  const pendingSent = { deliveryStatus: "BOT_SENT", deliveryAttempts: 1, reminderCount: 0, lastSentAt, hasPendingItems: true };

  assert.equal(canSendReconfirmationReminder(pendingSent, threshold - 1), false);
  assert.equal(canSendReconfirmationReminder(pendingSent, threshold), true);
  assert.equal(canSendReconfirmationReminder({ ...pendingSent, reminderCount: 1 }, threshold + HOUR), false);
  assert.equal(canSendReconfirmationReminder({ ...pendingSent, hasPendingItems: false }, threshold + HOUR), false);
  assert.equal(canSendReconfirmationReminder({ ...pendingSent, lastSentAt: "invalid" }, threshold + HOUR), false);
});

test("manual delivery cannot accidentally use the Telegram reminder path", () => {
  const now = Date.parse("2026-07-25T12:00:00.000Z");
  for (const deliveryStatus of ["PENDING", "MANUAL_REQUIRED", "MANUAL_LINK_ISSUED"]) {
    assert.equal(canSendReconfirmationReminder({ deliveryStatus, deliveryAttempts: 1, reminderCount: 0, lastSentAt: "2026-07-25T01:00:00.000Z" }, now), false);
  }
});

test("a failed initial Telegram delivery has one bounded recovery attempt", () => {
  const now = Date.parse("2026-07-25T12:00:00.000Z");
  const failed = {
    deliveryStatus: "BOT_FAILED",
    deliveryAttempts: 1,
    reminderCount: 0,
    lastSentAt: null,
    hasPendingItems: true,
  };
  assert.equal(canSendReconfirmationReminder(failed, now), true);
  assert.equal(canSendReconfirmationReminder({ ...failed, deliveryAttempts: 2 }, now), false);
  assert.equal(canSendReconfirmationReminder({ ...failed, reminderCount: 1 }, now), false);
  assert.equal(canSendReconfirmationReminder({ ...failed, lastSentAt: "2026-07-25T01:00:00.000Z" }, now), false);
});

test("reconfirmation bearer tokens are URL-safe and hashed before persistence", async () => {
  const token = randomToken();
  const rotated = randomToken();
  const hash = await hashToken(token);
  const rotatedHash = await hashToken(rotated);

  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(token, rotated);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, token);
  assert.notEqual(rotatedHash, hash, "rotating a link must make the old lookup hash unusable");
});
