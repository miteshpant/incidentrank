import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  BACKFILL_ANALYTICS_WAREHOUSE_KEY,
  INSPECT_ANALYTICS_DRIFT_KEY,
  INSPECT_BILLING_ERRORS_KEY,
  INSPECT_FRAUD_DESERIALIZATION_ERRORS_KEY,
  INSPECT_SCHEMA_DIFF_KEY,
  PUBLISH_SCHEMA_COMPAT_SHIM_KEY,
  REDEPLOY_BILLING_MAPPER_KEY,
  REDEPLOY_FRAUD_DESERIALIZER_KEY,
  RESTART_FRAUD_DETECTION_PODS_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // Investigation toggles are deliberately neutral — they never mutate
  // health/revenue/cost, so they must never count as a beneficial or
  // harmful configuration change either.
  { controlKey: INSPECT_SCHEMA_DIFF_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_BILLING_ERRORS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_ANALYTICS_DRIFT_KEY, valueEquals: true, outcome: "neutral" },
  {
    controlKey: INSPECT_FRAUD_DESERIALIZATION_ERRORS_KEY,
    valueEquals: true,
    outcome: "neutral",
  },

  {
    controlKey: PUBLISH_SCHEMA_COMPAT_SHIM_KEY,
    valueEquals: true,
    whenTriggerEquals: { schemaContractDrifting: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct root-cause fix: producer-side compatibility shim",
      explanation:
        "Orders Service published a backward-incompatible event shape with no version negotiation. Publishing a compatibility shim that emits both the old and new field shapes stops every downstream consumer from misreading the stream going forward — but it does not repair data already dropped, corrupted, or queued while the incompatible shape was live.",
    },
  },
  {
    controlKey: REDEPLOY_BILLING_MAPPER_KEY,
    valueEquals: true,
    whenTriggerEquals: { schemaContractDrifting: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct per-consumer fix: Billing's field mapper",
      explanation:
        "Billing was silently dropping any event it couldn't map a customerId from. Redeploying its mapper against the new field shape stops the silent data loss.",
    },
  },
  {
    controlKey: BACKFILL_ANALYTICS_WAREHOUSE_KEY,
    valueEquals: true,
    whenTriggerEquals: { schemaContractDrifting: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct per-consumer fix: Analytics Warehouse backfill",
      explanation:
        "Analytics never dropped events — it wrote them anyway with corrupted fields, already landing bad rows in the warehouse. A targeted backfill is needed in addition to the schema fix, since the shim alone only prevents NEW corruption, not the rows already written.",
    },
  },
  {
    controlKey: REDEPLOY_FRAUD_DESERIALIZER_KEY,
    valueEquals: true,
    whenTriggerEquals: { schemaContractDrifting: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct per-consumer fix: Fraud Detection's deserializer",
      explanation:
        "Fraud Detection was crashing on deserialization and crash-looping. Redeploying its deserializer to tolerate the new shape stops the restart loop for good.",
    },
  },
  {
    controlKey: RESTART_FRAUD_DETECTION_PODS_KEY,
    valueEquals: true,
    whenTriggerEquals: { schemaContractDrifting: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: restarting Fraud Detection's pods",
      explanation:
        "Restarting the crashed pods briefly drains the backlog, but the deserializer itself was never fixed — the still-incompatible stream crashes the freshly-restarted pods again within seconds, and Billing and Analytics are entirely unaffected either way.",
    },
  },
];
