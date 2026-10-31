import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation controls (non-destructive) ───────────────────────────
// Each is a toggle a candidate flips to signal "I looked here." None of
// these change component health, revenue loss, or cost — they only
// advance investigation*Done state keys, which the rule table reads to
// determine the authored `diagnosisPath` value (see rules.ts). Mirrors
// the reference incident's investigation-control pattern exactly.
export const INSPECT_SCHEMA_DIFF_KEY = "inspectSchemaDiff";
export const INSPECT_BILLING_ERRORS_KEY = "inspectBillingErrors";
export const INSPECT_ANALYTICS_DRIFT_KEY = "inspectAnalyticsDrift";
export const INSPECT_FRAUD_DESERIALIZATION_ERRORS_KEY = "inspectFraudDeserializationErrors";

// ── Remediation controls (state-mutating) ──────────────────────────────
// The real root cause: Orders Service published a backward-incompatible
// event shape (the `customerId` top-level field was moved under a
// nested `customer.id`) with no version negotiation. The shim makes the
// producer emit BOTH the old top-level field and the new nested shape
// simultaneously, which is what actually stops all three consumers from
// misreading the stream going forward — but it does nothing to repair
// data already corrupted/dropped/queued while the incompatible shape was
// live, which is why each consumer still needs its own targeted recovery
// action on top of the shim.
export const PUBLISH_SCHEMA_COMPAT_SHIM_KEY = "publishSchemaCompatShim";
export const REDEPLOY_BILLING_MAPPER_KEY = "redeployBillingMapper";
export const BACKFILL_ANALYTICS_WAREHOUSE_KEY = "backfillAnalyticsWarehouse";
export const REDEPLOY_FRAUD_DESERIALIZER_KEY = "redeployFraudDeserializer";

// ── Plausible-but-inferior remediation ──────────────────────────────────
// Restarting Fraud Detection's pods clears its crashed worker processes
// and briefly drains the backlog that had piled up — a reasonable first
// instinct when a pipeline's consumer lag is spiking — but does nothing
// about the actual deserialization bug, so new incompatible events crash
// the restarted pods again within seconds. Classified "neutral" in
// action-classifications.ts, never "harmful".
export const RESTART_FRAUD_DETECTION_PODS_KEY = "restartFraudDetectionPods";

export const controls: ControlDefinition[] = [
  { key: INSPECT_SCHEMA_DIFF_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_BILLING_ERRORS_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_ANALYTICS_DRIFT_KEY, allowedValues: [false, true], initialValue: false },
  {
    key: INSPECT_FRAUD_DESERIALIZATION_ERRORS_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  { key: PUBLISH_SCHEMA_COMPAT_SHIM_KEY, allowedValues: [false, true], initialValue: false },
  { key: REDEPLOY_BILLING_MAPPER_KEY, allowedValues: [false, true], initialValue: false },
  { key: BACKFILL_ANALYTICS_WAREHOUSE_KEY, allowedValues: [false, true], initialValue: false },
  { key: REDEPLOY_FRAUD_DESERIALIZER_KEY, allowedValues: [false, true], initialValue: false },
  { key: RESTART_FRAUD_DETECTION_PODS_KEY, allowedValues: [false, true], initialValue: false },
];
