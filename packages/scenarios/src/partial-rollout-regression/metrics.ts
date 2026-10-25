import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  oldVersionErrorRate: 0.2,
  newVersionErrorRate: 0.3,
  oldVersionLatencyMs: 110,
  newVersionLatencyMs: 130,
  customerSuccessRate: 99.7,
  sharedDependencyPressure: 20,
  newVersionMemoryUsageMb: 420,
  rolloutState: "normal",
  // Generic string-state field (Phase 6.1 precedent) distinguishing WHY the
  // system looks healthy: "regression-removed" (rollback or feature flag
  // disabled — the actual regressed code/feature no longer runs for any
  // live traffic) vs "masked" (scaled/isolated/protected around the
  // regression while it's still running for some users) vs "unresolved".
  // Read only by successCondition/acceptableCondition/scoring, never by
  // scenario-specific scorer code.
  regressionHealth: "unresolved",
};
