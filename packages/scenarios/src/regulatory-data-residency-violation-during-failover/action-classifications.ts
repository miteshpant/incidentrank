import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
  FAIL_BACK_TO_EU_KEY,
  FILE_BREACH_NOTIFICATION_KEY,
  INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY,
  INSPECT_FAILOVER_ROUTING_LOGS_KEY,
  INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY,
  STAY_FAILED_OVER_KEY,
  VERIFY_EU_REGION_RECOVERED_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // Investigation toggles are deliberately neutral — they never mutate
  // health/revenue/cost, so they must never count as a beneficial or
  // harmful configuration change either. They exist purely to drive the
  // authored diagnosisPath/investigationQuality values in rules.ts.
  { controlKey: INSPECT_FAILOVER_ROUTING_LOGS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY, valueEquals: true, outcome: "neutral" },

  {
    controlKey: VERIFY_EU_REGION_RECOVERED_KEY,
    valueEquals: true,
    whenTriggerEquals: { autoFailedOverToUs: true },
    outcome: "neutral",
    feedback: {
      title: "Prerequisite check: verifying EU region recovery",
      explanation:
        "Confirming eu-west-1 has actually finished recovering before routing EU traffic back is a necessary precondition, not a fix by itself — it does not stop the violation or restore anything on its own.",
    },
  },
  {
    controlKey: ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
    valueEquals: true,
    whenTriggerEquals: { euRegionInfraRecovered: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix: EU data-lock gateway, after genuine recovery",
      explanation:
        "Once eu-west-1 has genuinely recovered, routing EU-tagged traffic back through the residency-enforcing gateway stops the data-residency violation without reopening the availability outage.",
    },
  },
  {
    controlKey: ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
    valueEquals: true,
    whenTriggerEquals: { euRegionInfraRecovered: false },
    outcome: "harmful",
    feedback: {
      title: "Trap: enabling the data-lock gateway before EU has recovered",
      explanation:
        "Routing EU traffic back onto eu-west-1 before its own infrastructure has actually recovered reopens the exact availability outage the automatic failover was protecting against — it looks like the principled right answer, but the region genuinely isn't ready yet.",
    },
  },
  {
    controlKey: FAIL_BACK_TO_EU_KEY,
    valueEquals: true,
    whenTriggerEquals: { autoFailedOverToUs: true },
    outcome: "harmful",
    feedback: {
      title: "Trap: forcing an early fail-back",
      explanation:
        "Forcing traffic back onto eu-west-1 while it is still unhealthy stops the data-residency violation immediately, but at the cost of reopening the availability outage for every EU customer — a real tradeoff, but an unmanaged one when done without first verifying recovery.",
    },
  },
  {
    controlKey: STAY_FAILED_OVER_KEY,
    valueEquals: true,
    whenTriggerEquals: { autoFailedOverToUs: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but incomplete: staying failed over indefinitely",
      explanation:
        "Staying on the US failover region keeps EU availability perfect, but the data-residency violation keeps accruing for every minute that decision stands — the availability dashboard being green does not mean this incident is resolved.",
    },
  },
  {
    controlKey: FILE_BREACH_NOTIFICATION_KEY,
    valueEquals: true,
    whenTriggerEquals: { autoFailedOverToUs: true },
    outcome: "beneficial",
    feedback: {
      title: "Separate compliance obligation: breach notification",
      explanation:
        "Once EU personal data has been processed in the US region at all, filing the mandatory breach notification is its own obligation, independent of which availability strategy was chosen or whether the violation has since stopped.",
    },
  },
];
