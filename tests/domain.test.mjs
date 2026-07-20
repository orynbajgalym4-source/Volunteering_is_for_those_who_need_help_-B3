import assert from "node:assert/strict";
import test from "node:test";
import { calculateReadiness, canTransition, quantities } from "../lib/domain.ts";
import { validateTelegramInitDataWithToken } from "../lib/telegram-validation.ts";
import { createHmac } from "node:crypto";

function requirement(overrides = {}) {
  return { id: "r1", kind: "PERSON", title: "Водитель", description: "", requiredQuantity: 1, isCritical: true, claimedQuantity: 0, confirmedQuantity: 0, ...overrides };
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
    requirement({ id: "r2", title: "Термос", isCritical: false }),
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
