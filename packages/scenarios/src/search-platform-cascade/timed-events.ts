import type { TimedEvent } from "@incidentrank/simulator";

// Ranking Service latency rises moderately enough that the Query
// Coordinator begins holding connections open noticeably longer per
// query, under whatever RANKING_INCLUSION_KEY/RANKING_TIMEOUT_MS_KEY/
// QUERY_CONCURRENCY_KEY/API_CAPACITY_KEY values are currently set --
// including the dangerous "wait as long as it takes" defaults if the
// candidate has not acted yet.
const RANKING_DEGRADES_MS = 30_000;

// The recovery-lag window: how long Index Cluster A/B connection
// pressure and Feature Store QPS need, once ranking has genuinely been
// taken out of the hot path (excluded or safely bounded), to actually
// drain back down to baseline. Modeled as its own timed trigger so a
// candidate who restores ranking before this window has elapsed is
// observably racing real, elapsing recovery time, not a hidden
// instantaneous flag -- mirrors regional-failover-causes-global-
// overload's REGION_BC_DRAIN_WINDOW_ELAPSED_MS pattern exactly.
const COORDINATOR_DRAIN_WINDOW_ELAPSED_MS = RANKING_DEGRADES_MS + 2 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "ranking-service-degrades",
    atMs: RANKING_DEGRADES_MS,
    type: "TRIGGER_SET",
    message:
      "Ranking Service latency has risen moderately. The Query Coordinator is now waiting longer per query for ranking results, holding its Index Cluster A/B connections and Feature Store calls open for the extended duration.",
    setTriggers: { rankingDegraded: true },
  },
  {
    id: "coordinator-drain-window-elapsed",
    atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS,
    type: "TRIGGER_SET",
    message:
      "Enough time has passed for Index Cluster A/B connection pressure and Feature Store QPS to fully drain back to baseline, provided the Query Coordinator's dependency on Ranking was genuinely reduced during the incident.",
    setTriggers: { rankingDegraded: true, coordinatorDrainWindowElapsed: true },
  },
];

export { RANKING_DEGRADES_MS, COORDINATOR_DRAIN_WINDOW_ELAPSED_MS };
