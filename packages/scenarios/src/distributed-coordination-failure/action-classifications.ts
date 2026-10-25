import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  FAILOVER_MODE_KEY,
  HEARTBEAT_INTERVAL_SECONDS_KEY,
  LEASE_DURATION_SECONDS_KEY,
  OWNERSHIP_FENCING_ENABLED_KEY,
  OWNERSHIP_RECONCILIATION_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per phase6c.md section 14. Ids are stable and
 * intentionally neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: OWNERSHIP_RECONCILIATION_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { ownershipStateStale: true },
    outcome: "beneficial",
    feedback: {
      title: "Re-derived ownership from first principles",
      explanation:
        "Turning on periodic reconciliation let the Coordination Service recompute true ownership directly, instead of trusting incremental updates layered on an already-stale table. Both the duplicate-ownership and missed-work populations shrank together, because this addresses the table's own staleness rather than reacting to its symptoms.",
    },
  },
  {
    id: "acr_2",
    controlKey: OWNERSHIP_FENCING_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { ownershipStateStale: true },
    outcome: "beneficial",
    feedback: {
      title: "Rejected stale completion writes at commit time",
      explanation:
        "Stamping each assignment with an ownership epoch and rejecting late writes from a superseded owner stopped work items from actually being processed twice, even while ownership conflicts kept forming against the stale table. This protects correctness directly but does not, by itself, stop items from going unclaimed — reconciliation is still needed for that.",
    },
  },
  {
    id: "acr_3",
    controlKey: FAILOVER_MODE_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { ownershipStateStale: true },
    outcome: "harmful",
    feedback: {
      title: "Reassigned work out from under workers that were still alive",
      explanation:
        "Aggressive failover reassigned any item it couldn't positively confirm, but most of the original owners were still alive and still working — without fencing to reject the resulting stale completion writes, this produced a surge of items processed more than once, worse than simply leaving the stale assignments in place.",
    },
  },
  {
    id: "acr_4",
    controlKey: WORKER_CONCURRENCY_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { ownershipStateStale: true },
    outcome: "harmful",
    feedback: {
      title: "Added more workers racing the same stale table",
      explanation:
        "Raising worker concurrency while ownership was already in conflict put more workers simultaneously racing claims against the same stale table, multiplying how many items ended up duplicated rather than relieving the backlog — concurrency amplifies whichever failure mode is already happening, it does not fix the table.",
    },
  },
  {
    id: "acr_5",
    controlKey: HEARTBEAT_INTERVAL_SECONDS_KEY,
    valueAtMost: 5,
    whenTriggerEquals: { ownershipStateStale: true },
    outcome: "neutral",
    feedback: {
      title: "Reported in more often to a table that was still wrong",
      explanation:
        "A shorter heartbeat interval means workers report liveness more frequently, but the Coordination Service's own ownership table was the thing serving stale reads — more frequent reports against a wrong table do not make it right. Conflict, missed-work, and stalled-worker counts stayed essentially unchanged.",
    },
  },
  {
    id: "acr_6",
    controlKey: LEASE_DURATION_SECONDS_KEY,
    valueAtMost: 10,
    whenTriggerEquals: { ownershipStateStale: true },
    outcome: "neutral",
    feedback: {
      title: "Forced faster re-evaluation without fixing the source",
      explanation:
        "A short lease forces assignment records to be re-evaluated more often, giving some real relief to backlog growth and stalled workers. But it does nothing about the ownership table's own staleness, so conflicts and missed work both continued at a reduced, not eliminated, rate.",
    },
  },
];
