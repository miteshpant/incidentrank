import type { ControlDefinition } from "@incidentrank/simulator";

// ── Retry ownership, one control per independently-configured boundary ──
//
// Each of these four controls is a REAL, separately-owned retry setting
// in a real system — a gateway team, service-A team, service-B team, and
// service-C team each independently decided "retries are safe, add some"
// without coordinating with the other three. None of them is wrong in
// isolation; the problem is that all four are active on the SAME
// customer request's path to the SAME external provider at once.
export const GATEWAY_RETRIES_KEY = "gatewayRetries";
export const SERVICE_A_RETRIES_KEY = "serviceARetries";
export const SERVICE_B_RETRIES_KEY = "serviceBRetries";
export const SERVICE_C_RETRIES_KEY = "serviceCRetries";

// ── Timeout budget at the one layer directly adjacent to the provider ──
// Tuning this only matters once retry ownership has been consolidated;
// with all four layers still retrying, the provider-facing timeout is
// not the bottleneck — the REQUEST VOLUME is.
export const SERVICE_C_TIMEOUT_SECONDS_KEY = "serviceCTimeoutSeconds";

// Circuit breaker lives at Service C, the layer that actually talks to
// the External Provider and can observe its real health directly.
export const CIRCUIT_BREAKER_KEY = "circuitBreaker";

// Whether a client-cancelled/caller-abandoned request's cancellation is
// propagated down the chain, freeing in-flight work at every layer
// instead of letting it run to completion as "zombie work" nobody is
// still waiting on.
export const CANCELLATION_PROPAGATION_KEY = "cancellationPropagation";

// Max concurrent in-flight requests Service C will accept from Service B
// at once — a blast-radius control independent of retry ownership.
export const SERVICE_C_CONCURRENCY_KEY = "serviceCConcurrency";

export const controls: ControlDefinition[] = [
  { key: GATEWAY_RETRIES_KEY, allowedValues: [0, 1, 2, 3], initialValue: 2 },
  { key: SERVICE_A_RETRIES_KEY, allowedValues: [0, 1, 2, 3], initialValue: 2 },
  { key: SERVICE_B_RETRIES_KEY, allowedValues: [0, 1, 2, 3], initialValue: 2 },
  { key: SERVICE_C_RETRIES_KEY, allowedValues: [0, 1, 2, 3], initialValue: 2 },
  { key: SERVICE_C_TIMEOUT_SECONDS_KEY, allowedValues: [1, 2, 4, 8], initialValue: 4 },
  { key: CIRCUIT_BREAKER_KEY, allowedValues: ["off", "on"], initialValue: "off" },
  {
    key: CANCELLATION_PROPAGATION_KEY,
    allowedValues: ["off", "on"],
    initialValue: "off",
  },
  { key: SERVICE_C_CONCURRENCY_KEY, allowedValues: [50, 100, 200, 400], initialValue: 200 },
];
