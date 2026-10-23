import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  ACK_TIMEOUT_MS_KEY,
  CONSUMER_CONCURRENCY_KEY,
  DEDUPLICATION_WINDOW_SECONDS_KEY,
  IDEMPOTENT_PROCESSING_ENABLED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  producer: "healthy",
  broker: "healthy",
  consumers: "healthy",
  "side-effects": "healthy",
};

const brokerDegradedHealth: Record<string, ComponentHealth> = {
  producer: "healthy",
  broker: "degraded",
  consumers: "healthy",
  "side-effects": "degraded",
};

// The core trap snapshot: broker/consumer throughput metrics look fine
// or even improved (consumers are healthy, busy, keeping up with load),
// while the side-effects component is the one that's actually unsafe.
const lookingHealthyButUnsafeHealth: Record<string, ComponentHealth> = {
  producer: "healthy",
  broker: "healthy",
  consumers: "healthy",
  "side-effects": "critical",
};

const brokerCriticalHealth: Record<string, ComponentHealth> = {
  producer: "healthy",
  broker: "critical",
  consumers: "degraded",
  "side-effects": "critical",
};

/**
 * Authored rule table for Duplicate Event Processing, ordered
 * most-specific-first. Consumer acknowledgements to the broker begin
 * failing intermittently; the broker, seeing no ack, redelivers the same
 * event. Throughput and ack-failure-rate metrics can look fine or even
 * improve under certain "obvious" mitigations, while duplicateOrderCount/
 * duplicatePaymentCount — the real, observable correctness counters —
 * keep climbing. The only genuinely safe path is recognizing a
 * redelivered event's identity and skipping its side effect, which
 * requires BOTH idempotent processing enabled AND a real (nonzero)
 * deduplication window to remember recently-applied event ids against.
 *
 * Two required traps:
 *   - Raising consumer concurrency alone absorbs more redelivered
 *     traffic (throughput looks great, even healthier) but does nothing
 *     to recognize duplicates — more concurrent processes can each
 *     re-apply the same duplicate event, so duplicate counts climb
 *     FASTER, not slower.
 *   - Lowering the ack timeout aggressively while acks are already
 *     failing makes the consumer give up waiting even sooner, which
 *     increases how often an event is redelivered before its original
 *     ack would have landed — amplifying duplicate production rather
 *     than relieving it.
 */
export const duplicateEventProcessingRules: Rule[] = [
  // ── Optimal recovery: idempotent processing enabled WITH a real
  // deduplication window to check identities against. Redelivered copies
  // of an already-applied event are recognized and skipped before the
  // side effect runs, so duplicate counts hold at zero regardless of how
  // aggressively acks keep failing or how many consumers are running.
  // Checked first/most specific so it wins over every other combination
  // once both are genuinely in effect.
  {
    id: "idempotent-with-dedup-window-safe",
    when: {
      triggerEquals: { ackFailuresActive: true },
      controlEquals: { [IDEMPOTENT_PROCESSING_ENABLED_KEY]: true },
      controlAtLeast: { [DEDUPLICATION_WINDOW_SECONDS_KEY]: 30 },
    },
    incidentState: "deduplicated",
    values: {
      consumerThroughputPerSec: 410,
      ackFailureRatePct: 4,
      redeliveryVolumePerMin: 35,
      duplicateEventRatePct: 0,
      duplicateOrderCount: 0,
      duplicatePaymentCount: 0,
      brokerStatus: "normal",
      duplicateSafetyStatus: "safe-deduplicated",
    },
    componentHealth: healthyHealth,
  },

  // ── Harmful trap #1 (explicit product requirement): consumer
  // concurrency scaled up a lot without idempotent processing. Consumer
  // throughput looks healthy — even higher than baseline — and the
  // broker itself looks fine, but every one of the many concurrent
  // consumers can independently pick up and re-apply the same
  // redelivered event. Duplicate counts climb FASTER than the unmitigated
  // baseline, not slower. This must be reachable at both the first and
  // second wave so sustained duplication under this "fix" is visible.
  {
    id: "scaled-concurrency-without-idempotency-harmful-second-wave",
    when: {
      triggerEquals: { ackFailuresActive: true, sustainedRedelivery: true },
      controlAtLeast: { [CONSUMER_CONCURRENCY_KEY]: 16 },
      controlEquals: { [IDEMPOTENT_PROCESSING_ENABLED_KEY]: false },
    },
    incidentState: "wasted-scaling-compounding",
    values: {
      consumerThroughputPerSec: 980,
      ackFailureRatePct: 9,
      redeliveryVolumePerMin: 260,
      duplicateEventRatePct: 22,
      duplicateOrderCount: 540,
      duplicatePaymentCount: 290,
      brokerStatus: "normal",
      duplicateSafetyStatus: "unsafe-duplicating",
    },
    componentHealth: lookingHealthyButUnsafeHealth,
  },
  {
    id: "scaled-concurrency-without-idempotency-harmful",
    when: {
      triggerEquals: { ackFailuresActive: true },
      controlAtLeast: { [CONSUMER_CONCURRENCY_KEY]: 16 },
      controlEquals: { [IDEMPOTENT_PROCESSING_ENABLED_KEY]: false },
    },
    incidentState: "wasted-scaling",
    values: {
      consumerThroughputPerSec: 920,
      ackFailureRatePct: 8,
      redeliveryVolumePerMin: 140,
      duplicateEventRatePct: 14,
      duplicateOrderCount: 95,
      duplicatePaymentCount: 70,
      brokerStatus: "normal",
      duplicateSafetyStatus: "unsafe-duplicating",
    },
    componentHealth: lookingHealthyButUnsafeHealth,
  },

  // ── Harmful trap #2: ack timeout lowered aggressively while acks are
  // already failing. The consumer gives up waiting even sooner, so
  // messages whose ack would have eventually landed get redelivered
  // anyway — redelivery volume and duplicate production get WORSE than
  // the unmitigated baseline, even though "react faster" sounds
  // proactive.
  {
    id: "aggressive-ack-timeout-amplifies-duplicates",
    when: {
      triggerEquals: { ackFailuresActive: true },
      controlAtMost: { [ACK_TIMEOUT_MS_KEY]: 1_000 },
      controlEquals: { [IDEMPOTENT_PROCESSING_ENABLED_KEY]: false },
    },
    incidentState: "ack-timeout-amplified",
    values: {
      consumerThroughputPerSec: 460,
      ackFailureRatePct: 18,
      redeliveryVolumePerMin: 310,
      duplicateEventRatePct: 26,
      duplicateOrderCount: 140,
      duplicatePaymentCount: 110,
      brokerStatus: "warning",
      duplicateSafetyStatus: "unsafe-duplicating",
    },
    componentHealth: lookingHealthyButUnsafeHealth,
  },

  // ── Partial, still unsafe: idempotent processing is enabled but the
  // deduplication window is still 0 — there is no window of recently-
  // applied ids to check a redelivered event's identity against, so
  // duplicates still occur, just at a reduced rate versus full baseline
  // (some in-flight/very-recent redeliveries happen to be caught by
  // transient request-level reuse, but the structural fix is incomplete).
  {
    id: "idempotency-enabled-without-window-partial",
    when: {
      triggerEquals: { ackFailuresActive: true },
      controlEquals: {
        [IDEMPOTENT_PROCESSING_ENABLED_KEY]: true,
        [DEDUPLICATION_WINDOW_SECONDS_KEY]: 0,
      },
    },
    incidentState: "idempotency-without-window",
    values: {
      consumerThroughputPerSec: 415,
      ackFailureRatePct: 5,
      redeliveryVolumePerMin: 40,
      duplicateEventRatePct: 6,
      duplicateOrderCount: 18,
      duplicatePaymentCount: 12,
      brokerStatus: "warning",
      duplicateSafetyStatus: "unsafe-duplicating",
    },
    componentHealth: brokerDegradedHealth,
  },

  // ── Second-wave baseline: sustained unmitigated redelivery compounds
  // further. Only reachable once no mitigation above has matched.
  {
    id: "sustained-redelivery-baseline",
    when: { triggerEquals: { ackFailuresActive: true, sustainedRedelivery: true } },
    incidentState: "redelivery-compounding",
    values: {
      consumerThroughputPerSec: 430,
      ackFailureRatePct: 11,
      redeliveryVolumePerMin: 180,
      duplicateEventRatePct: 17,
      duplicateOrderCount: 260,
      duplicatePaymentCount: 190,
      brokerStatus: "critical",
      duplicateSafetyStatus: "unsafe-duplicating",
    },
    componentHealth: brokerCriticalHealth,
  },

  // ── Baseline critical: ack failures active, no mitigation taken yet.
  {
    id: "ack-failures-baseline",
    when: { triggerEquals: { ackFailuresActive: true } },
    incidentState: "redelivering",
    values: {
      consumerThroughputPerSec: 425,
      ackFailureRatePct: 7,
      redeliveryVolumePerMin: 85,
      duplicateEventRatePct: 9,
      duplicateOrderCount: 60,
      duplicatePaymentCount: 42,
      brokerStatus: "warning",
      duplicateSafetyStatus: "unsafe-duplicating",
    },
    componentHealth: brokerDegradedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      consumerThroughputPerSec: 420,
      ackFailureRatePct: 1,
      redeliveryVolumePerMin: 8,
      duplicateEventRatePct: 0,
      duplicateOrderCount: 0,
      duplicatePaymentCount: 0,
      brokerStatus: "normal",
      duplicateSafetyStatus: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
