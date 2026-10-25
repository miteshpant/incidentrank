import type { TimedEvent } from "@incidentrank/simulator";

const REGRESSION_ACTIVE_MS = 30_000;
// A second wave: sustained elevated retry/error volume from the new
// version's regressed feature finally saturates the shared dependency's
// connection/credit pool used by BOTH versions — but only as the
// continuation of an already-visible trend (sharedDependencyPressure has
// already been elevated and rising since REGRESSION_ACTIVE_MS for anyone
// who left the regressed feature live at meaningful rollout). A candidate
// watching sharedDependencyPressure climb has every reason to expect this
// is heading toward cross-version contamination, not a surprise.
const DEPENDENCY_SATURATION_MS = REGRESSION_ACTIVE_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "new-version-regression-active",
    atMs: REGRESSION_ACTIVE_MS,
    type: "TRIGGER_SET",
    message:
      "Error rate and latency on the new version are climbing, and memory usage on new-version instances is trending upward. The old version is unaffected so far.",
    setTriggers: { regressionActive: true },
  },
  {
    id: "shared-dependency-saturating",
    atMs: DEPENDENCY_SATURATION_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained elevated load from the new version's regressed path has driven the shared dependency's connection pool toward saturation — a pool used by both versions.",
    setTriggers: { regressionActive: true, dependencySaturating: true },
  },
];

export { REGRESSION_ACTIVE_MS, DEPENDENCY_SATURATION_MS };
