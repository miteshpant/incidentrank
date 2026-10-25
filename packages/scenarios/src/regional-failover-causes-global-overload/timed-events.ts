import type { TimedEvent } from "@incidentrank/simulator";

// Region A degrades severely enough that it can no longer serve its own
// traffic. The global router's automatic failover begins immediately
// under whatever FAILOVER_CAP_KEY/LOW_PRIORITY_TRAFFIC_KEY/
// CACHE_PROTECTION_KEY/DB_CONCURRENCY_KEY values are currently set --
// including the dangerous uncapped defaults if the candidate has not
// acted yet.
const REGION_A_FAILS_MS = 30_000;

// Region A's own infrastructure has recovered enough capacity to safely
// take back SOME of its original traffic, independent of whatever the
// candidate has done to Region B/C. This is a genuine, independent
// external event -- Region A reporting recovered capacity does not, by
// itself, mean B/C have finished draining the backlog/cold-cache pressure
// they accumulated. REGION_A_RESTORATION_KEY must also be set by the
// candidate to actually act on this.
const REGION_A_CAPACITY_RETURNS_MS = REGION_A_FAILS_MS + 3 * 60_000;

// The recovery-lag window: how long Region B/C need, once failover
// pressure has genuinely been brought within safe bounds (capacity-
// managed or better), to actually drain their queue, re-warm their
// caches, and bring DB utilization back down -- rules.ts gates the fully
// "restored-safely" / drained state on this having elapsed, never on the
// candidate's action alone. Modeled as its own timed trigger so a
// candidate who restores traffic to Region A before this window has
// elapsed is observably racing real, elapsing recovery time, not a
// hidden instantaneous flag.
const REGION_BC_DRAIN_WINDOW_ELAPSED_MS = REGION_A_CAPACITY_RETURNS_MS + 2 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "region-a-fails",
    atMs: REGION_A_FAILS_MS,
    type: "TRIGGER_SET",
    message:
      "Region A has degraded severely and can no longer serve its own traffic. The global router's automatic failover is redirecting Region A's traffic toward Region B and Region C.",
    setTriggers: { regionAFailed: true },
  },
  {
    id: "region-a-capacity-returns",
    atMs: REGION_A_CAPACITY_RETURNS_MS,
    type: "TRIGGER_SET",
    message:
      "Region A's own infrastructure has recovered enough capacity to safely take back some of its original traffic. Region B and Region C's recovery from the failover window is independent of this and has not yet completed.",
    setTriggers: { regionAFailed: true, regionACapacityReturned: true },
  },
  {
    id: "region-bc-drain-window-elapsed",
    atMs: REGION_BC_DRAIN_WINDOW_ELAPSED_MS,
    type: "TRIGGER_SET",
    message:
      "Enough time has passed for Region B and Region C to fully drain their accumulated backlog and re-warm their caches, provided they were kept within safe capacity during the failover window.",
    setTriggers: {
      regionAFailed: true,
      regionACapacityReturned: true,
      regionBcDrainWindowElapsed: true,
    },
  },
];

export {
  REGION_A_FAILS_MS,
  REGION_A_CAPACITY_RETURNS_MS,
  REGION_BC_DRAIN_WINDOW_ELAPSED_MS,
};
