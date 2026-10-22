import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  API_TIMEOUT_MS_KEY,
  ASYNC_PROCESSING_ENABLED_KEY,
  CACHED_RESPONSE_FALLBACK_ENABLED_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: CACHED_RESPONSE_FALLBACK_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { vendorSlow: true },
    outcome: "beneficial",
  },
  {
    controlKey: API_TIMEOUT_MS_KEY,
    valueAtMost: 2_000,
    whenTriggerEquals: { vendorSlow: true },
    outcome: "beneficial",
  },
  {
    controlKey: ASYNC_PROCESSING_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { vendorSlow: true },
    outcome: "beneficial",
  },
  {
    controlKey: API_TIMEOUT_MS_KEY,
    valueAtLeast: 8_000,
    whenTriggerEquals: { vendorSlow: true },
    outcome: "harmful",
  },
];
