import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Live availability (the DECOY signal) ────────────────────────────
  // Routing Layer and both models stay fully healthy/fast the ENTIRE
  // incident, by design — the root cause is a cost/quality-tradeoff
  // routing decision, not a serving-layer failure. A candidate who only
  // watches uptime/latency never discovers anything is wrong.
  routingLayerUptimePercent: 99.97,
  inferenceP99LatencyMs: 180,

  // ── The REAL problem: inference cost and traffic mix ────────────────
  // Percent of all requests currently being served by the Large Model.
  // Climbs once the classifier degrades and keeps climbing the longer
  // it is left unaddressed.
  largeModelTrafficSharePercent: 35,
  // Percent of all requests currently being served by the Small Model.
  smallModelTrafficSharePercent: 65,
  // Estimated current monthly inference spend implied by the live
  // traffic mix and model tiers in effect right now (read-only derived
  // display state; the authoritative cost number scoring reads is
  // state.cost.currentMonthlyCostUsd from infrastructureCost below).
  monthlyInferenceCostUsd: 9_000,

  // ── Decision-quality judgment (the SECOND axis) ─────────────────────
  // Percent of quality-critical requests whose response was actually
  // computed by the Large Model (the model this scenario's business
  // invariants require for critical traffic, absent an explicit, bounded
  // policy decision otherwise). 100 is fully healthy.
  criticalTrafficOnLargeModelPercent: 100,
  // Percent of quality-critical requests CURRENTLY being silently served
  // by the Small Model with no explicit policy sanctioning it — the
  // number that actually matters for this scenario's central judgment.
  criticalTrafficSilentlyDowngradedPercent: 0,
  // 0-100 proxy for average response quality across all traffic right
  // now, as a function of which model tier actually served each
  // request and at what compute tier.
  averageResponseQualityScore: 97,
  // How many requests-per-minute are currently tagged quality-critical
  // (vs. non-critical, which may tolerate the Small Model). Fixed
  // business context, not a lever.
  criticalRequestVolumePerMinute: 30,

  // ── Candidate-visible policy/remediation signals (state, not controls)
  // Percent of non-critical traffic currently benefiting from cached
  // response reuse (nonCriticalCacheReuse = "on").
  cacheReuseHitRatePercent: 0,
  // Rollout progress (0-100) of an in-flight classifier remediation.
  classifierRemediationProgressPercent: 0,

  // ── Historical / cumulative damage (phase6e3's doctrine) ────────────
  // Cumulative count of quality-critical requests that were actually
  // served by the Small Model with no explicit policy sanctioning it
  // during this attempt. Can only ever increase while the exposure is
  // active — there is no control, mode, or elapsed time that reduces
  // it. A quality-critical decision already served at degraded quality
  // is a real, permanent business-risk exposure, not a recoverable
  // backlog state.
  cumulativeSilentCriticalDowngradeCount: 0,

  // ── Summary string-state fields (read by scoring + success/acceptable
  // conditions as the single authoritative summaries) ─────────────────
  //   "cost-contained"   — inference cost is at or below the authored
  //                         safe ceiling, by a genuine mechanism.
  //   "cost-explosive"   — inference cost is at or above the unaddressed
  //                         baseline/compounded level.
  costStatus: "cost-contained",
  //   "protected"            — zero quality-critical requests are
  //                             currently being served by the Small
  //                             Model without an explicit policy.
  //   "silently-downgraded"  — quality-critical requests are currently
  //                             being served by the Small Model with NO
  //                             policy sanctioning it — a live violation.
  qualityProtectionStatus: "protected",
  //   "deliberate-protection" — quality is protected because the
  //                             candidate genuinely engaged a real
  //                             mechanism (quality-tiering, the
  //                             critical-segment pin, or a fully-rolled-
  //                             out classifier fix) — this is the field
  //                             acceptableCondition/successCondition
  //                             actually gate on, never
  //                             qualityProtectionStatus alone, so a
  //                             baseline attempt that merely hasn't yet
  //                             triggered a downgrade (because the
  //                             degraded classifier still routes
  //                             SOMEWHERE, just expensively) can never
  //                             pass Finish by doing nothing.
  //   "unaddressed"           — no deliberate protective mechanism has
  //                             been engaged; quality currently happens
  //                             to be intact only because the degraded
  //                             classifier has not yet produced a
  //                             downgrade, never because of anything
  //                             the candidate did.
  safetyBasis: "deliberate-protection",
  //   "criticality-aware" — routing genuinely distinguishes requests by
  //                         declared/actual criticality (quality-tiering,
  //                         or a fully-rolled-out classifier fix routing
  //                         correctly again) — the scenario's required
  //                         OPTIMAL-tier mechanism per the business
  //                         invariant "cost reduction must be achieved
  //                         by smarter routing, not blanket quality
  //                         sacrifice."
  //   "blanket"            — every request (or every request of one
  //                         model-tier bucket) is routed identically
  //                         with no per-request criticality judgment at
  //                         all, whether or not a pin happens to
  //                         protect the critical segment as a side
  //                         effect. Real, honestly safe for critical
  //                         traffic when the pin is engaged, but never
  //                         the scenario's "smarter routing" mechanism
  //                         — this is what keeps blanket-small-model-
  //                         protected and blanket-large-model at
  //                         ACCEPTABLE rather than OPTIMAL even when
  //                         cost happens to read "cost-contained."
  //   "classifier-degraded" — routing still defers entirely to the
  //                         degraded classifier's own verdict; no
  //                         deliberate judgment has been substituted at
  //                         all.
  routingJudgmentBasis: "criticality-aware",
  // Severity-field summary (normal/warning/critical) of decision-quality
  // risk specifically — deliberately independent of Routing Layer/model
  // componentHealth, which never leave "healthy" in this scenario.
  qualityRiskSeverity: "normal",
};
