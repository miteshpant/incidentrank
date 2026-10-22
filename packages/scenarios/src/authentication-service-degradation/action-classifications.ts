import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  AUTH_SERVICE_INSTANCES_KEY,
  SIGNATURE_VERIFICATION_BYPASS_ENABLED_KEY,
  TOKEN_CACHE_TTL_SECONDS_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: AUTH_SERVICE_INSTANCES_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { authDegraded: true },
    outcome: "beneficial",
  },
  {
    controlKey: TOKEN_CACHE_TTL_SECONDS_KEY,
    valueAtMost: 300,
    whenTriggerEquals: { authDegraded: true },
    outcome: "neutral",
  },
  // The scenario's central, highest-stakes teaching point: bypassing
  // signature verification is a severe security regression, never a
  // legitimate performance fix, regardless of how the live metrics look
  // once it's enabled (see revenue-and-cost.ts's successCondition
  // comment — this is the ONLY place that distinction is actually
  // enforced).
  {
    controlKey: SIGNATURE_VERIFICATION_BYPASS_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { authDegraded: true },
    outcome: "harmful",
  },
];
