/** Phase 8: the caller-computed state of this user's Incident Pass with
 * respect to the scenario being evaluated — null when the user has no
 * pass at all (or isn't signed in). See apps/web/src/lib/server/
 * pass-access.ts for how this is derived from the incidentPasses table. */
export type IncidentPassAccessState =
  | "available"
  | "bound_here"
  | "bound_elsewhere";

/** Phase 9: the caller-computed paid-entitlement state — null when the
 * user has neither. See apps/web/src/lib/server/stripe/entitlements.ts's
 * evaluatePaidPracticeEntitlement for how this is derived. */
export type PaidEntitlementState = "founding_lifetime" | "pro" | null;

export type PracticeAccessResult =
  | { allowed: true; mode: "free" }
  | { allowed: true; mode: "dev_unlocked" }
  | { allowed: true; mode: "paid_entitlement"; entitlement: "founding_lifetime" | "pro" }
  | { allowed: true; mode: "incident_pass_bound_here" }
  | { allowed: false; reason: "paid_scenario_locked" }
  | { allowed: false; reason: "incident_pass_available"; passState: "available" }
  | { allowed: false; reason: "incident_pass_bound_elsewhere"; boundScenarioId?: string };

/**
 * The single centralized answer to "may this user practice-play this
 * scenario right now?" — isomorphic (client and server both import this
 * exact function; apps/web/src/lib/server/practice-access.ts re-exports
 * it for server-only call sites) so the library UI's lock state and the
 * API route's enforcement can never drift apart.
 *
 * Per docs/implementation_plan/phase6.md's Access Model: free scenarios
 * are always playable, including anonymous/signed-out candidates. A paid
 * scenario is locked by default; Phase 8 adds the Incident Pass
 * entitlement as a second way to unlock one (and only one) specific paid
 * scenario — see docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §13 and phase8loc.md Step
 * 5. This function stays pure/environment-and-DB-agnostic: callers
 * compute `incidentPassState` from a real incidentPasses lookup
 * (pass-access.ts) and `devUnlockPaid` from an env flag — never derived
 * in here.
 *
 * `allowed: true` with `mode: "incident_pass_bound_here"` means the
 * scenario may be *played*, but the pass is not yet *consumed* — that
 * happens separately, atomically, at attempt-start time (see
 * incident-passes.ts's consumeIncidentPass and POST /api/attempts). A
 * pass that is merely "available" (not yet bound to this specific
 * scenario) does NOT grant access here — the user must explicitly bind
 * it first (with the confirmation step from
 * docs/implementation_plan/phase8loc.md's "explicit UI confirmation
 * before pass binding"), so `allowed: false` with reason
 * "incident_pass_available" signals "show the bind-this-pass affordance,"
 * not "already playable."
 *
 * This function answers PRACTICE access only. Company-assigned
 * assessment attempts never call this — assessment entitlement comes
 * from a valid assessment assignment, a completely separate
 * authorization path, unaffected by whether the underlying scenario is
 * paid. A candidate completing a paid scenario through an assessment
 * still cannot independently start that same scenario in practice mode
 * afterward.
 *
 * Phase 9 (docs/implementation_plan/phase9.md §31) adds catalog-wide
 * paid entitlements (Founding lifetime, Pro subscription) with HIGHER
 * precedence than Incident Pass: Founding first, then Pro, then the
 * existing Incident Pass branches, then dev-unlock, then locked. This
 * ordering is load-bearing — a user with Pro or Founding AND an
 * available/bound Incident Pass must get `mode: "paid_entitlement"`,
 * never touching pass state at all, so the pass is never bound or
 * consumed while a broader paid entitlement already grants access
 * (phase9.md §50's "Pro + available pass → premium attempt starts
 * without consuming pass"). Callers compute `paidEntitlementState` from
 * evaluatePaidPracticeEntitlement — never derived in here, same
 * pure/environment-agnostic discipline as the rest of this function.
 */
export function evaluatePracticeAccess(
  scenario: { isFree: boolean; id?: string },
  opts?: {
    devUnlockPaid?: boolean;
    paidEntitlementState?: PaidEntitlementState;
    incidentPassState?: IncidentPassAccessState | null;
    incidentPassBoundScenarioId?: string;
  },
): PracticeAccessResult {
  if (scenario.isFree) return { allowed: true, mode: "free" };

  if (opts?.paidEntitlementState === "founding_lifetime") {
    return { allowed: true, mode: "paid_entitlement", entitlement: "founding_lifetime" };
  }
  if (opts?.paidEntitlementState === "pro") {
    return { allowed: true, mode: "paid_entitlement", entitlement: "pro" };
  }

  if (opts?.devUnlockPaid) return { allowed: true, mode: "dev_unlocked" };

  if (opts?.incidentPassState === "bound_here") {
    return { allowed: true, mode: "incident_pass_bound_here" };
  }
  if (opts?.incidentPassState === "available") {
    return { allowed: false, reason: "incident_pass_available", passState: "available" };
  }
  if (opts?.incidentPassState === "bound_elsewhere") {
    return {
      allowed: false,
      reason: "incident_pass_bound_elsewhere",
      boundScenarioId: opts.incidentPassBoundScenarioId,
    };
  }

  return { allowed: false, reason: "paid_scenario_locked" };
}
