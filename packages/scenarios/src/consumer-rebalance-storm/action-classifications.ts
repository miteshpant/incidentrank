import type { ActionClassificationRule } from "@incidentrank/simulator";
import { SESSION_TIMEOUT_MS_KEY, STATIC_GROUP_MEMBERSHIP_ENABLED_KEY } from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: STATIC_GROUP_MEMBERSHIP_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { deployRollingOut: true },
    outcome: "beneficial",
  },
  {
    controlKey: SESSION_TIMEOUT_MS_KEY,
    valueAtMost: 6_000,
    whenTriggerEquals: { deployRollingOut: true },
    outcome: "harmful",
  },
];
