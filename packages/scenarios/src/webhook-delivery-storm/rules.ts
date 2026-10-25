import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  DESTINATION_ISOLATION_ENABLED_KEY,
  DISPATCHER_CONCURRENCY_KEY,
  DLQ_ESCALATION_THRESHOLD_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
  RETRY_BACKOFF_KEY,
  WORKER_COUNT_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "event-source": "healthy",
  "webhook-dispatcher": "healthy",
  "affected-destinations": "healthy",
  "healthy-destinations": "healthy",
};

// Failing subset degraded, dispatcher strained, healthy majority still
// fine — the isolated-recovery shape.
const isolatedHealth: Record<string, ComponentHealth> = {
  "event-source": "healthy",
  "webhook-dispatcher": "degraded",
  "affected-destinations": "critical",
  "healthy-destinations": "healthy",
};

// Blast radius: the healthy destinations are now ALSO degraded because
// the dispatcher itself is saturated.
const blastRadiusHealth: Record<string, ComponentHealth> = {
  "event-source": "healthy",
  "webhook-dispatcher": "critical",
  "affected-destinations": "critical",
  "healthy-destinations": "degraded",
};

const blastRadiusCriticalHealth: Record<string, ComponentHealth> = {
  "event-source": "healthy",
  "webhook-dispatcher": "critical",
  "affected-destinations": "critical",
  "healthy-destinations": "critical",
};

const partialHealth: Record<string, ComponentHealth> = {
  "event-source": "healthy",
  "webhook-dispatcher": "degraded",
  "affected-destinations": "critical",
  "healthy-destinations": "degraded",
};

/**
 * Authored rule table for Webhook Delivery Storm, ordered most-specific
 * first. A shared downstream provider outage makes a subset of customer
 * webhook endpoints slow/unreachable. The dispatcher's retry queue and
 * worker pool are shared across ALL destinations, so without per-
 * destination isolation, aggressive retries against the failing subset
 * consume worker/queue capacity that delayed delivery to destinations
 * that were never unhealthy — the scenario's binding cross-customer
 * blast-radius requirement, proven here via
 * healthyDestinationDeliveryLatencyMs actually rising in the
 * no-isolation branches and staying low only once isolation is enabled.
 * Two harmful traps mirror real on-call instincts: raising dispatcher
 * concurrency/worker count (more shared slots for the same unbounded
 * retry storm to occupy) and leaving retries unbounded (999 attempts,
 * never giving up). Exponential backoff alone is a genuine partial
 * mitigation — it reduces blast radius without eliminating it, since
 * the failing subset's retries are still indefinite and still share the
 * pool.
 */
export const webhookDeliveryStormRules: Rule[] = [
  // ── Second wave, isolation already on (listed before the single-
  // trigger isolation rule below since both triggerEquals checks are
  // subset-matches, not exact-matches — the more specific two-trigger
  // condition must be evaluated first or it would never be reached).
  // The failing subset's own DLQ keeps growing (genuine, expected,
  // bounded to that subset) while the healthy majority remains
  // completely unaffected throughout.
  {
    id: "isolation-dlq-growth-contained",
    when: {
      triggerEquals: { destinationsDegraded: true, dlqEscalating: true },
      controlEquals: { [DESTINATION_ISOLATION_ENABLED_KEY]: true },
    },
    incidentState: "isolated-dlq-growing",
    values: {
      webhookBacklog: 70,
      retryVolumePerMinute: 60,
      affectedDestinationFailureRate: 90,
      healthyDestinationDeliveryLatencyMs: 195,
      affectedDestinationDeliveryLatencyMs: 4_500,
      dispatcherWorkerUtilization: 30,
      dlqDepth: 900,
      dispatcherStatus: "warning",
      deliveryIsolationState: "isolated",
    },
    componentHealth: isolatedHealth,
  },

  // ── Strong recovery: destination isolation enabled. The failing
  // subset is circuit-broken on its own — their retries stop consuming
  // shared capacity — while the healthy majority keeps being dispatched
  // normally. This wins over every control combination below once
  // isolation is live, because isolation is the actual structural fix:
  // scaling/backoff/retry-limit choices no longer matter once the
  // failing subset can't consume shared resources.
  {
    id: "isolation-contains-blast-radius",
    when: {
      triggerEquals: { destinationsDegraded: true },
      controlEquals: { [DESTINATION_ISOLATION_ENABLED_KEY]: true },
    },
    incidentState: "isolated-recovery",
    values: {
      webhookBacklog: 60,
      retryVolumePerMinute: 90,
      affectedDestinationFailureRate: 85,
      healthyDestinationDeliveryLatencyMs: 190,
      affectedDestinationDeliveryLatencyMs: 4_200,
      dispatcherWorkerUtilization: 35,
      dlqDepth: 40,
      dispatcherStatus: "warning",
      deliveryIsolationState: "isolated",
    },
    componentHealth: isolatedHealth,
  },

  // ── Harmful decoy #1: dispatcher concurrency and/or worker count
  // raised while isolation is off. More shared slots does not shrink
  // the unbounded retry storm against the failing subset — it gives
  // that storm more room to run concurrently, so MORE of the shared
  // pool is occupied by retries to unreachable destinations at any
  // instant, and healthy-destination delivery latency gets WORSE than
  // the unscaled baseline, not better.
  {
    id: "scaled-concurrency-worsens-blast-radius",
    when: {
      triggerEquals: { destinationsDegraded: true },
      controlAtLeast: { [DISPATCHER_CONCURRENCY_KEY]: 200 },
      controlEquals: { [DESTINATION_ISOLATION_ENABLED_KEY]: false },
    },
    incidentState: "scaled-concurrency-blast-radius",
    values: {
      webhookBacklog: 3_200,
      retryVolumePerMinute: 5_400,
      affectedDestinationFailureRate: 95,
      healthyDestinationDeliveryLatencyMs: 3_100,
      affectedDestinationDeliveryLatencyMs: 9_800,
      dispatcherWorkerUtilization: 99,
      dlqDepth: 20,
      dispatcherStatus: "critical",
      deliveryIsolationState: "blast-radius",
    },
    componentHealth: blastRadiusCriticalHealth,
  },

  // ── Harmful decoy #2 (fleet-level version of the same trap): adding
  // worker processes without isolation. More workers pulling from the
  // same shared delivery queue does not reduce the failing subset's
  // retry volume — it just means more independent workers are each
  // blocked retrying unreachable destinations, still starving healthy
  // deliveries of worker time.
  {
    id: "scaled-workers-worsens-blast-radius",
    when: {
      triggerEquals: { destinationsDegraded: true },
      controlAtLeast: { [WORKER_COUNT_KEY]: 16 },
      controlEquals: { [DESTINATION_ISOLATION_ENABLED_KEY]: false },
    },
    incidentState: "scaled-workers-blast-radius",
    values: {
      webhookBacklog: 2_900,
      retryVolumePerMinute: 4_800,
      affectedDestinationFailureRate: 95,
      healthyDestinationDeliveryLatencyMs: 2_600,
      affectedDestinationDeliveryLatencyMs: 9_100,
      dispatcherWorkerUtilization: 97,
      dlqDepth: 15,
      dispatcherStatus: "critical",
      deliveryIsolationState: "blast-radius",
    },
    componentHealth: blastRadiusCriticalHealth,
  },

  // ── Harmful: retries left unbounded (999 attempts) with no
  // isolation. Every failed delivery to the unreachable subset gets
  // retried effectively forever, continuously occupying shared worker
  // slots and growing the backlog without limit, deepening the blast
  // radius over the unbounded-retries baseline itself.
  {
    id: "unbounded-retries-worsens-blast-radius",
    when: {
      triggerEquals: { destinationsDegraded: true },
      controlAtLeast: { [MAX_RETRY_ATTEMPTS_KEY]: 999 },
      controlEquals: { [DESTINATION_ISOLATION_ENABLED_KEY]: false },
    },
    incidentState: "unbounded-retries-blast-radius",
    values: {
      webhookBacklog: 4_600,
      retryVolumePerMinute: 7_200,
      affectedDestinationFailureRate: 96,
      healthyDestinationDeliveryLatencyMs: 2_900,
      affectedDestinationDeliveryLatencyMs: 11_500,
      dispatcherWorkerUtilization: 99,
      dlqDepth: 0,
      dispatcherStatus: "critical",
      deliveryIsolationState: "blast-radius",
    },
    componentHealth: blastRadiusCriticalHealth,
  },

  // ── Partial, still degraded: exponential backoff alone, no
  // isolation. Spreading retries out in time means fewer of them land
  // simultaneously, so the shared pool is less saturated than the
  // immediate-retry baseline and healthy-destination latency is
  // meaningfully better — but the failing subset's retries are still
  // indefinite and still share the pool, so healthy delivery is still
  // visibly slower than its pre-incident baseline, not recovered.
  {
    id: "backoff-alone-partial-relief",
    when: {
      triggerEquals: { destinationsDegraded: true },
      controlEquals: {
        [RETRY_BACKOFF_KEY]: "exponential",
        [DESTINATION_ISOLATION_ENABLED_KEY]: false,
      },
    },
    incidentState: "backoff-partial-relief",
    values: {
      webhookBacklog: 850,
      retryVolumePerMinute: 620,
      affectedDestinationFailureRate: 90,
      healthyDestinationDeliveryLatencyMs: 650,
      affectedDestinationDeliveryLatencyMs: 6_200,
      dispatcherWorkerUtilization: 68,
      dlqDepth: 10,
      dispatcherStatus: "warning",
      deliveryIsolationState: "blast-radius",
    },
    componentHealth: partialHealth,
  },

  // ── Partial, still degraded: DLQ escalation threshold tightened
  // (e.g. 5 or 20) without isolation. Failing webhooks get parked
  // sooner instead of retried forever, which caps backlog growth
  // somewhat, but every delivery attempt up to that threshold still
  // competes for the same shared worker pool, so healthy-destination
  // latency remains degraded.
  {
    id: "dlq-threshold-alone-partial-relief",
    when: {
      triggerEquals: { destinationsDegraded: true },
      controlAtMost: { [DLQ_ESCALATION_THRESHOLD_KEY]: 20 },
      controlEquals: { [DESTINATION_ISOLATION_ENABLED_KEY]: false },
    },
    incidentState: "dlq-threshold-partial-relief",
    values: {
      webhookBacklog: 1_200,
      retryVolumePerMinute: 1_050,
      affectedDestinationFailureRate: 92,
      healthyDestinationDeliveryLatencyMs: 980,
      affectedDestinationDeliveryLatencyMs: 7_400,
      dispatcherWorkerUtilization: 75,
      dlqDepth: 480,
      dispatcherStatus: "warning",
      deliveryIsolationState: "blast-radius",
    },
    componentHealth: partialHealth,
  },

  // ── Second wave baseline: sustained unmitigated retry pressure
  // finally pushes mass DLQ escalation, deepening the already-visible
  // backlog/retry-volume trend. Only reachable once no mitigation above
  // has matched.
  {
    id: "dlq-escalation-baseline",
    when: { triggerEquals: { destinationsDegraded: true, dlqEscalating: true } },
    incidentState: "dlq-escalation-blast-radius",
    values: {
      webhookBacklog: 6_800,
      retryVolumePerMinute: 8_900,
      affectedDestinationFailureRate: 97,
      healthyDestinationDeliveryLatencyMs: 3_400,
      affectedDestinationDeliveryLatencyMs: 12_000,
      dispatcherWorkerUtilization: 99,
      dlqDepth: 5_200,
      dispatcherStatus: "critical",
      deliveryIsolationState: "blast-radius",
    },
    componentHealth: blastRadiusCriticalHealth,
  },

  // ── Baseline critical: the shared-provider outage has hit a subset
  // of destinations and the candidate has taken no meaningfully
  // mitigating action yet. Aggressive default retries (no backoff,
  // unbounded-by-default-posture via 8 attempts with no isolation)
  // already consume enough shared worker/queue capacity that healthy-
  // destination delivery latency has visibly risen above its pre-
  // incident baseline (180ms) — the blast radius in its earliest,
  // still-recoverable form.
  {
    id: "provider-outage-baseline",
    when: { triggerEquals: { destinationsDegraded: true } },
    incidentState: "blast-radius-baseline",
    values: {
      webhookBacklog: 1_900,
      retryVolumePerMinute: 2_400,
      affectedDestinationFailureRate: 88,
      healthyDestinationDeliveryLatencyMs: 1_450,
      affectedDestinationDeliveryLatencyMs: 8_200,
      dispatcherWorkerUtilization: 90,
      dlqDepth: 5,
      dispatcherStatus: "critical",
      deliveryIsolationState: "blast-radius",
    },
    componentHealth: blastRadiusHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      webhookBacklog: 20,
      retryVolumePerMinute: 40,
      affectedDestinationFailureRate: 2,
      healthyDestinationDeliveryLatencyMs: 180,
      affectedDestinationDeliveryLatencyMs: 220,
      dispatcherWorkerUtilization: 15,
      dlqDepth: 0,
      dispatcherStatus: "normal",
      deliveryIsolationState: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
