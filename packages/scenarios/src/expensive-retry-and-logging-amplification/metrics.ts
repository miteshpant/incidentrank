import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Customer/system health (stays acceptable almost everywhere) ─────
  // This incident never presents as an outage. requestSuccessRate stays
  // high throughout nearly every reachable state, including the worst
  // cost/audit states — a candidate who only watches success rate will
  // see nothing wrong. The External Dependency itself is never
  // meaningfully degraded by any rule (a real decoy, see architecture.ts).
  requestSuccessRate: 99.7,

  // ── The real symptom: cost, not availability ─────────────────────────
  // Monthly dependency request cost driven by retry volume (both real
  // first-attempt traffic AND wasted retries). Climbs with retryCount
  // and with duplicated retryOwnership; shrinks as those are corrected.
  dependencyRequestCostUsdPerMonth: 38_000,

  // Monthly logging ingestion+storage cost driven by loggingLevel,
  // payloadLoggingMode, and retentionMode together.
  loggingCostUsdPerMonth: 61_000,

  // Monthly telemetry ingestion cost driven by samplingRatePercent and
  // telemetryDuplication together.
  telemetryCostUsdPerMonth: 44_000,

  // Combined monthly observability+dependency cost overrun, expressed as
  // a percentage above the pre-deploy healthy baseline — the single
  // headline number a candidate watches to judge whether their changes
  // are actually reducing waste. 0 means fully back to the pre-deploy
  // baseline cost.
  costOverrunPercent: 210,

  // ── Operational debugging signal (a REQUIRED invariant) ─────────────
  // Percentage of routine operational issues that can still be
  // root-caused from available logs/telemetry. 100 means debugging
  // signal is fully sufficient. Reducing noise (sampling, dedup, payload
  // mode, tiering) does NOT reduce this — those levers remove waste, not
  // signal. Only loggingLevel = "off" meaningfully destroys this.
  operationalDebugSignalPercent: 100,

  // ── Security/audit integrity (a REQUIRED invariant, non-resetting) ──
  // Generic string-state summary of whether required audit/security log
  // coverage is currently intact.
  //   "intact"        — every required audit/security log line is being
  //                      captured, at its required retention, right now.
  //   "blind-window"   — REQUIRED audit/security logging is currently
  //                      disabled or has lost required fields; an
  //                      observability blind window is ACTIVE right now.
  auditLogIntegrityStatus: "intact",

  // Total number of seconds, over the life of this attempt, during which
  // REQUIRED audit/security logging was disabled (auditLogIntegrityStatus
  // === "blind-window"). Only ever increases while a blind window is
  // actively open. Restoring logging stops NEW accrual but never
  // decrements this count — the seconds already spent unable to see what
  // happened are a permanent, irreversible historical consequence: "we
  // cannot see what happened during this window" is true forever, even
  // after logging is turned back on.
  cumulativeAuditLogBlindWindowSeconds: 0,

  // Generic string-state summary of overall cost/observability posture,
  // read by success/acceptable conditions and by scoring.
  //   "unaddressed"        — the deploy's cost regression is still fully
  //                          present; no corrective action taken yet.
  //   "retry-amplification-reduced" — retry volume/ownership corrected,
  //                          logging/telemetry noise still largely
  //                          untouched (alternate strong path A's
  //                          dominant lever).
  //   "telemetry-noise-reduced"     — logging/telemetry noise corrected,
  //                          retries left as originally deployed
  //                          (alternate strong path B's dominant lever).
  //   "cost-optimized-safe"         — cost brought back down to the
  //                          healthy baseline via a safe combination,
  //                          with every REQUIRED invariant intact.
  //   "cost-cut-unsafe"             — cost looks excellent (often the
  //                          lowest reachable number in the scenario)
  //                          but REQUIRED audit/security logging has been
  //                          disabled to get there. Never safe, however
  //                          good the cost number looks.
  costPosture: "unaddressed",
};
