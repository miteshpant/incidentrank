import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  FAILOVER_MODE_KEY,
  HEARTBEAT_INTERVAL_SECONDS_KEY,
  LEASE_DURATION_SECONDS_KEY,
  OWNERSHIP_FENCING_ENABLED_KEY,
  OWNERSHIP_RECONCILIATION_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  workers: "healthy",
  "coordination-service": "healthy",
  "ownership-state": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  workers: "degraded",
  "coordination-service": "degraded",
  "ownership-state": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  workers: "critical",
  "coordination-service": "critical",
  "ownership-state": "critical",
};

// Workers themselves are fine (they are doing exactly what they're
// told); the ownership table is the thing that's actually unhealthy.
const workersIdleTableCriticalHealth: Record<string, ComponentHealth> = {
  workers: "degraded",
  "coordination-service": "healthy",
  "ownership-state": "critical",
};

/**
 * Authored rule table for Distributed Coordination Failure, ordered
 * most-specific first.
 *
 * The Coordination Service's backing ownership table (tracking which
 * worker owns which batch of work items, across the whole population
 * of items — not a single lock on a single resource) begins serving
 * stale reads. This produces THREE independently observable failure
 * populations:
 *
 *   - ownershipConflictCount / duplicateWorkCompletedCount: items with
 *     more than one believed owner, and items actually finished twice.
 *   - missedWorkItemCount / schedulerBacklogCount: items with no
 *     believed owner at all, sitting unprocessed.
 *   - stalledWorkerCount: workers idle, waiting on an
 *     assignment/reassignment signal the stale table never produces.
 *
 * Mechanisms:
 *   - ownershipFencingEnabled: every completion write carries the
 *     ownership epoch the worker held at assignment time; the Shared
 *     Scheduling/Ownership State rejects a write whose epoch is stale.
 *     This is checked PER WORK ITEM at commit time, independent of how
 *     many items are reassigned at once — it drives
 *     duplicateWorkCompletedCount to zero even while conflicts exist,
 *     but does nothing for missed work, since a fenced rejection does
 *     not cause anyone to go claim the orphaned item.
 *   - ownershipReconciliationEnabled: a periodic full resync re-derives
 *     true ownership from first principles, correcting BOTH conflict
 *     and orphan drift at the source — the only mechanism that reduces
 *     ownershipConflictCount and missedWorkItemCount together, because
 *     it fixes the actual stale-table root cause rather than reacting
 *     to its symptoms.
 *   - failoverMode: "aggressive" without fencing reassigns anything it
 *     cannot positively confirm, producing mass duplicate ownership
 *     when the original owner was actually still alive (worse
 *     ownershipConflictCount / duplicateWorkCompletedCount).
 *     "conservative" without reconciliation instead leaves stale
 *     ownership exactly as recorded, producing mass orphaning
 *     (missedWorkItemCount / schedulerBacklogCount climb, workers sit
 *     stalled waiting for a reassignment that conservative mode will
 *     not issue).
 *   - leaseDurationSeconds / heartbeatIntervalSeconds: real levers on
 *     HOW the ownership table drifts, but neither one touches the
 *     table's own staleness — tightening them alone does not durably
 *     fix either failure population.
 *   - workerConcurrency amplifies the MAGNITUDE of whichever failure
 *     population is already occurring (more workers racing the same
 *     stale table), without independently causing or preventing it.
 */
export const distributedCoordinationFailureRules: Rule[] = [
  // ── OPTIMAL: reconciliation AND fencing both enabled. Reconciliation
  // fixes the stale-table root cause (closing both conflict and orphan
  // drift), and fencing makes the brief window before each
  // reconciliation pass safe against any duplicate completion that
  // would otherwise slip through. This is the only state that drives
  // every one of the three failure populations to zero at once.
  {
    id: "reconciliation-and-fencing-fully-safe",
    when: {
      triggerEquals: { ownershipStateStale: true },
      controlEquals: {
        [OWNERSHIP_RECONCILIATION_ENABLED_KEY]: true,
        [OWNERSHIP_FENCING_ENABLED_KEY]: true,
      },
    },
    incidentState: "reconciled-fenced-safe",
    values: {
      ownershipConflictCount: 0,
      missedWorkItemCount: 0,
      stalledWorkerCount: 0,
      staleLeaseCount: 0,
      schedulerBacklogCount: 20,
      completedWorkPerMinute: 470,
      duplicateWorkCompletedCount: 0,
      coordinationServiceStatus: "normal",
      ownershipIntegrityMode: "reconciled",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE-leaning but genuinely incomplete: reconciliation on,
  // fencing off. Reconciliation fixes the ownership table's drift at
  // the source, so conflicts and missed items both stay low and the
  // backlog recovers — but during the short window between resync
  // passes, a superseded worker's completion write can still land
  // unfenced, so a small trickle of real duplicate completions
  // continues. This is a genuine, visible improvement over baseline
  // but is NOT the fully safe state: duplicateWorkCompletedCount is
  // still greater than zero and still climbing, however slowly.
  {
    id: "reconciliation-without-fencing-residual-duplication",
    when: {
      triggerEquals: { ownershipStateStale: true },
      controlEquals: {
        [OWNERSHIP_RECONCILIATION_ENABLED_KEY]: true,
        [OWNERSHIP_FENCING_ENABLED_KEY]: false,
      },
    },
    incidentState: "reconciled-unfenced-residual-duplication",
    values: {
      ownershipConflictCount: 3,
      missedWorkItemCount: 2,
      stalledWorkerCount: 0,
      staleLeaseCount: 4,
      schedulerBacklogCount: 60,
      completedWorkPerMinute: 450,
      duplicateWorkCompletedCount: 5,
      coordinationServiceStatus: "warning",
      ownershipIntegrityMode: "reconciled-unfenced",
    },
    componentHealth: degradedHealth,
  },

  // ── Fencing on, no reconciliation, aggressive failover: fencing
  // keeps completion writes correct (duplicateWorkCompletedCount stays
  // at zero) even though the aggressive reassignment policy keeps
  // generating fresh ownership conflicts against the still-stale
  // table. Correctness holds, but the table itself never gets fixed —
  // conflicts keep forming and resolving via rejected writes rather
  // than disappearing, and the churn this creates leaves a steady
  // trickle of workers temporarily stalled waiting for their
  // reassignment to be confirmed.
  {
    id: "fenced-aggressive-no-reconciliation-safe-but-churning",
    when: {
      triggerEquals: { ownershipStateStale: true },
      controlEquals: {
        [OWNERSHIP_FENCING_ENABLED_KEY]: true,
        [OWNERSHIP_RECONCILIATION_ENABLED_KEY]: false,
        [FAILOVER_MODE_KEY]: "aggressive",
      },
    },
    incidentState: "fenced-aggressive-churning",
    values: {
      ownershipConflictCount: 14,
      missedWorkItemCount: 1,
      stalledWorkerCount: 5,
      staleLeaseCount: 10,
      schedulerBacklogCount: 90,
      completedWorkPerMinute: 410,
      duplicateWorkCompletedCount: 0,
      coordinationServiceStatus: "warning",
      ownershipIntegrityMode: "fenced-unreconciled",
    },
    componentHealth: degradedHealth,
  },

  // ── Fencing on, no reconciliation, conservative failover: fencing
  // keeps completion writes correct, and conservative failover avoids
  // generating fresh spurious conflicts — but because nothing ever
  // reconciles the table, items whose true owner actually went away
  // are never positively reassigned either. Missed work and stalled
  // workers climb instead of conflicts.
  {
    id: "fenced-conservative-no-reconciliation-orphaning",
    when: {
      triggerEquals: { ownershipStateStale: true },
      controlEquals: {
        [OWNERSHIP_FENCING_ENABLED_KEY]: true,
        [OWNERSHIP_RECONCILIATION_ENABLED_KEY]: false,
        [FAILOVER_MODE_KEY]: "conservative",
      },
    },
    incidentState: "fenced-conservative-orphaning",
    values: {
      ownershipConflictCount: 1,
      missedWorkItemCount: 22,
      stalledWorkerCount: 12,
      staleLeaseCount: 18,
      schedulerBacklogCount: 410,
      completedWorkPerMinute: 260,
      duplicateWorkCompletedCount: 0,
      coordinationServiceStatus: "critical",
      ownershipIntegrityMode: "fenced-unreconciled",
    },
    componentHealth: workersIdleTableCriticalHealth,
  },

  // ── THE TRAP: aggressive failover, no fencing, no reconciliation,
  // high worker concurrency (>= 16). Aggressive reassignment hands out
  // fresh ownership for anything it cannot positively confirm, even
  // though most of those original workers are still alive and still
  // finishing their batches — mass duplicate ownership across the
  // whole item population. With no fencing to reject the stale
  // completion writes and high concurrency multiplying how many
  // batches are racing at once, this produces the worst duplicate-
  // completion volume in the whole rule table, even though throughput
  // (completedWorkPerMinute) looks superficially fine or even elevated.
  {
    id: "aggressive-no-fencing-high-concurrency-mass-duplication",
    when: {
      triggerEquals: { ownershipStateStale: true },
      controlEquals: {
        [FAILOVER_MODE_KEY]: "aggressive",
        [OWNERSHIP_FENCING_ENABLED_KEY]: false,
        [OWNERSHIP_RECONCILIATION_ENABLED_KEY]: false,
      },
      controlAtLeast: { [WORKER_CONCURRENCY_KEY]: 16 },
    },
    incidentState: "aggressive-mass-duplication-amplified",
    values: {
      ownershipConflictCount: 95,
      missedWorkItemCount: 4,
      stalledWorkerCount: 2,
      staleLeaseCount: 40,
      schedulerBacklogCount: 180,
      completedWorkPerMinute: 520,
      duplicateWorkCompletedCount: 88,
      coordinationServiceStatus: "critical",
      ownershipIntegrityMode: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── UNSAFE: aggressive failover, no fencing, no reconciliation,
  // baseline concurrency. Same mass-duplication mechanism as above,
  // smaller in magnitude because fewer workers are racing the stale
  // table at once.
  {
    id: "aggressive-no-fencing-mass-duplication",
    when: {
      triggerEquals: { ownershipStateStale: true },
      controlEquals: {
        [FAILOVER_MODE_KEY]: "aggressive",
        [OWNERSHIP_FENCING_ENABLED_KEY]: false,
        [OWNERSHIP_RECONCILIATION_ENABLED_KEY]: false,
      },
    },
    incidentState: "aggressive-mass-duplication",
    values: {
      ownershipConflictCount: 48,
      missedWorkItemCount: 3,
      stalledWorkerCount: 1,
      staleLeaseCount: 24,
      schedulerBacklogCount: 140,
      completedWorkPerMinute: 500,
      duplicateWorkCompletedCount: 44,
      coordinationServiceStatus: "critical",
      ownershipIntegrityMode: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Partial relief: a short lease shortens how long any one stale
  // assignment record is trusted before the lease mechanism itself
  // forces re-evaluation — a real, visible reduction in stalled
  // workers and backlog growth versus baseline — but it does not touch
  // the ownership table's own staleness, so conflicts and missed items
  // both continue at a reduced but nonzero rate. Never a full fix.
  // Checked BEFORE the catch-all conservative-baseline rule below,
  // since this is the more specific condition (it additionally
  // constrains lease duration). Explicitly requires stalenessWidened:
  // false so the second-wave rule below (strictly more specific once
  // that trigger fires) always wins once staleness has widened,
  // rather than this rule's broader ownershipStateStale-only match
  // shadowing it.
  {
    id: "short-lease-partial-relief",
    when: {
      triggerEquals: { ownershipStateStale: true, stalenessWidened: false },
      controlAtMost: { [LEASE_DURATION_SECONDS_KEY]: 10 },
      controlEquals: {
        [FAILOVER_MODE_KEY]: "conservative",
        [OWNERSHIP_FENCING_ENABLED_KEY]: false,
        [OWNERSHIP_RECONCILIATION_ENABLED_KEY]: false,
      },
    },
    incidentState: "short-lease-partial-relief",
    values: {
      ownershipConflictCount: 10,
      missedWorkItemCount: 18,
      stalledWorkerCount: 6,
      staleLeaseCount: 12,
      schedulerBacklogCount: 260,
      completedWorkPerMinute: 320,
      duplicateWorkCompletedCount: 7,
      coordinationServiceStatus: "critical",
      ownershipIntegrityMode: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Trap: shortening the heartbeat interval alone. Workers report
  // liveness more often, but the Coordination Service's own ownership
  // table is still the thing serving stale reads — more frequent
  // heartbeats against a table that is wrong do not make the table
  // right. Conflict/missed-item/stalled-worker counts are essentially
  // unchanged from the conservative baseline; only staleLeaseCount
  // ticks down slightly because lease state is reported more often.
  // Checked before the catch-all conservative-baseline rule for the
  // same more-specific-first reason as short-lease-partial-relief
  // above; the two are mutually exclusive on lease duration (<=10 vs
  // this rule's implicit >10, since a short lease would have already
  // matched the rule above) so ordering between them does not matter.
  // Also explicitly requires stalenessWidened: false, for the same
  // reason as short-lease-partial-relief above.
  {
    id: "faster-heartbeat-alone-no-durable-effect",
    when: {
      triggerEquals: { ownershipStateStale: true, stalenessWidened: false },
      controlAtMost: { [HEARTBEAT_INTERVAL_SECONDS_KEY]: 5 },
      controlEquals: {
        [FAILOVER_MODE_KEY]: "conservative",
        [OWNERSHIP_FENCING_ENABLED_KEY]: false,
        [OWNERSHIP_RECONCILIATION_ENABLED_KEY]: false,
      },
    },
    incidentState: "faster-heartbeat-no-effect",
    values: {
      ownershipConflictCount: 6,
      missedWorkItemCount: 33,
      stalledWorkerCount: 13,
      staleLeaseCount: 24,
      schedulerBacklogCount: 500,
      completedWorkPerMinute: 215,
      duplicateWorkCompletedCount: 4,
      coordinationServiceStatus: "critical",
      ownershipIntegrityMode: "unresolved",
    },
    componentHealth: workersIdleTableCriticalHealth,
  },

  // ── UNSAFE baseline: conservative failover, no fencing, no
  // reconciliation. This is where the incident lands with zero
  // candidate action — the table is stale, conservative mode refuses
  // to reassign anything it cannot positively confirm, so a growing
  // cohort of items sit with no believed owner at all and a growing
  // cohort of workers sit idle waiting for assignments the table will
  // not produce. Backlog climbs continuously; this never
  // self-stabilizes. Checked only after the two more-specific partial-
  // relief/trap rules above, which additionally constrain lease
  // duration / heartbeat interval. Explicitly requires
  // stalenessWidened: false so the second-wave rule below always wins
  // once staleness has widened.
  {
    id: "conservative-baseline-mass-orphaning",
    when: {
      triggerEquals: { ownershipStateStale: true, stalenessWidened: false },
      controlEquals: {
        [FAILOVER_MODE_KEY]: "conservative",
        [OWNERSHIP_FENCING_ENABLED_KEY]: false,
        [OWNERSHIP_RECONCILIATION_ENABLED_KEY]: false,
      },
    },
    incidentState: "conservative-baseline-orphaning",
    values: {
      ownershipConflictCount: 6,
      missedWorkItemCount: 35,
      stalledWorkerCount: 14,
      staleLeaseCount: 28,
      schedulerBacklogCount: 520,
      completedWorkPerMinute: 210,
      duplicateWorkCompletedCount: 4,
      coordinationServiceStatus: "critical",
      ownershipIntegrityMode: "unresolved",
    },
    componentHealth: workersIdleTableCriticalHealth,
  },

  // ── Second wave, baseline continuation: replication lag behind the
  // ownership table widens further. Only reachable once no mitigation
  // above has matched — deepens the already-visible orphaning problem
  // rather than introducing a new one.
  {
    id: "staleness-widened-baseline",
    when: {
      triggerEquals: { ownershipStateStale: true, stalenessWidened: true },
      controlEquals: {
        [FAILOVER_MODE_KEY]: "conservative",
        [OWNERSHIP_FENCING_ENABLED_KEY]: false,
        [OWNERSHIP_RECONCILIATION_ENABLED_KEY]: false,
      },
    },
    incidentState: "staleness-widened-orphaning",
    values: {
      ownershipConflictCount: 8,
      missedWorkItemCount: 70,
      stalledWorkerCount: 22,
      staleLeaseCount: 45,
      schedulerBacklogCount: 900,
      completedWorkPerMinute: 120,
      duplicateWorkCompletedCount: 4,
      coordinationServiceStatus: "critical",
      ownershipIntegrityMode: "unresolved",
    },
    componentHealth: workersIdleTableCriticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      ownershipConflictCount: 0,
      missedWorkItemCount: 0,
      stalledWorkerCount: 0,
      staleLeaseCount: 0,
      schedulerBacklogCount: 10,
      completedWorkPerMinute: 480,
      duplicateWorkCompletedCount: 0,
      coordinationServiceStatus: "normal",
      ownershipIntegrityMode: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
