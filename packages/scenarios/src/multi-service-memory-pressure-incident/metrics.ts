import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  aggregatorMemoryUtilizationPct: 22,
  dependencyAMemoryUtilizationPct: 20,
  dependencyBMemoryUtilizationPct: 18,
  dependencyCMemoryUtilizationPct: 18,
  apiServiceMemoryUtilizationPct: 20,
  gcPauseMsP99: 25,
  // Historical-damage counter (phase6d.4.md section 13): the number of
  // restart/OOM churn events any component has gone through. Never reset
  // once incurred — see rules.ts's doctrine comment. Zero before the
  // incident begins.
  restartChurnCount: 0,
  responsePayloadSizeKb: 40,
  customerEnrichmentCompletenessPct: 100,
  errorRatePct: 0,
  aggregatorStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent) tracking whether the
  // upstream root cause has actually been reduced, independent of
  // current point-in-time memory readings — read only by
  // successCondition/scoring, never by scenario-specific scorer code.
  rootCauseHealth: "unaddressed",
  // Generic string-state field tracking the pressure-transfer/recovery-
  // lag mechanism's phase: "persisting" (root cause still active, or a
  // decoy-only mitigation applied — pressure keeps re-accumulating),
  // "decaying" (root cause genuinely reduced, GC/heap decay in
  // progress but not yet complete), "clear" (decay window fully
  // elapsed).
  memoryPressureHealth: "persisting",
  // Historical-damage string field (phase6d.4.md section 17's
  // explicit "fixing current config after historical damage cannot
  // improperly restore a near-perfect score" check): "never-churned"
  // for every reachable state where restart/OOM churn never occurred,
  // "churn-scarred" once it has — frozen permanently once set, exactly
  // like restartChurnCount itself, so scoring.ts's dataIntegrity
  // dimension can penalize the SCAR independently of whether current
  // config now looks perfectly healthy. Read only by scoring, never by
  // resolution logic.
  fleetIntegrityHealth: "never-churned",
  // Dedicated correctness-bound string field, independent of
  // rootCauseHealth: "respected" for every reachable state (including
  // every merely-unaddressed-root-cause state), "violated" ONLY for the
  // maxResponseSizeKb truncation trap, which actively cuts response
  // fields past the explicit correctness bound. Kept separate from
  // rootCauseHealth so scoring.ts can penalize an active correctness
  // violation more heavily than simply "the root cause was never
  // fixed" — a correctness violation is a strictly worse failure mode,
  // per phase6d.4.md section 17's "correctness/security-violating
  // availability path heavily penalized" check.
  correctnessBoundHealth: "respected",
};
