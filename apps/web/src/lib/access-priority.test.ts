import { describe, expect, it } from "vitest";
import { evaluatePracticeAccess } from "./practice-access";

/**
 * The Phase 9 access-priority ordering matrix (docs/implementation_plan/
 * phase9.md §31/§50): free > Founding > Pro > dev-unlock > Incident Pass
 * (bound_here/available/bound_elsewhere) > locked. The load-bearing
 * property under test is that a paid entitlement NEVER falls through to
 * pass-state logic — a user holding Founding or Pro with an available or
 * even bound_elsewhere pass must still resolve to `paid_entitlement`,
 * never touching/consuming the pass (so callers never even look up pass
 * state once a paid entitlement is known, see incidents/[slug]/page.tsx
 * and api/attempts/route.ts's short-circuit).
 */
describe("evaluatePracticeAccess — Phase 9 priority ordering", () => {
  it("free scenarios are always allowed, even with no entitlement at all", () => {
    expect(evaluatePracticeAccess({ isFree: true })).toEqual({ allowed: true, mode: "free" });
  });

  it("Founding grants access to a paid scenario with no other state", () => {
    expect(
      evaluatePracticeAccess({ isFree: false }, { paidEntitlementState: "founding_lifetime" }),
    ).toEqual({ allowed: true, mode: "paid_entitlement", entitlement: "founding_lifetime" });
  });

  it("Pro grants access to a paid scenario with no other state", () => {
    expect(evaluatePracticeAccess({ isFree: false }, { paidEntitlementState: "pro" })).toEqual({
      allowed: true,
      mode: "paid_entitlement",
      entitlement: "pro",
    });
  });

  it("Founding takes priority over devUnlockPaid", () => {
    expect(
      evaluatePracticeAccess(
        { isFree: false },
        { paidEntitlementState: "founding_lifetime", devUnlockPaid: true },
      ),
    ).toEqual({ allowed: true, mode: "paid_entitlement", entitlement: "founding_lifetime" });
  });

  it("Pro takes priority over devUnlockPaid", () => {
    expect(
      evaluatePracticeAccess({ isFree: false }, { paidEntitlementState: "pro", devUnlockPaid: true }),
    ).toEqual({ allowed: true, mode: "paid_entitlement", entitlement: "pro" });
  });

  it("Founding takes priority over an available Incident Pass — pass state is irrelevant once Founding grants access", () => {
    expect(
      evaluatePracticeAccess(
        { isFree: false },
        { paidEntitlementState: "founding_lifetime", incidentPassState: "available" },
      ),
    ).toEqual({ allowed: true, mode: "paid_entitlement", entitlement: "founding_lifetime" });
  });

  it("Pro takes priority over a bound_here Incident Pass — resolves to paid_entitlement, not incident_pass_bound_here", () => {
    expect(
      evaluatePracticeAccess(
        { isFree: false },
        { paidEntitlementState: "pro", incidentPassState: "bound_here" },
      ),
    ).toEqual({ allowed: true, mode: "paid_entitlement", entitlement: "pro" });
  });

  it("Pro takes priority over a bound_elsewhere Incident Pass", () => {
    expect(
      evaluatePracticeAccess(
        { isFree: false },
        {
          paidEntitlementState: "pro",
          incidentPassState: "bound_elsewhere",
          incidentPassBoundScenarioId: "other-scenario-id",
        },
      ),
    ).toEqual({ allowed: true, mode: "paid_entitlement", entitlement: "pro" });
  });

  it("Founding is preferred over Pro when (hypothetically) both states are passed", () => {
    expect(
      evaluatePracticeAccess(
        { isFree: false },
        { paidEntitlementState: "founding_lifetime" },
      ),
    ).toEqual({ allowed: true, mode: "paid_entitlement", entitlement: "founding_lifetime" });
  });

  it("with no paid entitlement, devUnlockPaid still unlocks (Phase 8 behavior unchanged)", () => {
    expect(
      evaluatePracticeAccess(
        { isFree: false },
        { paidEntitlementState: null, devUnlockPaid: true },
      ),
    ).toEqual({ allowed: true, mode: "dev_unlocked" });
  });

  it("with no paid entitlement and no dev-unlock, a bound_here pass still grants access (Phase 8 behavior unchanged)", () => {
    expect(
      evaluatePracticeAccess(
        { isFree: false },
        { paidEntitlementState: null, incidentPassState: "bound_here" },
      ),
    ).toEqual({ allowed: true, mode: "incident_pass_bound_here" });
  });

  it("with no paid entitlement, no dev-unlock, and no pass, the scenario is locked", () => {
    expect(evaluatePracticeAccess({ isFree: false }, { paidEntitlementState: null })).toEqual({
      allowed: false,
      reason: "paid_scenario_locked",
    });
  });
});
