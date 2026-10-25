import type { ControlDefinition } from "@incidentrank/simulator";

/** How often a worker sends a liveness heartbeat to the Coordination
 * Service. A longer interval means the Coordination Service takes
 * longer to notice a worker has actually gone silent, but a SHORTER
 * interval alone does not fix anything if the Coordination Service's
 * own ownership table is the thing serving stale reads — it just means
 * workers report in more often against a table that is still wrong. */
export const HEARTBEAT_INTERVAL_SECONDS_KEY = "heartbeatIntervalSeconds";

/** How long a worker's ownership lease over its assigned batch of work
 * items is valid before the Coordination Service is willing to treat it
 * as expired and reassignable. A short lease reassigns abandoned work
 * faster but also makes a live, still-working, merely-slow-to-renew
 * worker more likely to have its batch reassigned out from under it
 * while it is still legitimately processing. */
export const LEASE_DURATION_SECONDS_KEY = "leaseDurationSeconds";

/** The durable correctness fix: every work-item write is stamped with
 * the ownership generation/epoch the worker held at assignment time,
 * and the Shared Scheduling/Ownership State rejects any completion
 * write carrying an epoch older than the current one on record for that
 * item. This makes a superseded worker's late write harmless — and,
 * critically, is checked per WORK ITEM at commit time, not per lock —
 * so it stays correct even while thousands of items are being
 * reassigned at once across a reconciliation pass. */
export const OWNERSHIP_FENCING_ENABLED_KEY = "ownershipFencingEnabled";

/** Whether a periodic full reconciliation pass runs: the Coordination
 * Service re-derives ground truth ownership from first principles
 * (which workers are actually alive, which items are actually claimed)
 * and corrects the ownership table's drift, rather than relying only on
 * incremental heartbeat/lease updates layered on top of whatever the
 * table already (possibly wrongly) believes. */
export const OWNERSHIP_RECONCILIATION_ENABLED_KEY = "ownershipReconciliationEnabled";

/** Number of workers pulling batches of work items from the
 * Coordination Service concurrently. Higher concurrency increases how
 * many batches are in flight — and therefore how many items are
 * simultaneously exposed to a stale ownership read — without, on its
 * own, causing or preventing staleness. */
export const WORKER_CONCURRENCY_KEY = "workerConcurrency";

/** How the Coordination Service reacts when it cannot confirm a
 * worker's current heartbeat/lease state: "conservative" leaves
 * ownership exactly as last recorded until it can positively confirm a
 * worker is gone (risks whole cohorts of items sitting unowned/missed
 * if the record was already stale), "aggressive" immediately
 * reassigns anything it cannot confirm to a new worker (risks mass
 * duplicate ownership if the original worker was actually still alive
 * and the record was merely stale, not actually abandoned). */
export const FAILOVER_MODE_KEY = "failoverMode";

export const controls: ControlDefinition[] = [
  {
    key: HEARTBEAT_INTERVAL_SECONDS_KEY,
    allowedValues: [5, 15, 30, 60],
    initialValue: 30,
  },
  {
    key: LEASE_DURATION_SECONDS_KEY,
    allowedValues: [10, 30, 60, 120],
    initialValue: 30,
  },
  {
    key: OWNERSHIP_FENCING_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: OWNERSHIP_RECONCILIATION_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: WORKER_CONCURRENCY_KEY,
    allowedValues: [4, 8, 16, 32],
    initialValue: 8,
  },
  {
    key: FAILOVER_MODE_KEY,
    allowedValues: ["conservative", "aggressive"],
    initialValue: "conservative",
  },
];
