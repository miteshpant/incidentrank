import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  BATCH_SIZE_KEY,
  CONSUMER_COUNT_KEY,
  EXTERNAL_API_CALL_CONCURRENCY_KEY,
  PRIORITY_ROUTING_ENABLED_KEY,
  PRODUCER_THROTTLE_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "event-producers": "healthy",
  kafka: "healthy",
  "processing-layer": "healthy",
  database: "healthy",
  "external-api": "healthy",
};

const kafkaCriticalHealth: Record<string, ComponentHealth> = {
  "event-producers": "healthy",
  kafka: "critical",
  "processing-layer": "degraded",
  database: "healthy",
  "external-api": "healthy",
};

const dbCriticalHealth: Record<string, ComponentHealth> = {
  "event-producers": "healthy",
  kafka: "healthy",
  "processing-layer": "degraded",
  database: "critical",
  "external-api": "healthy",
};

const externalApiCriticalHealth: Record<string, ComponentHealth> = {
  "event-producers": "healthy",
  kafka: "healthy",
  "processing-layer": "degraded",
  database: "healthy",
  "external-api": "critical",
};

const bothCriticalHealth: Record<string, ComponentHealth> = {
  "event-producers": "healthy",
  kafka: "healthy",
  "processing-layer": "critical",
  database: "critical",
  "external-api": "critical",
};

const throttledStillStaleHealth: Record<string, ComponentHealth> = {
  "event-producers": "degraded",
  kafka: "degraded",
  "processing-layer": "degraded",
  database: "healthy",
  "external-api": "healthy",
};

const acceptableHealth: Record<string, ComponentHealth> = {
  "event-producers": "healthy",
  kafka: "healthy",
  "processing-layer": "healthy",
  database: "healthy",
  "external-api": "healthy",
};

/**
 * Authored rule table for Event Processing Backpressure, ordered
 * most-specific first. Producers surge past what the processing layer
 * can drain; Kafka lag and event staleness are the visible first
 * symptom. The obvious first mitigation — add Kafka consumers and/or
 * worker concurrency — genuinely drains the backlog, but each added
 * consumer/worker independently opens more database connections and
 * makes more external-API calls per unit time. Pushed far enough without
 * also capping external-call concurrency or enabling priority routing,
 * the bottleneck transfers one hop downstream: database connection
 * pressure or the external API's own rate limiter, or both at once.
 * Throttling producers alone buys time against backlog growth but never
 * increases drain capacity, so customer-visible freshness never
 * recovers. Priority routing lets the candidate protect the core/
 * high-priority path and the shared downstream capacity by deliberately
 * delaying low-priority events — a genuine, safe-but-imperfect handback.
 */
export const eventProcessingBackpressureRules: Rule[] = [
  // ── Optimal: consumers/workers scaled up to drain Kafka AND
  // external-call concurrency kept capped AND priority routing enabled
  // AND batch size kept reasonable. Every subsystem — Kafka, DB,
  // external API — stays within healthy bounds simultaneously; this is
  // the only state where ingestion, processing, DB pressure, external
  // dependency pressure, queue growth, and customer freshness are all
  // genuinely balanced at once.
  {
    id: "balanced-full-recovery",
    when: {
      triggerEquals: { producersSurged: true },
      controlAtLeast: { [CONSUMER_COUNT_KEY]: 4 },
      controlAtMost: {
        [EXTERNAL_API_CALL_CONCURRENCY_KEY]: 30,
        [BATCH_SIZE_KEY]: 200,
      },
      controlEquals: { [PRIORITY_ROUTING_ENABLED_KEY]: true },
    },
    incidentState: "balanced-recovery",
    values: {
      kafkaLagMessages: 20,
      processingThroughputPerSec: 420,
      eventFreshnessSeconds: 2,
      dbConnectionUtilization: 42,
      externalApiErrorRate: 2,
      kafkaStatus: "normal",
      downstreamPressure: "balanced",
    },
    componentHealth: healthyHealth,
  },

  // ── Acceptable: consumers scaled and priority routing protects the
  // core path and shared downstream capacity, but external-call
  // concurrency is still raised high and batch size left large — the
  // core/high-priority path and every subsystem health signal are
  // genuinely safe, but low-priority event freshness is deliberately
  // sacrificed rather than the backpressure being fully, optimally
  // resolved.
  {
    id: "priority-routing-protects-core-path",
    when: {
      triggerEquals: { producersSurged: true },
      controlAtLeast: { [CONSUMER_COUNT_KEY]: 4 },
      controlEquals: { [PRIORITY_ROUTING_ENABLED_KEY]: true },
    },
    incidentState: "priority-routed-acceptable",
    values: {
      kafkaLagMessages: 60,
      processingThroughputPerSec: 380,
      eventFreshnessSeconds: 9,
      dbConnectionUtilization: 55,
      externalApiErrorRate: 6,
      kafkaStatus: "normal",
      downstreamPressure: "low-priority-deferred",
    },
    componentHealth: acceptableHealth,
  },

  // ── Second wave, checked ahead of the single-subsystem traps below:
  // once sustained unmanaged outbound call volume has tripped the
  // external API's own rate limiter, that compounding state applies
  // regardless of which specific concurrency levers got the candidate
  // there — it supersedes the first-wave external-api-overloaded
  // classification once the rate limiter itself has fired. Never
  // reachable from the optimal/acceptable rules above, since those are
  // checked first and a genuinely balanced or priority-routed state
  // keeps externalApiErrorRate below the threshold that leads here.
  {
    id: "external-rate-limit-second-wave",
    when: {
      triggerEquals: { producersSurged: true, externalRateLimited: true },
    },
    incidentState: "external-rate-limited",
    values: {
      kafkaLagMessages: 1_800,
      processingThroughputPerSec: 150,
      eventFreshnessSeconds: 95,
      dbConnectionUtilization: 60,
      externalApiErrorRate: 65,
      kafkaStatus: "critical",
      downstreamPressure: "external-api-overloaded",
    },
    componentHealth: externalApiCriticalHealth,
  },

  // ── Harmful pressure-transfer: both database AND external API are
  // pushed critical at once — consumers, workers, and external-call
  // concurrency are all raised aggressively with no protective control
  // engaged. Kafka drains fast, but the processing layer itself buckles
  // under combined DB and external-API saturation.
  {
    id: "both-downstream-overloaded",
    when: {
      triggerEquals: { producersSurged: true },
      controlAtLeast: {
        [CONSUMER_COUNT_KEY]: 8,
        [WORKER_CONCURRENCY_KEY]: 40,
        [EXTERNAL_API_CALL_CONCURRENCY_KEY]: 60,
      },
      controlEquals: { [PRIORITY_ROUTING_ENABLED_KEY]: false },
    },
    incidentState: "both-overloaded",
    values: {
      kafkaLagMessages: 15,
      processingThroughputPerSec: 460,
      eventFreshnessSeconds: 1,
      dbConnectionUtilization: 97,
      externalApiErrorRate: 42,
      kafkaStatus: "normal",
      downstreamPressure: "database-overloaded",
    },
    componentHealth: bothCriticalHealth,
  },

  // ── Harmful pressure-transfer #1: consumer count and worker
  // concurrency scaled up aggressively without priority routing or a
  // capped external-call concurrency. Kafka lag genuinely drains and
  // freshness genuinely improves — but each of the many concurrent
  // workers now holds its own database connection, so DB connection
  // utilization spikes into critical. The bottleneck moved from Kafka to
  // the database.
  {
    id: "db-overloaded-from-consumer-scaling",
    when: {
      triggerEquals: { producersSurged: true },
      controlAtLeast: {
        [CONSUMER_COUNT_KEY]: 8,
        [WORKER_CONCURRENCY_KEY]: 40,
      },
      controlEquals: { [PRIORITY_ROUTING_ENABLED_KEY]: false },
    },
    incidentState: "db-overloaded",
    values: {
      kafkaLagMessages: 25,
      processingThroughputPerSec: 440,
      eventFreshnessSeconds: 2,
      dbConnectionUtilization: 96,
      externalApiErrorRate: 5,
      kafkaStatus: "normal",
      downstreamPressure: "database-overloaded",
    },
    componentHealth: dbCriticalHealth,
  },

  // ── Harmful pressure-transfer #2: consumer count scaled up alongside
  // external-API call concurrency, without priority routing. Kafka lag
  // drains, but outbound call volume to the external dependency now
  // exceeds what it can sustain, and its error rate spikes into
  // critical. The bottleneck moved from Kafka to the external
  // dependency.
  {
    id: "external-api-overloaded-from-scaling",
    when: {
      triggerEquals: { producersSurged: true },
      controlAtLeast: {
        [CONSUMER_COUNT_KEY]: 8,
        [EXTERNAL_API_CALL_CONCURRENCY_KEY]: 60,
      },
      controlEquals: { [PRIORITY_ROUTING_ENABLED_KEY]: false },
    },
    incidentState: "external-api-overloaded",
    values: {
      kafkaLagMessages: 30,
      processingThroughputPerSec: 410,
      eventFreshnessSeconds: 3,
      dbConnectionUtilization: 45,
      externalApiErrorRate: 48,
      kafkaStatus: "normal",
      downstreamPressure: "external-api-overloaded",
    },
    componentHealth: externalApiCriticalHealth,
  },

  // ── Masking, not fixing: producers throttled, but consumer/processing
  // capacity never increased. Kafka's backlog growth stops (or slowly
  // drains), but the processing layer never gained the capacity to catch
  // up quickly — event freshness stays elevated for as long as the
  // throttle is relied on alone, and the throttle itself degrades
  // ingestion.
  {
    id: "producer-throttle-masks-without-fixing",
    when: {
      triggerEquals: { producersSurged: true },
      controlEquals: { [PRODUCER_THROTTLE_ENABLED_KEY]: true },
      controlAtMost: { [CONSUMER_COUNT_KEY]: 2 },
    },
    incidentState: "throttled-still-stale",
    values: {
      kafkaLagMessages: 900,
      processingThroughputPerSec: 170,
      eventFreshnessSeconds: 70,
      dbConnectionUtilization: 20,
      externalApiErrorRate: 1,
      kafkaStatus: "warning",
      downstreamPressure: "unresolved",
    },
    componentHealth: throttledStillStaleHealth,
  },

  // ── Baseline critical: producers have surged and the candidate has
  // taken no meaningfully mitigating action yet. Kafka lag and
  // freshness both keep degrading.
  {
    id: "backlog-growing-baseline",
    when: {
      triggerEquals: { producersSurged: true },
    },
    incidentState: "backlog-growing",
    values: {
      kafkaLagMessages: 12_000,
      processingThroughputPerSec: 190,
      eventFreshnessSeconds: 150,
      dbConnectionUtilization: 22,
      externalApiErrorRate: 1,
      kafkaStatus: "critical",
      downstreamPressure: "unresolved",
    },
    componentHealth: kafkaCriticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      kafkaLagMessages: 400,
      processingThroughputPerSec: 180,
      eventFreshnessSeconds: 4,
      dbConnectionUtilization: 18,
      externalApiErrorRate: 1,
      kafkaStatus: "normal",
      downstreamPressure: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
