import { describe, expect, it } from "vitest";
import { evaluatePracticeAccess } from "./practice-access";

/**
 * Task #20 (docs/implementation_plan/phase6.md's Access Model): the
 * centralized practice-entitlement helper. No billing exists yet — free
 * scenarios are always allowed, paid scenarios are always locked for
 * everyone in practice mode. This is deliberately the ONLY place that
 * decision is made; every call site (the attempt-creation API, the
 * future library UI's lock badge) must go through this function rather
 * than re-deriving the rule.
 */
describe("evaluatePracticeAccess", () => {
  it("allows practice access to a free scenario", () => {
    expect(evaluatePracticeAccess({ isFree: true })).toEqual({ allowed: true });
  });

  it("locks practice access to a paid scenario", () => {
    expect(evaluatePracticeAccess({ isFree: false })).toEqual({
      allowed: false,
      reason: "paid_scenario_locked",
    });
  });

  it("locks a paid scenario even when devUnlockPaid is explicitly false", () => {
    expect(evaluatePracticeAccess({ isFree: false }, { devUnlockPaid: false })).toEqual({
      allowed: false,
      reason: "paid_scenario_locked",
    });
  });

  it("unlocks a paid scenario when devUnlockPaid is true", () => {
    expect(evaluatePracticeAccess({ isFree: false }, { devUnlockPaid: true })).toEqual({
      allowed: true,
    });
  });
});
