import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Legitimate-user impact (the false-positive axis) ────────────────
  legitimateUserSuccessRate: 99.5,
  legitimateUsersBlockedCount: 0,

  // ── Real abuse traffic (the SEPARATE, concurrently-present axis) ────
  // This never reaches 0 just because the false-positive problem is
  // fixed — real abuse is present independent of the bad rule, and
  // this metric tracks how much of it is CURRENTLY getting through.
  abuseRequestsAllowedRate: 0.5,

  // ── HISTORICAL / CUMULATIVE security damage (binding for this
  // scenario). Only ever increases while a broad bypass/relaxation
  // lever is active; never reset by restoring strict enforcement
  // afterward — see rules.ts and definition.ts's completion-mode audit
  // for the explicit non-reset proof. ─────────────────────────────────
  cumulativeAbuseRequestsAllowedCount: 0,

  // ── Component-level signals ──────────────────────────────────────
  detectionRuleStatus: "faulty",
  rateLimiterStatus: "normal",

  // Generic string-state field read by scoring's dataIntegrity measure
  // and by successCondition/acceptableCondition — the single
  // authoritative summary of "what kind of abuse-protection state is
  // this."
  //   "false-positives-active" — the bad rule is live and blocking
  //                    legitimate users; enforcement is otherwise
  //                    intact (no bypass of real abuse screening).
  //   "protection-bypassed" — a broad rateLimiterMode relaxation or
  //                    disablement is in effect: real abuse traffic is
  //                    measurably getting through as a direct result.
  //   "targeted-fix-applied" — the false-positive problem is being
  //                    addressed via rollback/patch/exemption while
  //                    abuse-specific protection remains fully intact.
  //   "fully-restored" — the detection rule is fixed, legitimate users
  //                    are unblocked, and abuse protection has never
  //                    been bypassed.
  abuseProtectionStatus: "false-positives-active",
};
