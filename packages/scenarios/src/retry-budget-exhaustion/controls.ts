import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation control (non-destructive) ────────────────────────────
// A toggle the candidate flips to signal "I looked here." It never
// changes component health, revenue loss, or cost — it only advances
// `investigationDone` state, which the rule table reads to determine the
// authored `diagnosisPath` value (see rules.ts). Mirrors the reference
// incident's investigation-control pattern exactly.
export const INSPECT_RETRY_METRICS_KEY = "inspectRetryMetrics";

// ── Remediation controls (state-mutating) ───────────────────────────────
// The root-cause fix: Recommendation Service's own naive per-call retry
// policy has no retry budget and no circuit breaker. Lowering
// maxRetryAttempts to a bounded value (<= 1) is necessary but on its own
// still re-issues every failed call once; only ENABLING the circuit
// breaker actually stops Recommendation Service from hammering an
// already-degraded Pricing Service once failures cross its threshold.
export const MAX_RETRY_ATTEMPTS_KEY = "maxRetryAttempts";
export const CIRCUIT_BREAKER_ENABLED_KEY = "circuitBreakerEnabled";

// ── Plausible-but-inferior remediation (state-mutating) ─────────────────
// Scaling out Pricing Service adds raw capacity, which is a reasonable
// first instinct — but retry amplification grows call volume faster than
// added replicas can absorb it, so this never actually relieves the
// incident on its own (see rules.ts's "scaled-pricing-only" rule).
export const PRICING_SERVICE_REPLICA_COUNT_KEY = "pricingServiceReplicaCount";

export const controls: ControlDefinition[] = [
  { key: INSPECT_RETRY_METRICS_KEY, allowedValues: [false, true], initialValue: false },
  { key: MAX_RETRY_ATTEMPTS_KEY, allowedValues: [0, 1, 3, 5], initialValue: 3 },
  { key: CIRCUIT_BREAKER_ENABLED_KEY, allowedValues: [false, true], initialValue: false },
  { key: PRICING_SERVICE_REPLICA_COUNT_KEY, allowedValues: [4, 8, 16, 32], initialValue: 4 },
];
