import assert from "node:assert/strict";
import test from "node:test";
import { calculateReadiness, canTransition, quantities } from "../lib/domain.ts";

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
