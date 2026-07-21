import assert from "node:assert/strict";
import test from "node:test";
import { calculateReadiness, canTransition, effectiveLifecycleStatus, isRecruitmentOpen, quantities } from "../lib/domain.ts";
import { validateTelegramInitDataWithToken } from "../lib/telegram-validation.ts";
import { isAsarCategory, isRequirementType, normalizeRequirementType } from "../lib/catalog.ts";
import { createTelegramLaunchToken, createTelegramSession, validateTelegramLaunchToken, validateTelegramSession } from "../lib/telegram-session.ts";
import { createHmac } from "node:crypto";
import { normalizeMemberOffers } from "../lib/member-offers.ts";
import { buildScheduleStart, formatAsarSchedule, scheduleIsFuture, storedScheduleIsFuture } from "../lib/schedule.ts";

function requirement(overrides = {}) {
  return { id: "r1", type: "SPECIALIST", customTitle: "Водитель", description: "", requiredQuantity: 1, isCritical: true, claimedQuantity: 0, confirmedQuantity: 0, ...overrides };
}

test("critical gap keeps an asar NOT_READY", () => {
  const result = calculateReadiness([requirement()]);
  assert.equal(result.state, "NOT_READY");
  assert.deepEqual(result.missingCritical, ["Водитель"]);
});

test("claimed critical roles make readiness PROVISIONAL", () => {
  const result = calculateReadiness([requirement({ claimedQuantity: 1 })]);
  assert.equal(result.state, "PROVISIONAL");
  assert.deepEqual(result.unconfirmedCritical, ["Водитель"]);
});

test("all critical roles confirmed make readiness READY", () => {
  const result = calculateReadiness([requirement({ claimedQuantity: 1, confirmedQuantity: 1 })]);
  assert.equal(result.state, "READY");
  assert.equal(result.percentage, 100);
});

test("an unfilled non-critical role does not lower READY", () => {
  const result = calculateReadiness([
    requirement({ claimedQuantity: 1, confirmedQuantity: 1 }),
    requirement({ id: "r2", type: "MATERIAL", customTitle: "Термос", isCritical: false }),
  ]);
  assert.equal(result.state, "READY");
});

test("cancellation removes quantity from readiness", () => {
  assert.deepEqual(quantities([{ status: "CANCELLED", quantity: 1 }]), { claimed: 0, confirmed: 0 });
  assert.deepEqual(quantities([{ status: "CONFIRMED", quantity: 1 }]), { claimed: 1, confirmed: 1 });
});

test("terminal lifecycle states cannot reopen", () => {
  assert.equal(canTransition("DRAFT", "PUBLISHED"), true);
  assert.equal(canTransition("COMPLETED", "PUBLISHED"), false);
  assert.equal(canTransition("CANCELLED", "IN_PROGRESS"), false);
  assert.equal(canTransition("EXPIRED", "COMPLETED"), true);
});

test("member offers stay fixed and receive-only is exclusive", () => {
  assert.deepEqual(normalizeMemberOffers(["ADVICE", "TOOL", "ADVICE"]), ["ADVICE", "TOOL"]);
  assert.deepEqual(normalizeMemberOffers(["RECEIVE_ONLY"]), ["RECEIVE_ONLY"]);
  assert.equal(normalizeMemberOffers(["RECEIVE_ONLY", "ADVICE"]), null);
  assert.equal(normalizeMemberOffers(["ремонт" ]), null);
});

test("recruitment stays open while an asar is in progress", () => {
  assert.equal(isRecruitmentOpen("PUBLISHED"), true);
  assert.equal(isRecruitmentOpen("IN_PROGRESS"), true);
  assert.equal(isRecruitmentOpen("COMPLETED"), false);
});

test("active asars become historical 24 hours after their start", () => {
  const start = "2026-07-20T10:00:00.000Z";
  assert.equal(effectiveLifecycleStatus("PUBLISHED", start, new Date("2026-07-21T09:59:00.000Z").getTime()), "PUBLISHED");
  assert.equal(effectiveLifecycleStatus("PUBLISHED", start, new Date("2026-07-21T10:00:00.000Z").getTime()), "EXPIRED");
  assert.equal(effectiveLifecycleStatus("DRAFT", start, new Date("2026-07-30T10:00:00.000Z").getTime()), "DRAFT");
  assert.equal(effectiveLifecycleStatus("PUBLISHED", "2026-07-20T10:00", new Date("2026-07-21T05:00:00.000Z").getTime()), "EXPIRED");
});

test("Telegram initData is accepted only with a valid bot signature", async () => {
  const token = "123456:test-token";
  const authDate = Math.floor(Date.now() / 1000);
  const user = JSON.stringify({ id: 42, first_name: "Аружан", username: "aruzhan" });
  const dataCheckString = `auth_date=${authDate}\nuser=${user}`;
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const valid = new URLSearchParams({ auth_date: String(authDate), user, hash }).toString();
  const identity = await validateTelegramInitDataWithToken(valid, token);
  assert.equal(identity?.ownerKey, "telegram:42");
  assert.equal(identity?.displayName, "Аружан");
  assert.equal(await validateTelegramInitDataWithToken(valid, "wrong-token"), null);
});

test("only fixed asar categories and requirement types are accepted", () => {
  assert.equal(isAsarCategory("OTHER"), true);
  assert.equal(isAsarCategory("ремонт дома"), false);
  assert.equal(isRequirementType("TRANSPORT"), true);
  assert.equal(isRequirementType("строительная помощь"), false);
  assert.equal(normalizeRequirementType("PERSON"), "GENERAL_HELP");
});

test("Telegram server session survives page navigation and rejects tampering", async () => {
  const identity = { id: 42, ownerKey: "telegram:42", displayName: "Аружан", username: "aruzhan" };
  const session = await createTelegramSession(identity, "bot-secret", 60, 1_000);
  assert.deepEqual(await validateTelegramSession(session, "bot-secret", 1_030), identity);
  assert.equal(await validateTelegramSession(`${session}x`, "bot-secret", 1_030), null);
  assert.equal(await validateTelegramSession(session, "bot-secret", 1_061), null);
});

test("a signed bot launch token works without Telegram initData", async () => {
  const identity = { id: 73, ownerKey: "telegram:73", displayName: "Айдос", username: null };
  const token = await createTelegramLaunchToken(identity, "bot-secret", 60, 2_000);
  assert.deepEqual(await validateTelegramLaunchToken(token, "bot-secret", 2_030), identity);
  assert.equal(await validateTelegramLaunchToken(token, "wrong-secret", 2_030), null);
  assert.equal(await validateTelegramSession(token, "bot-secret", 2_030), null);
});

test("flexible schedules keep a date without inventing exact minutes", () => {
  const value = buildScheduleStart("2026-07-25", "FLEXIBLE", "");
  assert.match(value, /^2026-07-2[45]T/);
  assert.match(formatAsarSchedule(value, "FLEXIBLE", true), /время уточняется/);
  assert.equal(scheduleIsFuture("2026-07-25", "FLEXIBLE", "", new Date("2026-07-25T10:00:00Z").getTime()), true);
});

test("exact and flexible stored schedules use different future windows", () => {
  const start = "2026-07-25T09:00:00.000Z";
  const now = new Date("2026-07-25T10:00:00.000Z").getTime();
  assert.equal(storedScheduleIsFuture(start, "EXACT", now), false);
  assert.equal(storedScheduleIsFuture(start, "MORNING", now), true);
});
