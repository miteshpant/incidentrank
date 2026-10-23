import type { TimedEvent } from "@incidentrank/simulator";

const CACHE_NODE_FAILS_MS = 30_000;
// A second wave: if the lost node's capacity is never replaced and the
// database is never protected, the surviving nodes' elevated load and
// eviction churn (both already rising and candidate-visible from the
// moment the node fails, satisfying the observable-evidence rule) tip
// into a sustained database overload a few minutes later as connection
// contention compounds. This is not a hidden timer with no warning — the
// candidate-visible cacheNodeLoadPercent/evictionRatePerMinute/dbReads
// trend is the precursor; this event only narrates that the compounding
// has crossed into a harder failure mode.
const UNMITIGATED_DB_OVERLOAD_MS = CACHE_NODE_FAILS_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "cache-node-fails",
    atMs: CACHE_NODE_FAILS_MS,
    type: "TRIGGER_SET",
    message:
      "A distributed cache node has failed. Its keys are redistributing — some land on surviving nodes, others fall through to the database.",
    setTriggers: { cacheNodeDown: true },
  },
  {
    id: "unmitigated-db-overload",
    atMs: UNMITIGATED_DB_OVERLOAD_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained unprotected read pressure has pushed the primary database into connection contention.",
    setTriggers: { cacheNodeDown: true, dbOverloadCompounded: true },
  },
];

export { CACHE_NODE_FAILS_MS, UNMITIGATED_DB_OVERLOAD_MS };
