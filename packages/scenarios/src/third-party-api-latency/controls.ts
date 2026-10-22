import type { ControlDefinition } from "@incidentrank/simulator";

export const API_TIMEOUT_MS_KEY = "apiTimeoutMs";
export const CACHED_RESPONSE_FALLBACK_ENABLED_KEY = "cachedResponseFallbackEnabled";
export const ASYNC_PROCESSING_ENABLED_KEY = "asyncProcessingEnabled";

export const controls: ControlDefinition[] = [
  { key: API_TIMEOUT_MS_KEY, allowedValues: [500, 2_000, 8_000, 20_000], initialValue: 2_000 },
  {
    key: CACHED_RESPONSE_FALLBACK_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: ASYNC_PROCESSING_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
