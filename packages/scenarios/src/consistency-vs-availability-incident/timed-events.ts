import type { TimedEvent } from "@incidentrank/simulator";

// Cross-region connectivity between Region A and Region B degrades --
// confirmations between the two regions start timing out. The
// observable precursor the candidate sees immediately is
// regionConnectivity flipping to "degraded"; whatever happens to
// balanceCorrectnessViolations/catalogStalenessSeconds next depends
// entirely on the consistency-mode controls already in effect at that
// moment.
const CONNECTIVITY_DEGRADED_MS = 30_000;

// Second wave: cross-region connectivity is restored. This is a real,
// independent external event with its own observable precursor --
// regionConnectivity flips back to "healthy" the moment it happens --
// never a hidden timer. What matters afterward is whatever backlog
// (queued balance writes, divergent catalog keys) accumulated during the
// degraded window, which is itself fully visible throughout via
// balanceWriteQueueDepth / catalogDivergentKeyCount.
const CONNECTIVITY_RESTORED_MS = CONNECTIVITY_DEGRADED_MS + 4 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "connectivity-degraded",
    atMs: CONNECTIVITY_DEGRADED_MS,
    type: "TRIGGER_SET",
    message:
      "Cross-region connectivity between Region A and Region B has degraded. Confirmations between the two regions are timing out.",
    setTriggers: { connectivityDegraded: true },
  },
  {
    id: "connectivity-restored",
    atMs: CONNECTIVITY_RESTORED_MS,
    type: "TRIGGER_SET",
    message:
      "Cross-region connectivity between Region A and Region B has been restored. Confirmations between the two regions are succeeding again.",
    setTriggers: { connectivityDegraded: true, connectivityRestored: true },
  },
];

export { CONNECTIVITY_DEGRADED_MS, CONNECTIVITY_RESTORED_MS };
