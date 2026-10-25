import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Shared Identity (the TRUE ROOT) ─────────────────────────────────
  // Milliseconds a token-validation call currently takes. Healthy is
  // low; this is the first thing to degrade, before any product-level
  // symptom appears.
  identityValidationLatencyMs: 40,
  // Severity field summarizing Shared Identity's own health.
  identityStatus: "normal",
  // Percent of validation calls Shared Identity is currently completing
  // successfully (within its own timeout), independent of how much
  // volume is arriving — this is the signal that keeps degrading
  // further the more amplified volume is thrown at it while it is
  // already slow, and the signal that recovers once both (a) incoming
  // volume is controlled and (b) its own circuit breaker is open.
  identitySuccessRate: 99.5,

  // ── Shared Cache (protects the root) ────────────────────────────────
  // Percent of validation lookups currently served from cache rather
  // than reaching Shared Identity directly. Low under "passive" policy
  // once Identity is slow (fresh entries aren't being populated fast
  // enough); materially higher under "assist".
  cacheAssistHitRatePercent: 35,

  // ── Product-level traffic/error signals (the DIAGNOSTIC surface) ───
  // Product B is the LOUD amplifier: its own error rate and the
  // request volume it sends to the shared platform both spike hardest,
  // even though it did not cause the root degradation.
  productBErrorRatePercent: 0.4,
  productBRequestMultiplier: 1.0, // 1.0 = normal; climbs as retries amplify.
  // Product A is the QUIET starver: its own error rate barely moves,
  // but it is slowly exhausting Shared Database connections by holding
  // them open longer while waiting on slow identity validation.
  productAErrorRatePercent: 0.3,
  productAHeldConnectionCount: 20,
  // Product C is the mostly-uninvolved bystander: its own behavior
  // never changes, but it is exposed to whatever shared-platform
  // capacity remains.
  productCErrorRatePercent: 0.2,

  // ── Shared Gateway (admission surface) ──────────────────────────────
  gatewayAdmittedRequestRatePercent: 100,

  // ── Shared Metadata (identity-correctness-dependent) ────────────────
  // Whether metadata writes are currently being accepted under
  // unverified-identity conditions. "safe" means either identity is
  // fine, or writes have been switched to read-only while it is not.
  // "at-risk" means writes remain live while identity correctness is
  // actively degraded — a durability/correctness hazard, never merely
  // an availability tradeoff (business invariant #3).
  metadataWriteSafety: "safe",

  // ── Shared Messaging / Async Workers (recovery-lag subsystem #1) ────
  // Count of not-yet-consumed messages queued across all three
  // products' async workloads. Zero is healthy. Grows while
  // amplification/identity pressure is active; drains only across real
  // elapsed time once containment is genuinely engaged (never
  // instantly).
  messagingBacklogCount: 0,
  messagingStatus: "normal",

  // ── Shared Database (recovery-lag subsystem #2, durability-critical) ─
  // Percent of the shared connection pool currently in use across every
  // product plus Async Workers. High utilization under an unbounded
  // budget is what "a single product exhausting shared capacity for
  // every product" (business invariant #1) looks like concretely.
  dbConnectionPoolUtilizationPercent: 45,
  dbStatus: "normal",
  // Percent of Shared Database write attempts currently succeeding
  // without a connection-exhaustion rejection. 100 is healthy. This is
  // what collapses once the pool is genuinely exhausted.
  dbWriteSuccessRatePercent: 100,

  // ── Historical / cumulative damage (phase6d.4.md section 13) ─────────
  // Count of Shared Database connection-exhaustion rejections that have
  // ACTUALLY occurred so far. This can only ever increase while the
  // pool is genuinely exhausted (dbConnectionPoolUtilizationPercent at
  // or above its exhaustion threshold) — capping the connection budget
  // afterward stops NEW rejections but never erases ones that already
  // happened. Carried forward explicitly in every subsequent rule's
  // `values`, and additionally peak-tracked (see definition.ts's
  // numericWatchFields) as the permanent historical record available to
  // scoring even once current health is clean.
  cumulativeConnectionExhaustionCount: 0,
  // Count of requests Shared Identity has granted under fail-open
  // conditions without genuine verification. This can only ever
  // increase while identityFailureMode is "fail-open" and identity
  // correctness is actively degraded — never resettable. A single
  // unauthorized-equivalent grant via fail-open is exactly as
  // irreversible here as in Authorization Policy Rollout Failure.
  cumulativeUnverifiedGrantCount: 0,

  // ── Per-product recovery/restoration posture (state, not control) ───
  // Whether each product is currently serving degraded/isolated traffic
  // or has been restored to normal. Read by scoring/success conditions
  // as the authoritative summary of "is the platform actually safe to
  // hand back," independent of how many individual metrics look good.
  productARestorationStatus: "normal",
  productBRestorationStatus: "normal",
  productCRestorationStatus: "normal",

  // ── Generic string-state summary of the whole platform ──────────────
  //   "healthy"              — pre-incident / fully recovered.
  //   "root-degrading"       — Shared Identity degrading, nothing
  //                            contained yet.
  //   "amplifying"           — Product B's retry amplification actively
  //                            compounding load onto the platform.
  //   "starving"             — Product A's held connections actively
  //                            exhausting the DB pool.
  //   "contained"            — root protected, amplifier isolated,
  //                            backlogs not yet drained.
  //   "draining"             — containment holding, both backlogs
  //                            genuinely shrinking.
  //   "recovered"            — fully drained, safely restored.
  //   "re-cascading"         — premature restoration retriggered the
  //                            cascade.
  //   "identity-correctness-violated" — fail-open was used; never
  //                            improves regardless of later actions.
  platformStatus: "healthy",
};
