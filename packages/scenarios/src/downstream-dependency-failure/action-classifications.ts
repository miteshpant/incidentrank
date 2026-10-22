import type { ActionClassificationRule } from "@incidentrank/simulator";
import { CIRCUIT_BREAKER_ENABLED_KEY, FALLBACK_RESPONSE_ENABLED_KEY, REQUEST_TIMEOUT_MS_KEY } from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: CIRCUIT_BREAKER_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { downstreamFailing: true },
    outcome: "beneficial",
  },
  {
    controlKey: FALLBACK_RESPONSE_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { downstreamFailing: true },
    outcome: "beneficial",
  },
  {
    controlKey: REQUEST_TIMEOUT_MS_KEY,
    valueAtLeast: 20_000,
    whenTriggerEquals: { downstreamFailing: true },
    outcome: "harmful",
  },
];
