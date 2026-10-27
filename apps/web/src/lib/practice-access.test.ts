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
    expect(evaluatePracticeAccess({ isFree: true })).toEqual({
      allowed: true,
      mode: "free",
    });
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
      mode: "dev_unlocked",
    });
  });
});

/**
 * Phase 8: the Incident Pass entitlement states, per docs/
 * implementation_plan/phase8_admin_promotional_access_referrals.md §13
 * and phase8loc.md Step 5.
 */
describe("evaluatePracticeAccess — Incident Pass states", () => {
  it("grants access when the pass is bound to this exact scenario", () => {
    expect(
      evaluatePracticeAccess(
        { isFree: false },
        { incidentPassState: "bound_here" },
      ),
    ).toEqual({ allowed: true, mode: "incident_pass_bound_here" });
  });

  it("does not grant access for a merely-available (not-yet-bound) pass", () => {
    expect(
      evaluatePracticeAccess(
        { isFree: false },
        { incidentPassState: "available" },
      ),
    ).toEqual({
      allowed: false,
      reason: "incident_pass_available",
      passState: "available",
    });
  });

  it("does not grant access when the pass is bound elsewhere", () => {
    expect(
      evaluatePracticeAccess(
        { isFree: false },
        { incidentPassState: "bound_elsewhere", incidentPassBoundScenarioId: "other-id" },
      ),
    ).toEqual({
      allowed: false,
      reason: "incident_pass_bound_elsewhere",
      boundScenarioId: "other-id",
    });
  });

  it("devUnlockPaid takes priority over any pass state", () => {
    expect(
      evaluatePracticeAccess(
        { isFree: false },
        { devUnlockPaid: true, incidentPassState: "available" },
      ),
    ).toEqual({ allowed: true, mode: "dev_unlocked" });
  });
});
