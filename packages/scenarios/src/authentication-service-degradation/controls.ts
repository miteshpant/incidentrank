import type { ControlDefinition } from "@incidentrank/simulator";

export const AUTH_SERVICE_INSTANCES_KEY = "authServiceInstances";
export const TOKEN_CACHE_TTL_SECONDS_KEY = "tokenCacheTtlSeconds";
export const SIGNATURE_VERIFICATION_BYPASS_ENABLED_KEY = "signatureVerificationBypassEnabled";

export const controls: ControlDefinition[] = [
  { key: AUTH_SERVICE_INSTANCES_KEY, allowedValues: [2, 4, 8, 16], initialValue: 2 },
  {
    key: TOKEN_CACHE_TTL_SECONDS_KEY,
    allowedValues: [30, 120, 300, 1_800],
    initialValue: 30,
  },
  {
    key: SIGNATURE_VERIFICATION_BYPASS_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
