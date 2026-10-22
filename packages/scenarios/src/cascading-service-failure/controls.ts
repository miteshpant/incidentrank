import type { ControlDefinition } from "@incidentrank/simulator";

export const ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY = "rootServiceCircuitBreakerEnabled";
export const UPSTREAM_SERVICE_RESTART_ENABLED_KEY = "upstreamServiceRestartEnabled";
export const REQUEST_QUEUE_DEPTH_LIMIT_KEY = "requestQueueDepthLimit";

export const controls: ControlDefinition[] = [
  {
    key: ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: UPSTREAM_SERVICE_RESTART_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: REQUEST_QUEUE_DEPTH_LIMIT_KEY,
    allowedValues: [50, 200, 1_000, 5_000],
    initialValue: 1_000,
  },
];
