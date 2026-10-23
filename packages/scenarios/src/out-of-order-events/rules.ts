import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CONSUMER_PARALLELISM_KEY,
  DELAYED_PROCESSING_TOLERANCE_KEY,
  PARTITION_KEY_STRATEGY_KEY,
  REORDER_BUFFER_ENABLED_KEY,
  SEQUENCE_VALIDATION_ENABLED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  producers: "healthy",
  "event-stream": "healthy",
  consumers: "healthy",
  "materialized-state": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  producers: "healthy",
  "event-stream": "degraded",
  consumers: "degraded",
  "materialized-state": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  producers: "healthy",
  "event-stream": "degraded",
  consumers: "critical",
  "materialized-state": "critical",
};

const streamHealthyConsumersCriticalHealth: Record<string, ComponentHealth> = {
  producers: "healthy",
  "event-stream": "healthy",
  consumers: "critical",
  "materialized-state": "critical",
};

/**
 * Authored rule table for Out-of-Order Events, ordered most-specific
 * first. The routing change moved partition keying to round-robin to
 * absorb rising producer throughput; the side effect is that events for
 * the same account can now land on different partitions and be processed
 * out of causal order by independently-scheduled consumers.
 *
 * Two genuinely distinct recovery strategies exist:
 *
 *   1. Re-key by account id (+ reorder buffer for in-flight skew) —
 *      fully restores per-account ordering. Violations drop to zero and
 *      STAY at zero. Slower (reorder buffer adds latency, round-robin's
 *      throughput headroom is given up), but unconditionally safe.
 *
 *   2. Keep round-robin for its throughput AND enable BOTH sequence
 *      validation and the reorder buffer with a long enough tolerance
 *      window — violations keep occurring (cross-partition skew is still
 *      physically happening), but sequence validation catches every
 *      stale write before it lands, and the reorder buffer's held events
 *      drain through reconciliation at a rate that matches or exceeds the
 *      violation rate. unreconciledViolationCount is real and tracked,
 *      and in this configuration it never grows past its initial
 *      transient — it is proven bounded and self-correcting, not merely
 *      asserted safe.
 *
 * Every other round-robin configuration is a trap: it either doesn't
 * reconcile at all (nothing draining the backlog) or reconciles too
 * slowly to keep pace (one of the two safeguards missing, or too short a
 * tolerance window), so unreconciledViolationCount grows without bound
 * even while eventsPerSecond/consumerLagMessages look perfectly healthy.
 */
export const outOfOrderEventsRules: Rule[] = [
  // ── Optimal recovery: account-id-keyed partitioning restores the
  // physical guarantee that every account's events land on one
  // partition, processed in order by the single consumer that owns it.
  // The reorder buffer drains any events still in flight from the
  // round-robin window. Violations hit and stay at zero regardless of
  // consumer parallelism or validation settings, because the root cause
  // (cross-partition skew) no longer exists. Throughput per consumer is
  // intentionally lower than the round-robin paths below — the explicit
  // tradeoff this scenario is built around.
  {
    id: "rekeyed-with-reorder-buffer-recovery",
    when: {
      triggerEquals: { routingChangeActive: true },
      controlEquals: {
        [PARTITION_KEY_STRATEGY_KEY]: "account-id-keyed",
        [REORDER_BUFFER_ENABLED_KEY]: true,
      },
    },
    incidentState: "ordering-restored",
    values: {
      eventsPerSecond: 1_350,
      consumerLagMessages: 60,
      orderingViolationRate: 0,
      unreconciledViolationCount: 0,
      reconciliationRatePerSecond: 0,
      staleStateCorrectionRate: 0,
      materializedStateStatus: "normal",
      orderingIntegrityMode: "ordering-preserved",
    },
    componentHealth: healthyHealth,
  },

  // ── Partial, still unsafe: re-keyed to account-id but the reorder
  // buffer is off. New events are correctly ordered going forward, but
  // the batch of events already in flight on the old round-robin layout
  // for affected accounts can still arrive out of causal order with
  // nothing to resequence them — a real, bounded but nonzero residual
  // violation stream that is not being reconciled at all.
  {
    id: "rekeyed-without-reorder-buffer-partial",
    when: {
      triggerEquals: { routingChangeActive: true },
      controlEquals: { [PARTITION_KEY_STRATEGY_KEY]: "account-id-keyed" },
    },
    incidentState: "rekeyed-draining",
    values: {
      eventsPerSecond: 1_300,
      consumerLagMessages: 90,
      orderingViolationRate: 8,
      unreconciledViolationCount: 40,
      reconciliationRatePerSecond: 0,
      staleStateCorrectionRate: 8,
      materializedStateStatus: "warning",
      orderingIntegrityMode: "unresolved",
    },
    componentHealth: degradedHealth,
  },

  // ── Acceptable: round-robin kept for throughput, but BOTH safeguards
  // are on with a tolerance window long enough for the reorder buffer to
  // actually hold events until they can be sequence-validated and
  // reconciled. reconciliationRatePerSecond (55) matches/exceeds
  // orderingViolationRate (50) and unreconciledViolationCount plateaus
  // at a small, non-growing residual — a genuine, bounded, self-
  // correcting tradeoff, not a disguised unsafe state.
  {
    id: "round-robin-with-full-safeguards-acceptable",
    when: {
      triggerEquals: { routingChangeActive: true },
      controlEquals: {
        [PARTITION_KEY_STRATEGY_KEY]: "round-robin",
        [REORDER_BUFFER_ENABLED_KEY]: true,
        [SEQUENCE_VALIDATION_ENABLED_KEY]: true,
      },
      controlAtLeast: { [DELAYED_PROCESSING_TOLERANCE_KEY]: 5_000 },
    },
    incidentState: "bounded-reconciliation",
    values: {
      eventsPerSecond: 3_100,
      consumerLagMessages: 70,
      orderingViolationRate: 50,
      unreconciledViolationCount: 12,
      reconciliationRatePerSecond: 55,
      staleStateCorrectionRate: 50,
      materializedStateStatus: "warning",
      orderingIntegrityMode: "reordering-risk",
    },
    componentHealth: degradedHealth,
  },

  // ── Harmful / UNSAFE trap: round-robin kept, reorder buffer on,
  // sequence validation on, but the tolerance window is too short (at
  // most 500ms) to let cross-partition skew actually resolve before the
  // buffer gives up. Throughput and consumer lag look just as healthy as
  // the acceptable path above, but reconciliationRatePerSecond (18) never
  // catches up to orderingViolationRate (50) — unreconciledViolationCount
  // is real, nonzero, and compounds every tick. This is exactly the
  // "healthy-looking-but-corrupt" state the scenario is designed to
  // catch: nothing in eventsPerSecond/consumerLagMessages reveals it, but
  // unreconciledViolationCount and staleStateCorrectionRate are both
  // visibly elevated and rising. controlAtMost covers both allowed
  // insufficient-tolerance values (0 and 500ms), leaving only
  // tolerance>=5_000 to fall through to the acceptable rule above.
  {
    id: "round-robin-short-tolerance-unsafe-divergence",
    when: {
      triggerEquals: { routingChangeActive: true },
      controlEquals: {
        [PARTITION_KEY_STRATEGY_KEY]: "round-robin",
        [REORDER_BUFFER_ENABLED_KEY]: true,
        [SEQUENCE_VALIDATION_ENABLED_KEY]: true,
      },
      controlAtMost: { [DELAYED_PROCESSING_TOLERANCE_KEY]: 500 },
    },
    incidentState: "unreconciled-divergence",
    values: {
      eventsPerSecond: 3_150,
      consumerLagMessages: 65,
      orderingViolationRate: 50,
      unreconciledViolationCount: 420,
      reconciliationRatePerSecond: 18,
      staleStateCorrectionRate: 50,
      materializedStateStatus: "warning",
      orderingIntegrityMode: "unsafe-divergence",
    },
    componentHealth: degradedHealth,
  },

  // ── Harmful / UNSAFE trap: round-robin kept with sequence validation
  // on but NO reorder buffer. Sequence validation correctly rejects
  // stale writes at the materialized-state boundary (so the view itself
  // never regresses to an older value), but a rejected event is simply
  // dropped from being applied rather than being held and retried —
  // nothing is reconciling the accounts whose latest event got rejected,
  // so their materialized state silently falls behind and
  // unreconciledViolationCount grows unbounded. eventsPerSecond and
  // consumerLagMessages again look completely healthy.
  {
    id: "round-robin-validation-without-buffer-unsafe",
    when: {
      triggerEquals: { routingChangeActive: true },
      controlEquals: {
        [PARTITION_KEY_STRATEGY_KEY]: "round-robin",
        [SEQUENCE_VALIDATION_ENABLED_KEY]: true,
        [REORDER_BUFFER_ENABLED_KEY]: false,
      },
    },
    incidentState: "validation-without-reconciliation",
    values: {
      eventsPerSecond: 3_200,
      consumerLagMessages: 60,
      orderingViolationRate: 50,
      unreconciledViolationCount: 380,
      reconciliationRatePerSecond: 6,
      staleStateCorrectionRate: 50,
      materializedStateStatus: "warning",
      orderingIntegrityMode: "unsafe-divergence",
    },
    componentHealth: degradedHealth,
  },

  // ── Harmful: consumer parallelism raised a lot while round-robin
  // keying is still active and no safeguards are on. More independently-
  // scheduled consumers now race to write the same accounts' materialized
  // state from different partitions, so the violation rate and
  // unreconciled backlog both get WORSE than the unmitigated baseline,
  // even though eventsPerSecond/consumerLagMessages look like the extra
  // capacity helped.
  {
    id: "scaled-consumers-amplify-divergence-harmful",
    when: {
      triggerEquals: { routingChangeActive: true },
      controlAtLeast: { [CONSUMER_PARALLELISM_KEY]: 16 },
      controlEquals: {
        [PARTITION_KEY_STRATEGY_KEY]: "round-robin",
        [SEQUENCE_VALIDATION_ENABLED_KEY]: false,
      },
    },
    incidentState: "scaled-amplified-divergence",
    values: {
      eventsPerSecond: 4_400,
      consumerLagMessages: 40,
      orderingViolationRate: 140,
      unreconciledViolationCount: 900,
      reconciliationRatePerSecond: 0,
      staleStateCorrectionRate: 140,
      materializedStateStatus: "critical",
      orderingIntegrityMode: "unsafe-divergence",
    },
    componentHealth: streamHealthyConsumersCriticalHealth,
  },

  // ── Second-wave baseline: sustained unmitigated round-robin load
  // compounds the already-visible divergence further — only reachable
  // once no mitigation above has matched.
  {
    id: "sustained-divergence-second-wave",
    when: {
      triggerEquals: { routingChangeActive: true, sustainedLoad: true },
      controlEquals: { [PARTITION_KEY_STRATEGY_KEY]: "round-robin" },
    },
    incidentState: "sustained-divergence",
    values: {
      eventsPerSecond: 3_000,
      consumerLagMessages: 55,
      orderingViolationRate: 65,
      unreconciledViolationCount: 1_400,
      reconciliationRatePerSecond: 0,
      staleStateCorrectionRate: 65,
      materializedStateStatus: "critical",
      orderingIntegrityMode: "unsafe-divergence",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: routing change active, round-robin keying, no
  // mitigation taken yet. Violations occur, nothing reconciles them, and
  // the unreconciled backlog grows every tick.
  {
    id: "round-robin-baseline-divergence",
    when: {
      triggerEquals: { routingChangeActive: true },
      controlEquals: { [PARTITION_KEY_STRATEGY_KEY]: "round-robin" },
    },
    incidentState: "divergence",
    values: {
      eventsPerSecond: 3_000,
      consumerLagMessages: 50,
      orderingViolationRate: 60,
      unreconciledViolationCount: 600,
      reconciliationRatePerSecond: 0,
      staleStateCorrectionRate: 60,
      materializedStateStatus: "critical",
      orderingIntegrityMode: "unsafe-divergence",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins (or round-robin
  // somehow not active while routingChangeActive is — not reachable given
  // the controls above but kept as a safe fallback for the active-key
  // trigger with the default account-id-keyed strategy already matched
  // by rekeyed-without-reorder-buffer-partial; this is the true pre-
  // incident baseline).
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      eventsPerSecond: 2_200,
      consumerLagMessages: 80,
      orderingViolationRate: 0,
      unreconciledViolationCount: 0,
      reconciliationRatePerSecond: 0,
      staleStateCorrectionRate: 0,
      materializedStateStatus: "normal",
      orderingIntegrityMode: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
