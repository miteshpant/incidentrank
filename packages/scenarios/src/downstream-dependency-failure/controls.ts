import type { ControlDefinition } from "@incidentrank/simulator";

export const CIRCUIT_BREAKER_ENABLED_KEY = "circuitBreakerEnabled";
export const REQUEST_TIMEOUT_MS_KEY = "requestTimeoutMs";
export const FALLBACK_RESPONSE_ENABLED_KEY = "fallbackResponseEnabled";

export const controls: ControlDefinition[] = [
  {
    key: CIRCUIT_BREAKER_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: REQUEST_TIMEOUT_MS_KEY,
    allowedValues: [500, 2_000, 8_000, 20_000],
    initialValue: 2_000,
  },
  {
    key: FALLBACK_RESPONSE_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
