import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  API_INSTANCE_COUNT_KEY,
  COMPRESSION_ENABLED_KEY,
  PAGE_SIZE_KEY,
  PAYLOAD_SIZE_LIMIT_KEY,
  RESPONSE_CACHE_ENABLED_KEY,
  RESPONSE_PROJECTION_ENABLED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  gateway: "healthy",
  "api-service": "healthy",
  storage: "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  gateway: "healthy",
  "api-service": "degraded",
  storage: "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  gateway: "degraded",
  "api-service": "critical",
  storage: "healthy",
};

const truncationCriticalHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  gateway: "healthy",
  "api-service": "degraded",
  storage: "healthy",
};

/**
 * Authored rule table for Large Payload Regression, ordered
 * most-specific-first. A deploy changed a response shape to return full
 * nested related records instead of lightweight references. Response
 * payload size, API-tier serialization cost (memory, CPU-adjacent
 * latency), and network bandwidth all climb together.
 *
 * Two genuine, root-cause fixes exist (both reshape what is actually
 * returned per request, so both are OPTIMAL):
 *   1. responseProjectionEnabled — strip the response down to only the
 *      fields callers need.
 *   2. pageSize <= 25 — cap how many nested records are expanded per
 *      page, so each individual response carries far less data.
 *
 * Required design property: apiInstanceCount (broad horizontal scaling)
 * must NOT fix payload size, network utilization, or serialization
 * latency — those stay exactly as bloated per request regardless of
 * instance count. Scaling only spreads the SAME oversized work across
 * more processes, which lowers each instance's own memory utilization
 * somewhat (a real, authored, smaller effect) without touching the
 * actual cause.
 *
 * compressionEnabled is a genuine, different-mechanism partial fix:
 * it reduces bytes transferred (network utilization, and the
 * transfer-time share of tail latency) but does nothing for the
 * API tier's own serialization cost or memory pressure — the full
 * oversized object graph still has to be built in memory before it is
 * compressed.
 *
 * payloadSizeLimit truncates responses that exceed the cap. This looks
 * clean on memory/network/latency, but callers that depend on the
 * fields that got silently cut off fail downstream — a correctness
 * problem, not a capacity one, and visibly so via a rising error rate,
 * never a hidden gotcha.
 */
export const largePayloadRegressionRules: Rule[] = [
  // ── Optimal recovery #1: response projection. The response is
  // reshaped to only the fields callers actually need instead of the
  // newly expanded full nested objects, so payload size, serialization
  // latency, memory pressure, and network utilization all drop back to
  // near-baseline regardless of every other control. Checked first so
  // it wins over every other combination once applied.
  {
    id: "response-projection-recovery",
    when: {
      triggerEquals: { payloadRegressed: true },
      controlEquals: { [RESPONSE_PROJECTION_ENABLED_KEY]: true },
    },
    incidentState: "recovered-projected",
    values: {
      responsePayloadSizeKb: 20,
      p99LatencyMs: 95,
      apiMemoryUtilization: 24,
      networkUtilizationMbps: 45,
      errorRatePercent: 0,
      throughputRps: 790,
      apiStatus: "normal",
      payloadShapeHealth: "shape-fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Optimal recovery #2 (alternate good path): a small page size
  // caps how many nested records any single response expands, so each
  // individual response is genuinely small again — a structurally
  // different route to the same real fix.
  {
    id: "small-page-size-recovery",
    when: {
      triggerEquals: { payloadRegressed: true },
      controlAtMost: { [PAGE_SIZE_KEY]: 25 },
      controlEquals: { [RESPONSE_PROJECTION_ENABLED_KEY]: false },
    },
    incidentState: "recovered-paginated",
    values: {
      responsePayloadSizeKb: 34,
      p99LatencyMs: 140,
      apiMemoryUtilization: 28,
      networkUtilizationMbps: 62,
      errorRatePercent: 0,
      throughputRps: 760,
      apiStatus: "normal",
      payloadShapeHealth: "shape-fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Harmful/trap: a hard payload size cap truncates responses that
  // exceed it. Memory, network, and latency all look clean, but
  // callers depending on the fields that got silently cut off start
  // failing downstream — a rising, candidate-visible error rate proves
  // this is a correctness problem, not a capacity fix. Checked ahead of
  // the generic baseline/scaling rules so it is never confused with
  // genuine relief. Matches either tightened limit value (512kb or
  // 128kb) via two sibling rules, since RuleCondition's controlEquals
  // only matches one exact value at a time.
  {
    id: "payload-limit-512kb-truncates-silently",
    when: {
      triggerEquals: { payloadRegressed: true },
      controlEquals: {
        [RESPONSE_PROJECTION_ENABLED_KEY]: false,
        [PAYLOAD_SIZE_LIMIT_KEY]: "512kb",
      },
    },
    incidentState: "payload-truncated",
    values: {
      responsePayloadSizeKb: 512,
      p99LatencyMs: 310,
      apiMemoryUtilization: 30,
      networkUtilizationMbps: 70,
      errorRatePercent: 22,
      throughputRps: 640,
      apiStatus: "warning",
      payloadShapeHealth: "feature-limited",
    },
    componentHealth: truncationCriticalHealth,
  },
  {
    id: "payload-limit-128kb-truncates-silently",
    when: {
      triggerEquals: { payloadRegressed: true },
      controlEquals: {
        [RESPONSE_PROJECTION_ENABLED_KEY]: false,
        [PAYLOAD_SIZE_LIMIT_KEY]: "128kb",
      },
    },
    incidentState: "payload-truncated",
    values: {
      responsePayloadSizeKb: 128,
      p99LatencyMs: 180,
      apiMemoryUtilization: 26,
      networkUtilizationMbps: 50,
      errorRatePercent: 41,
      throughputRps: 650,
      apiStatus: "warning",
      payloadShapeHealth: "feature-limited",
    },
    componentHealth: truncationCriticalHealth,
  },

  // ── Partial, different mechanism: compression reduces bytes
  // transferred over the wire, so network utilization and the
  // transfer-time share of tail latency both improve meaningfully —
  // but the API tier still has to build the full oversized object graph
  // in memory before compressing it, so memory pressure and the
  // serialization-cost share of latency remain elevated. Stays
  // degraded, never reaches either completion bar.
  {
    id: "compression-reduces-bandwidth-not-serialization",
    when: {
      triggerEquals: { payloadRegressed: true },
      controlEquals: {
        [COMPRESSION_ENABLED_KEY]: true,
        [RESPONSE_PROJECTION_ENABLED_KEY]: false,
      },
      controlAtLeast: { [PAGE_SIZE_KEY]: 100 },
    },
    incidentState: "compressed-bandwidth-relief",
    values: {
      responsePayloadSizeKb: 480,
      p99LatencyMs: 1_350,
      apiMemoryUtilization: 80,
      networkUtilizationMbps: 95,
      errorRatePercent: 1,
      throughputRps: 610,
      apiStatus: "warning",
      payloadShapeHealth: "unresolved",
    },
    componentHealth: degradedHealth,
  },

  // ── Required design property: scaling API instances alone does
  // nothing for payload size, network utilization, or serialization
  // latency — every individual request is still exactly as expensive
  // to build and transfer. Per-instance memory utilization does drop
  // (the same oversized work is spread across more processes), a real,
  // smaller, authored effect, but it does not touch the actual cause.
  {
    id: "scaled-instances-spread-memory-not-payload",
    when: {
      triggerEquals: { payloadRegressed: true },
      controlAtLeast: { [API_INSTANCE_COUNT_KEY]: 16 },
      controlEquals: {
        [RESPONSE_PROJECTION_ENABLED_KEY]: false,
        [COMPRESSION_ENABLED_KEY]: false,
        [PAYLOAD_SIZE_LIMIT_KEY]: "unlimited",
      },
    },
    incidentState: "scaled-no-payload-relief",
    values: {
      responsePayloadSizeKb: 480,
      p99LatencyMs: 2_150,
      apiMemoryUtilization: 46,
      networkUtilizationMbps: 380,
      errorRatePercent: 3,
      throughputRps: 540,
      apiStatus: "critical",
      payloadShapeHealth: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Partial relief: response caching serves repeat identical
  // requests without re-serializing or re-transferring, but the nested
  // data this regression expands is highly per-account/per-request
  // variable, so the hit rate stays low — most requests still miss and
  // pay the full oversized cost. A real but incomplete mitigation.
  {
    id: "response-cache-low-hit-rate-partial",
    when: {
      triggerEquals: { payloadRegressed: true },
      controlEquals: {
        [RESPONSE_CACHE_ENABLED_KEY]: true,
        [RESPONSE_PROJECTION_ENABLED_KEY]: false,
        [COMPRESSION_ENABLED_KEY]: false,
      },
      controlAtLeast: { [PAGE_SIZE_KEY]: 100 },
    },
    incidentState: "response-cache-partial",
    values: {
      responsePayloadSizeKb: 410,
      p99LatencyMs: 1_800,
      apiMemoryUtilization: 88,
      networkUtilizationMbps: 320,
      errorRatePercent: 2,
      throughputRps: 580,
      apiStatus: "critical",
      payloadShapeHealth: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Second wave, baseline: sustained oversized responses finally
  // exhaust API-tier memory headroom; GC pressure drives error rate up
  // on top of already-elevated latency. Only reachable once no
  // mitigation above has matched.
  {
    id: "memory-exhaustion-baseline",
    when: {
      triggerEquals: { payloadRegressed: true, memoryExhausting: true },
    },
    incidentState: "memory-exhausted",
    values: {
      responsePayloadSizeKb: 480,
      p99LatencyMs: 3_400,
      apiMemoryUtilization: 97,
      networkUtilizationMbps: 390,
      errorRatePercent: 14,
      throughputRps: 310,
      apiStatus: "critical",
      payloadShapeHealth: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: the payload regression has shipped and the
  // candidate has taken no meaningfully mitigating action yet.
  {
    id: "payload-regression-baseline",
    when: { triggerEquals: { payloadRegressed: true } },
    incidentState: "payload-bloated",
    values: {
      responsePayloadSizeKb: 480,
      p99LatencyMs: 2_200,
      apiMemoryUtilization: 85,
      networkUtilizationMbps: 380,
      errorRatePercent: 3,
      throughputRps: 520,
      apiStatus: "critical",
      payloadShapeHealth: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      responsePayloadSizeKb: 18,
      p99LatencyMs: 90,
      apiMemoryUtilization: 22,
      networkUtilizationMbps: 40,
      errorRatePercent: 0,
      throughputRps: 800,
      apiStatus: "normal",
      payloadShapeHealth: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
