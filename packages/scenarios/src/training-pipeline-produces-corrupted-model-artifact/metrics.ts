import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Infrastructure health (the DECOY signal) ────────────────────────
  // Trainer and Deployment Pipeline stay healthy/fast the ENTIRE
  // incident, by design — the root cause is a bad TRAINING DATASET
  // producing a semantically wrong artifact, not an infrastructure
  // failure anywhere. A candidate who only watches these two numbers
  // never discovers anything is wrong: the corrupted artifact trains
  // successfully, passes basic health checks, and could be deployed
  // without a single infrastructure error occurring anywhere.
  trainingPipelineSuccessRate: 100,
  deploymentPipelineUptimePercent: 99.95,

  // ── Artifact trust (the REAL problem) ────────────────────────────────
  // 0-100 semantic trust score of the artifact currently eligible for
  // promotion, as measured against an independently-trusted held-out
  // validation slice. 100 is fully trustworthy. A shallow health check
  // (promotionGateMode="shallow-check") never reads this at all — it is
  // only ever observed once trust-validation is actually engaged, which
  // is the entire point: the corrupted artifact already passes every
  // check a shallow gate performs.
  artifactValidationScore: 100,
  // Percentage of live predictions the CURRENTLY SERVING artifact is
  // getting wrong, as discovered by downstream outcome tracking — not a
  // crash, not a latency problem, just a silently incorrect answer.
  modelOutputErrorRatePercent: 2,

  // ── Candidate-visible trust/lineage summaries (state, not controls) ──
  // Trust status of whatever artifact is CURRENTLY being served to
  // production traffic right now.
  //   "trusted"            — the serving artifact has passed real
  //                           trust-validation (or is a confirmed-good
  //                           rollback target); production traffic is
  //                           safe.
  //   "corrupted-serving"  — the serving artifact is the corrupted one
  //                           and it is STILL answering live traffic
  //                           right now. Never safe, regardless of any
  //                           other metric.
  //   "quarantined"        — the corrupted artifact has been pulled from
  //                           serving; nothing corrupted is currently
  //                           answering live traffic (whatever replaced
  //                           it may still be degraded-but-safe, e.g.
  //                           mid-retrain hold).
  currentServingArtifactTrustStatus: "trusted",
  // Whether a new artifact could reach Deployment Pipeline right now
  // without passing a real trust check.
  //   "promotion-open"     — a shallow-check-only artifact could reach
  //                          production right now; nothing is blocking
  //                          it.
  //   "promotion-blocked"  — promotion is held open until a real
  //                          trust-validation pass completes.
  promotionGateStatus: "promotion-open",
  // Auditability of the full chain: which dataset produced which
  // artifact, and which artifact is currently serving.
  //   "complete"     — every artifact's lineage (source dataset,
  //                    training run, promotion/serving history) remains
  //                    fully intact and auditable, including the
  //                    corrupted one.
  //   "compromised"  — a corrupted artifact's record was deleted and
  //                    overwritten; it is no longer possible to prove
  //                    which artifact served which requests during the
  //                    exposure window. PERMANENT once reached — see
  //                    rules.ts; nothing later restores it.
  lineageAuditStatus: "complete",

  // ── Historical / cumulative damage (phase6e3.md's doctrine) ──────────
  // Cumulative count of real business decisions made using the
  // corrupted model's output while it was actually serving live
  // traffic. This can only ever increase while exposure is active —
  // there is no control, mode, or elapsed time that reduces it. A
  // decision already made on a corrupted model's output is a real,
  // permanent business-risk exposure, not a recoverable backlog state.
  // See rules.ts / definition.ts's numericWatchFields (trackPeak: true).
  cumulativeDecisionsOnCorruptedModel: 0,

  // ── Summary string-state field (read by scoring + success/acceptable
  // conditions as the single authoritative summary) ───────────────────
  //   "corrupted-exposure"  — the corrupted artifact is CURRENTLY
  //                           serving live traffic right now (live
  //                           violation).
  //   "safe-quarantined"    — the corrupted artifact is not serving, but
  //                           full recovery (a trusted artifact serving
  //                           AND lineage fully intact AND promotion
  //                           gated) is not yet complete.
  //   "healthy"             — fully recovered: a trusted artifact is
  //                           serving, lineage is fully intact, and
  //                           promotion requires real trust-validation.
  //   "lineage-destroyed"   — a permanent correctness violation: the
  //                           corrupted artifact's record was deleted
  //                           and overwritten. Never resolves as safe
  //                           while this holds, regardless of what the
  //                           serving artifact currently is.
  artifactRiskStatus: "healthy",

  // Severity-field summary (normal/warning/critical vocabulary only,
  // per SeverityFieldConfig) of artifact-TRUST risk specifically —
  // deliberately independent of Trainer/Deployment Pipeline, which
  // never leave "healthy" componentHealth in this scenario. This is
  // what drives reliability's criticalTimeRatio measure: time spent
  // with a corrupted artifact genuinely serving live traffic, never
  // time spent with infrastructure itself unavailable or slow.
  artifactTrustSeverity: "normal",
};
