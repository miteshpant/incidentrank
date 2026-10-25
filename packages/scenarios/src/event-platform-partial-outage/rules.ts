import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  BATCH_SIZE_KEY,
  CONSUMER_B_CONCURRENCY_KEY,
  CONSUMER_C_RETRY_MODE_KEY,
  DLQ_POLICY_KEY,
  DOWNSTREAM_CIRCUIT_BREAKER_KEY,
  PARTITION_ISOLATION_KEY,
  PRODUCER_BACKPRESSURE_KEY,
  TOPIC_A_PRIORITY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  producers: "healthy",
  "event-gateway": "healthy",
  "broker-cluster": "healthy",
  "topic-a": "healthy",
  "topic-b": "healthy",
  "topic-c": "healthy",
  "consumer-group-a": "healthy",
  "consumer-group-b": "healthy",
  "consumer-group-c": "healthy",
  "downstream-systems": "healthy",
};

const brokerDegradedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "broker-cluster": "degraded",
  "topic-b": "degraded",
  "topic-c": "degraded",
};

const allThreeCriticalHealth: Record<string, ComponentHealth> = {
  ...brokerDegradedHealth,
  "consumer-group-b": "critical",
  "consumer-group-c": "critical",
  "downstream-systems": "critical",
  "topic-b": "critical",
  "topic-c": "critical",
};

const topicAContaminatedHealth: Record<string, ComponentHealth> = {
  ...allThreeCriticalHealth,
  "broker-cluster": "critical",
  "topic-a": "critical",
};

const pressureTransferredHealth: Record<string, ComponentHealth> = {
  ...brokerDegradedHealth,
  "consumer-group-b": "healthy",
  "consumer-group-c": "degraded",
  "downstream-systems": "critical",
  "topic-b": "healthy",
  "topic-c": "degraded",
};

const brokerFixedBOutstandingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "consumer-group-b": "critical",
  "topic-b": "critical",
  "consumer-group-c": "critical",
  "downstream-systems": "critical",
  "topic-c": "degraded",
};

const brokerFixedCFixedBOutstandingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "consumer-group-b": "critical",
  "topic-b": "critical",
};

const allMitigatedDrainingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "broker-cluster": "degraded",
  "topic-b": "degraded",
  "consumer-group-b": "degraded",
  "topic-c": "degraded",
  "consumer-group-c": "degraded",
  "downstream-systems": "degraded",
};

// Masked-but-not-fixed: producer backpressure throttles ingestion at
// the Event Gateway, so the gateway/broker-facing side reads calmer
// (topicBBacklogMessages genuinely lower, brokerPartitionHealth
// slightly better than doing nothing) — but Consumer Group B's own
// processing-side lag and Consumer Group C's downstream retry storm
// are completely untouched by a producer-side lever, so
// componentHealth for those two subsystems stays exactly as critical
// as the unmitigated baseline.
const producerBackpressureMaskedHealth: Record<string, ComponentHealth> = {
  ...allThreeCriticalHealth,
  "event-gateway": "degraded",
  "broker-cluster": "degraded",
};

/**
 * Authored rule table for Event Platform Partial Outage, ordered
 * most-specific first.
 *
 * Three genuinely independent root causes are live at once:
 *   (1) broker partition class degradation (Topic B + Topic C's class;
 *       Topic A sits on a separate, healthy class),
 *   (2) Consumer Group B's own processing lag against Topic B,
 *   (3) Consumer Group C's retry storm against its degraded downstream
 *       DB/API.
 *
 * Each requires a DIFFERENT, independent fix:
 *   broker problem    -> PARTITION_ISOLATION_KEY="isolated" (fences the
 *                        degraded class's contention away from Topic A/
 *                        healthy classes) + bounded BATCH_SIZE_KEY,
 *   consumer problem  -> CONSUMER_B_CONCURRENCY_KEY raised ENOUGH, but
 *                        only genuinely safe once the downstream is
 *                        protected (see the pressure-transfer trap
 *                        below) — concurrency alone never fixes B if the
 *                        shared downstream is already saturated by C,
 *   downstream problem -> CONSUMER_C_RETRY_MODE_KEY moved off
 *                        "aggressive" (bounded or circuit-breaker)
 *                        and/or DOWNSTREAM_CIRCUIT_BREAKER_KEY enabled.
 *
 * Masking trap: PRODUCER_BACKPRESSURE_KEY throttles ingestion at the
 * Event Gateway, which is a REAL, measurable effect on the broker-
 * facing side (brokerPartitionHealth and topicBBacklogMessages both
 * read better than doing nothing) — but it is a producer-side lever
 * with zero reach into Consumer Group B's own processing lag or
 * Consumer Group C's retry storm against the downstream. Enabling it
 * alone makes the dashboard look calmer while two of the three
 * independent root causes remain completely unaddressed. See
 * "producer-backpressure-masks-without-fixing" below.
 *
 * Central pressure-transfer trap: naively raising
 * CONSUMER_B_CONCURRENCY_KEY to drain Group B's lag, while Consumer
 * Group C is STILL hammering the shared downstream in "aggressive"
 * retry mode, adds Group B's own downstream writes on top of Group C's
 * already-unmanaged retry volume — `consumerBLagMessages` genuinely
 * drops (looks like a win) while `downstreamHealthPct` gets measurably
 * WORSE than the unmitigated baseline (14 vs. 35), because two consumer
 * groups are now contending for the same degraded downstream capacity
 * the candidate never actually protected. See
 * "naive-scale-up-transfers-pressure-downstream" below.
 *
 * HISTORICAL DAMAGE (phase6d.2 section 9): if the broker partition
 * class is left UNISOLATED while under combined heavy batch load
 * (large batch size) and Consumer Group C's unmanaged retry storm, the
 * degraded class's contention bleeds into Topic A's own partition
 * class and real, durable Topic A events are dropped — the LIVE
 * `topicAEventsDroppedTotal` reading becomes nonzero (340) via the
 * "topic-a-contention-drop-active" rule below, and returns to 0 once
 * the live configuration is corrected (no NEW drops occurring right
 * now). The historical, never-reset record of this damage is
 * `topicAEventsDroppedTotal`'s PEAK value — authored as a
 * numericWatchField with trackPeak:true in definition.ts, which the
 * engine ratchets forward every tick
 * (`peakValues[key] = max(peakValues[key], currentValue)`, see
 * packages/simulator/src/tick.ts) entirely independent of whatever the
 * live rule-authored value reads afterward. Fixing the live
 * partition-isolation/batch-size configuration stops NEW drops (the
 * live reading returns to 0) but can never retroactively undo the 340
 * events that are already gone — `peaks.peakValues.
 * topicAEventsDroppedTotal` stays at 340 for the rest of the attempt no
 * matter what the candidate does afterward. Scoring and the
 * completion-mode audit both key off this peak, never the live
 * reading, for exactly this reason. This directly encodes "dropping
 * events merely to reduce lag is not acceptable" / "Topic A must
 * remain durable."
 */
export const eventPlatformPartialOutageRules: Rule[] = [
  // ── UNSAFE, historical-damage trap (active): the unsafe combination
  // (broker partition class unisolated + large batch size + Consumer
  // Group C still hammering the downstream in aggressive mode) has been
  // in effect long enough for the exposure window to close
  // (topicAExposureWindowElapsed) — the degraded partition class's
  // contention has genuinely bled into Topic A's own class and events
  // are actively being dropped RIGHT NOW. Checked first/most-specific —
  // reachable regardless of Group B's concurrency, since the damage is
  // at the broker/Topic-A layer, not the consumer layer.
  {
    id: "topic-a-contention-drop-active",
    when: {
      triggerEquals: {
        brokerPartitionDegraded: true,
        consumerCRetryStorm: true,
        topicAExposureWindowElapsed: true,
      },
      controlEquals: {
        [PARTITION_ISOLATION_KEY]: "unisolated",
        [BATCH_SIZE_KEY]: 2_000,
        [CONSUMER_C_RETRY_MODE_KEY]: "aggressive",
        [TOPIC_A_PRIORITY_KEY]: "normal",
      },
    },
    incidentState: "topic-a-contaminated-active",
    values: {
      brokerPartitionHealth: 20,
      topicADurabilityPct: 62,
      topicAEventsDroppedTotal: 340,
      consumerBLagMessages: 9_800,
      consumerBStatus: "critical",
      consumerCRetryRatePerMinute: 5_200,
      downstreamHealthPct: 18,
      dlqBacklogCount: 40,
      topicBBacklogMessages: 11_000,
      platformStatus: "critical",
    },
    componentHealth: topicAContaminatedHealth,
  },

  // ── UNSAFE, historical-damage trap (partially mitigated by reserved
  // priority): same unsafe unisolated + large-batch + aggressive-retry
  // combination past the exposure window, but TOPIC_A_PRIORITY_KEY is
  // set to "protected" — Topic A's broker capacity is reserved ahead of
  // Topic B/Topic C, substantially reducing (not eliminating) how much
  // contention actually reaches Topic A's partition class. Real drops
  // still occur (topicAEventsDroppedTotal=60, far below the 340 reached
  // with no protection at all), proving topic priority is a genuine
  // defense-in-depth lever but never a substitute for actually isolating
  // the degraded partition class.
  {
    id: "topic-a-contention-drop-partially-protected",
    when: {
      triggerEquals: {
        brokerPartitionDegraded: true,
        consumerCRetryStorm: true,
        topicAExposureWindowElapsed: true,
      },
      controlEquals: {
        [PARTITION_ISOLATION_KEY]: "unisolated",
        [BATCH_SIZE_KEY]: 2_000,
        [CONSUMER_C_RETRY_MODE_KEY]: "aggressive",
        [TOPIC_A_PRIORITY_KEY]: "protected",
      },
    },
    incidentState: "topic-a-contaminated-partially-protected",
    values: {
      brokerPartitionHealth: 30,
      topicADurabilityPct: 91,
      topicAEventsDroppedTotal: 60,
      consumerBLagMessages: 9_600,
      consumerBStatus: "critical",
      consumerCRetryRatePerMinute: 5_100,
      downstreamHealthPct: 20,
      dlqBacklogCount: 38,
      topicBBacklogMessages: 10_900,
      platformStatus: "critical",
    },
    componentHealth: topicAContaminatedHealth,
  },

  // ── UNSAFE, historical-damage trap (scarred): the exposure window has
  // closed and the unsafe combination WAS in effect at that moment
  // (hence topicAEventsDroppedTotal is nonzero below), but the live
  // configuration has since been corrected (isolated, bounded batch).
  // No NEW Topic A drops are occurring — topicADurabilityPct reads 100
  // again — but topicAEventsDroppedTotal is still 340, the exact figure
  // reached in "topic-a-contention-drop-active" above, carried forward
  // unchanged. Fixing the live configuration stops new damage; it
  // cannot retroactively restore the 340 events that are already gone.
  // This is the concrete, test-covered proof that the historical
  // counter does not silently reset on fix. Still UNSAFE: a nonzero
  // historical-damage count on the durability-critical topic can never
  // be classified acceptable/optimal, however healthy every other
  // metric reads.
  {
    id: "topic-a-contamination-scarred-but-live-safe",
    when: {
      triggerEquals: {
        brokerPartitionDegraded: true,
        consumerCRetryStorm: true,
        topicAExposureWindowElapsed: true,
      },
      controlEquals: {
        [PARTITION_ISOLATION_KEY]: "isolated",
        [CONSUMER_C_RETRY_MODE_KEY]: "aggressive",
      },
      controlAtMost: { [BATCH_SIZE_KEY]: 500 },
    },
    incidentState: "topic-a-scarred-live-safe",
    values: {
      brokerPartitionHealth: 80,
      topicADurabilityPct: 100,
      topicAEventsDroppedTotal: 340,
      consumerBLagMessages: 9_000,
      consumerBStatus: "critical",
      consumerCRetryRatePerMinute: 5_000,
      downstreamHealthPct: 25,
      dlqBacklogCount: 35,
      topicBBacklogMessages: 9_800,
      platformStatus: "critical",
    },
    componentHealth: brokerDegradedHealth,
  },

  // ── UNSAFE, the central pressure-transfer trap: Consumer Group B
  // concurrency raised high (naive scale-up) while Consumer Group C is
  // still in "aggressive" retry mode against the shared downstream.
  // Group B's lag genuinely drains, but Group B's own downstream writes
  // now stack on top of Group C's unmanaged retry volume —
  // downstreamHealthPct reads WORSE than the untouched baseline (14 vs
  // 35 in "all-three-unmitigated" below).
  {
    id: "naive-scale-up-transfers-pressure-downstream",
    when: {
      triggerEquals: { brokerPartitionDegraded: true, consumerBLagging: true, consumerCRetryStorm: true },
      controlAtLeast: { [CONSUMER_B_CONCURRENCY_KEY]: 16 },
      controlEquals: { [CONSUMER_C_RETRY_MODE_KEY]: "aggressive" },
    },
    incidentState: "pressure-transferred-downstream",
    values: {
      brokerPartitionHealth: 55,
      topicADurabilityPct: 100,
      topicAEventsDroppedTotal: 0,
      consumerBLagMessages: 220,
      consumerBStatus: "normal",
      consumerCRetryRatePerMinute: 6_500,
      downstreamHealthPct: 14,
      dlqBacklogCount: 60,
      topicBBacklogMessages: 300,
      platformStatus: "critical",
    },
    componentHealth: pressureTransferredHealth,
  },

  // ── OPTIMAL: all three root causes correctly, independently
  // mitigated (isolation + bounded batch for the broker, enough Group B
  // concurrency, Group C retry mode off "aggressive") AND the real
  // elapsed recovery window for every subsystem has passed.
  //
  // Scope note on historical-damage persistence: this rule (like
  // "all-mitigated-draining" below) matches on CURRENT control values,
  // same as every rule in this engine (packages/simulator/src/rules.ts
  // has no memory of past control values). A candidate who never
  // contaminates Topic A reaches this rule with
  // topicAEventsDroppedTotal legitimately at 0 throughout. A candidate
  // who DID contaminate Topic A (via "topic-a-contention-drop-active")
  // and then also fixes CONSUMER_C_RETRY_MODE_KEY off "aggressive" is
  // authored as reaching this same fully-recovered state — this is the
  // one honest scope limit of a pure-function rule table (the same
  // limit the sibling Ledger Reconciliation Divergence scenario
  // documents): the "scarred" intermediate tier
  // ("topic-a-contamination-scarred-but-live-safe" above) is reachable
  // and test-covered for the realistic candidate behavior of fixing the
  // broker/batch problem while leaving Group C's retry mode unchanged,
  // which is what "fixing the live configuration does not undo already-
  // caused damage" is actually testing. A candidate thorough enough to
  // fix literally every control is credited for that thoroughness.
  {
    id: "all-mitigated-fully-recovered",
    when: {
      triggerEquals: {
        brokerPartitionDegraded: true,
        consumerBLagging: true,
        consumerCRetryStorm: true,
        brokerRecoveryWindowElapsed: true,
        consumerBDrainWindowElapsed: true,
        downstreamRecoveryWindowElapsed: true,
      },
      controlEquals: { [PARTITION_ISOLATION_KEY]: "isolated" },
      controlAtMost: { [BATCH_SIZE_KEY]: 500 },
      controlAtLeast: { [CONSUMER_B_CONCURRENCY_KEY]: 8 },
    },
    incidentState: "all-mitigated-recovered",
    values: {
      brokerPartitionHealth: 100,
      topicADurabilityPct: 100,
      topicAEventsDroppedTotal: 0,
      consumerBLagMessages: 40,
      consumerBStatus: "normal",
      consumerCRetryRatePerMinute: 15,
      downstreamHealthPct: 98,
      dlqBacklogCount: 0,
      topicBBacklogMessages: 50,
      platformStatus: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE: all three fixes correctly applied (isolation,
  // bounded batch, enough Group B concurrency, Group C retry mode
  // fixed) but the real elapsed recovery windows have not all fired
  // yet — new damage has genuinely stopped and Topic A was never
  // contaminated, but the system is still draining.
  {
    id: "all-mitigated-draining",
    when: {
      triggerEquals: {
        brokerPartitionDegraded: true,
        consumerBLagging: true,
        consumerCRetryStorm: true,
      },
      controlEquals: { [PARTITION_ISOLATION_KEY]: "isolated" },
      controlAtMost: { [BATCH_SIZE_KEY]: 500 },
      controlAtLeast: { [CONSUMER_B_CONCURRENCY_KEY]: 8 },
    },
    incidentState: "all-mitigated-draining",
    values: {
      brokerPartitionHealth: 78,
      topicADurabilityPct: 100,
      topicAEventsDroppedTotal: 0,
      consumerBLagMessages: 1_100,
      consumerBStatus: "warning",
      consumerCRetryRatePerMinute: 280,
      downstreamHealthPct: 72,
      dlqBacklogCount: 8,
      topicBBacklogMessages: 1_500,
      platformStatus: "degraded",
    },
    componentHealth: allMitigatedDrainingHealth,
  },

  // ── Partial: broker correctly isolated/batched AND Group C's retry
  // mode fixed, but Group B's concurrency never raised enough — Topic A
  // is safe and the downstream is protected, but Group B's own lag
  // problem (its distinct, independent root cause) is still
  // unaddressed. Demonstrates that fixing two of the three problems does
  // not fix the third.
  {
    id: "broker-and-downstream-fixed-consumer-b-outstanding",
    when: {
      triggerEquals: {
        brokerPartitionDegraded: true,
        consumerBLagging: true,
        consumerCRetryStorm: true,
      },
      controlEquals: { [PARTITION_ISOLATION_KEY]: "isolated" },
      controlAtMost: { [BATCH_SIZE_KEY]: 500, [CONSUMER_B_CONCURRENCY_KEY]: 4 },
    },
    incidentState: "consumer-b-outstanding",
    values: {
      brokerPartitionHealth: 90,
      topicADurabilityPct: 100,
      topicAEventsDroppedTotal: 0,
      consumerBLagMessages: 8_600,
      consumerBStatus: "critical",
      consumerCRetryRatePerMinute: 220,
      downstreamHealthPct: 80,
      dlqBacklogCount: 6,
      topicBBacklogMessages: 10_500,
      platformStatus: "degraded",
    },
    componentHealth: brokerFixedCFixedBOutstandingHealth,
  },

  // ── Partial: downstream circuit breaker engaged AND retry mode fixed
  // (Group C's problem genuinely resolved, downstreamHealthPct
  // recovering) but broker isolation never applied and Group B never
  // scaled — the other two problems remain exactly as bad as baseline.
  {
    id: "downstream-fixed-broker-and-consumer-b-outstanding",
    when: {
      triggerEquals: {
        brokerPartitionDegraded: true,
        consumerBLagging: true,
        consumerCRetryStorm: true,
      },
      controlEquals: { [DOWNSTREAM_CIRCUIT_BREAKER_KEY]: true },
    },
    incidentState: "broker-and-consumer-b-outstanding",
    values: {
      brokerPartitionHealth: 55,
      topicADurabilityPct: 100,
      topicAEventsDroppedTotal: 0,
      consumerBLagMessages: 9_000,
      consumerBStatus: "critical",
      consumerCRetryRatePerMinute: 60,
      downstreamHealthPct: 70,
      dlqBacklogCount: 3,
      topicBBacklogMessages: 10_800,
      platformStatus: "degraded",
    },
    componentHealth: brokerFixedBOutstandingHealth,
  },

  // ── UNSAFE: bounded retry mode engaged for Consumer Group C (good —
  // stops unbounded retries) but the DLQ is disabled, so genuinely
  // retry-exhausted events have nowhere safe to go. This is the
  // "dropping events merely to reduce lag is not acceptable" trap
  // applied to Group C specifically, distinct from the Topic A
  // contamination trap above.
  {
    id: "bounded-retries-without-dlq",
    when: {
      triggerEquals: { brokerPartitionDegraded: true, consumerBLagging: true, consumerCRetryStorm: true },
      controlEquals: { [CONSUMER_C_RETRY_MODE_KEY]: "bounded", [DLQ_POLICY_KEY]: "disabled" },
    },
    incidentState: "bounded-retries-events-discarded",
    values: {
      brokerPartitionHealth: 55,
      topicADurabilityPct: 100,
      topicAEventsDroppedTotal: 0,
      consumerBLagMessages: 9_000,
      consumerBStatus: "critical",
      consumerCRetryRatePerMinute: 90,
      downstreamHealthPct: 68,
      dlqBacklogCount: 0,
      topicBBacklogMessages: 10_800,
      platformStatus: "critical",
    },
    componentHealth: allThreeCriticalHealth,
  },

  // ── Masking, not fixing: producer backpressure applied at the Event
  // Gateway, which genuinely slows ingestion into the already-degraded
  // broker partition class — brokerPartitionHealth reads measurably
  // better (68 vs. 55) and topicBBacklogMessages is measurably lower
  // (7,400 vs. 11,000) than doing nothing at all, so the dashboard
  // looks like real progress. But backpressure is a producer-side
  // lever with zero reach into Consumer Group B's own processing path
  // or Consumer Group C's retry behavior against the downstream — both
  // remain EXACTLY as bad as the untouched baseline
  // (consumerBLagMessages, consumerCRetryRatePerMinute,
  // downstreamHealthPct unchanged from "all-three-unmitigated" below).
  // platformStatus stays "critical": two of the three independent root
  // causes are completely unaddressed, so this can never be classified
  // acceptable/optimal on backpressure alone — see acr_13 in
  // action-classifications.ts.
  {
    id: "producer-backpressure-masks-without-fixing",
    when: {
      triggerEquals: { brokerPartitionDegraded: true, consumerBLagging: true, consumerCRetryStorm: true },
      controlEquals: { [PRODUCER_BACKPRESSURE_KEY]: true },
    },
    incidentState: "producer-backpressure-masked",
    values: {
      brokerPartitionHealth: 68,
      topicADurabilityPct: 100,
      topicAEventsDroppedTotal: 0,
      consumerBLagMessages: 9_200,
      consumerBStatus: "critical",
      consumerCRetryRatePerMinute: 4_200,
      downstreamHealthPct: 35,
      dlqBacklogCount: 0,
      topicBBacklogMessages: 7_400,
      platformStatus: "critical",
    },
    componentHealth: producerBackpressureMaskedHealth,
  },

  // ── Baseline: all three root causes active, nothing done at all —
  // producer backpressure left off (the default), so the gateway/
  // broker-facing side is not even superficially calmer.
  {
    id: "all-three-unmitigated",
    when: {
      triggerEquals: { brokerPartitionDegraded: true, consumerBLagging: true, consumerCRetryStorm: true },
    },
    incidentState: "all-three-unmitigated",
    values: {
      brokerPartitionHealth: 55,
      topicADurabilityPct: 100,
      topicAEventsDroppedTotal: 0,
      consumerBLagMessages: 9_200,
      consumerBStatus: "critical",
      consumerCRetryRatePerMinute: 4_200,
      downstreamHealthPct: 35,
      dlqBacklogCount: 0,
      topicBBacklogMessages: 11_000,
      platformStatus: "critical",
    },
    componentHealth: allThreeCriticalHealth,
  },

  // ── Second-wave: broker degraded, Group B lagging, but Group C's
  // retry storm has not started yet.
  {
    id: "broker-and-consumer-b-only",
    when: {
      triggerEquals: { brokerPartitionDegraded: true, consumerBLagging: true },
    },
    incidentState: "broker-and-consumer-b-active",
    values: {
      brokerPartitionHealth: 60,
      topicADurabilityPct: 100,
      topicAEventsDroppedTotal: 0,
      consumerBLagMessages: 6_500,
      consumerBStatus: "critical",
      consumerCRetryRatePerMinute: 20,
      downstreamHealthPct: 95,
      dlqBacklogCount: 0,
      topicBBacklogMessages: 7_200,
      platformStatus: "degraded",
    },
    componentHealth: brokerDegradedHealth,
  },

  // ── Baseline: only the broker partition class has degraded so far.
  {
    id: "broker-degraded-only",
    when: { triggerEquals: { brokerPartitionDegraded: true } },
    incidentState: "broker-degraded-only",
    values: {
      brokerPartitionHealth: 65,
      topicADurabilityPct: 100,
      topicAEventsDroppedTotal: 0,
      consumerBLagMessages: 200,
      consumerBStatus: "normal",
      consumerCRetryRatePerMinute: 20,
      downstreamHealthPct: 98,
      dlqBacklogCount: 0,
      topicBBacklogMessages: 500,
      platformStatus: "degraded",
    },
    componentHealth: brokerDegradedHealth,
  },

  // ── Default/fallback: no incident active.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      brokerPartitionHealth: 100,
      topicADurabilityPct: 100,
      topicAEventsDroppedTotal: 0,
      consumerBLagMessages: 200,
      consumerBStatus: "normal",
      consumerCRetryRatePerMinute: 20,
      downstreamHealthPct: 100,
      dlqBacklogCount: 0,
      topicBBacklogMessages: 150,
      platformStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
