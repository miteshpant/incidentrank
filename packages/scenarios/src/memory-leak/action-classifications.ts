import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CACHE_EVICTION_POLICY_ENABLED_KEY,
  MANUAL_RESTART_TRIGGERED_KEY,
  MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { leakActive: true },
    outcome: "beneficial",
  },
  {
    controlKey: CACHE_EVICTION_POLICY_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { leakActive: true },
    outcome: "beneficial",
  },
  {
    controlKey: MANUAL_RESTART_TRIGGERED_KEY,
    valueEquals: true,
    whenTriggerEquals: { leakRecurred: true },
    outcome: "harmful",
  },
];
