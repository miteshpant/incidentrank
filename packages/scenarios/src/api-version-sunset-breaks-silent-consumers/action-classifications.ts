import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  ENABLE_COMPATIBILITY_SHIM_KEY,
  EXTEND_SUNSET_DEADLINE_KEY,
  FORCE_HARD_CUTOVER_KEY,
  INSPECT_CONSUMER_REGISTRY_KEY,
  INSPECT_GATEWAY_ACCESS_LOGS_KEY,
  INSPECT_SUPPORT_TICKET_QUEUE_KEY,
  MIGRATE_DISCOVERED_CONSUMERS_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // Investigation toggles are deliberately neutral — they never mutate
  // health/revenue/cost, so they must never count as a beneficial or
  // harmful configuration change either. They exist purely to drive the
  // authored diagnosisPath/remediationStrategy values in rules.ts.
  { controlKey: INSPECT_CONSUMER_REGISTRY_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_GATEWAY_ACCESS_LOGS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_SUPPORT_TICKET_QUEUE_KEY, valueEquals: true, outcome: "neutral" },

  {
    controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY,
    valueEquals: true,
    whenTriggerEquals: { v1Sunset: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct follow-through: migrating the discovered long tail",
      explanation:
        "Extending the deadline or enabling the compatibility shim only buys time or masks symptoms — actually finding and migrating the unregistered callers the investigation surfaced is what permanently retires the risk.",
    },
  },
  {
    controlKey: EXTEND_SUNSET_DEADLINE_KEY,
    valueEquals: true,
    whenTriggerEquals: { v1Sunset: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct strategy: extending the sunset deadline",
      explanation:
        "Extending the deadline removes the immediate time pressure so the long tail of unregistered consumers can actually be found and migrated, rather than forcing a choice between breaking them now or papering over the break.",
    },
  },
  {
    controlKey: ENABLE_COMPATIBILITY_SHIM_KEY,
    valueEquals: true,
    whenTriggerEquals: { v1Sunset: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct strategy: emergency compatibility shim",
      explanation:
        "The shim translates most v1-shaped traffic onto v2 immediately, buying time without an extended v1 maintenance window — but it is a mitigation, not a fix, until the long tail behind it is actually migrated.",
    },
  },
  {
    controlKey: FORCE_HARD_CUTOVER_KEY,
    valueEquals: true,
    whenTriggerEquals: { v1Sunset: true },
    outcome: "harmful",
    feedback: {
      title: "Plausible but harmful: forcing the hard cutover",
      explanation:
        "Blocking v1 traffic outright makes the gateway's own dashboards go green immediately, but it does nothing for the unregistered long tail that was never found — those callers keep failing hard on their own end indefinitely, and the support ticket backlog keeps climbing.",
    },
  },
];
