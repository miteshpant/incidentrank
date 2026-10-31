import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  BACKFILL_ANALYTICS_WAREHOUSE_KEY,
  PUBLISH_SCHEMA_COMPAT_SHIM_KEY,
  REDEPLOY_BILLING_MAPPER_KEY,
  REDEPLOY_FRAUD_DESERIALIZER_KEY,
  RESTART_FRAUD_DETECTION_PODS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "orders-service": "healthy",
  "event-bus": "healthy",
  "billing-pipeline": "healthy",
  "analytics-warehouse": "healthy",
  "fraud-detection": "healthy",
};

const allBrokenHealth: Record<string, ComponentHealth> = {
  "orders-service": "degraded",
  "event-bus": "degraded",
  "billing-pipeline": "critical",
  "analytics-warehouse": "critical",
  "fraud-detection": "critical",
};

/**
 * Authored rule table for Cross-Team Schema Contract Drift, ordered
 * most-specific-first. This is a genuinely CASCADING structure, not a
 * single-pipeline lineage break: one upstream event (Orders Service's
 * backward-incompatible schema change) fans out into THREE
 * independently-owned consumer pipelines, each of which fails in a
 * DIFFERENT way:
 *
 *   - Billing silently DROPS events it can't map (data loss, undercounted
 *     revenue, no error spike).
 *   - Analytics does NOT drop events — it writes them anyway with
 *     corrupted fields (data corruption already landed in the warehouse,
 *     a distinct failure mode from loss).
 *   - Fraud Detection crashes on deserialization and crash-loops (the
 *     loudest, most alarming signal, but numerically the smallest
 *     blast radius of the three).
 *
 * The producer-side compat shim (PUBLISH_SCHEMA_COMPAT_SHIM_KEY) is the
 * actual root-cause fix — it stops new events from violating the old
 * contract — but it does NOT repair anything already dropped/corrupted/
 * queued while the incompatible shape was live. Each consumer therefore
 * needs its own targeted recovery action in addition to the shim. A
 * candidate who fixes only the loudest pipeline (Fraud Detection) while
 * ignoring the two silent ones (Billing, Analytics) has NOT resolved the
 * incident — this is the deliberate triage/prioritization lesson: the
 * three consumers are scored and recovered independently of each other,
 * not as a single combined "pipeline" the way a lineage-break-during-
 * migration scenario would be.
 *
 * Health per component is tracked per-consumer so the candidate can see,
 * at a glance, which of the three downstream pipelines are still broken
 * regardless of which they fixed first — the engine has no "N things are
 * each independently broken" primitive beyond per-component health, so
 * this rule table authors every one of the 2^3 meaningfully-reachable
 * fix-combinations' values directly (per this codebase's existing
 * convention of rules-ordered-most-specific-first, not a formula).
 */
export const schemaContractDriftRules: Rule[] = [
  // ── Full recovery: shim published AND every one of the three
  // consumers individually remediated. Checked first because it must
  // win over any partial-combination rule below.
  {
    id: "fully-recovered-all-three-consumers",
    when: {
      triggerEquals: { schemaContractDrifting: true },
      controlEquals: {
        [PUBLISH_SCHEMA_COMPAT_SHIM_KEY]: true,
        [REDEPLOY_BILLING_MAPPER_KEY]: true,
        [BACKFILL_ANALYTICS_WAREHOUSE_KEY]: true,
        [REDEPLOY_FRAUD_DESERIALIZER_KEY]: true,
      },
    },
    incidentState: "recovering",
    values: {
      schemaViolationRatePercent: 0,
      billingDroppedEventCount: 340,
      billingUnbilledRevenueUsd: 8_600,
      analyticsCorruptedRowPercent: 0,
      fraudConsumerLagSeconds: 5,
      fraudPodRestartCount: 11,
      warehouseCompactionQueueDepth: 6,
      diagnosisPath: "fully-recovered-all-three",
    },
    componentHealth: healthyHealth,
  },

  // ── Two of three fixed: Billing and Fraud remediated, Analytics still
  // silently corrupting new rows. This is the central triage trap —
  // Billing and Fraud both produce loud, countable signals (dropped
  // events, crash-loop restarts); Analytics produces none, so a
  // candidate who stops after the two "obvious" pipelines leaves data
  // corruption actively running.
  {
    id: "billing-and-fraud-fixed-analytics-still-corrupting",
    when: {
      triggerEquals: { schemaContractDrifting: true },
      controlEquals: {
        [PUBLISH_SCHEMA_COMPAT_SHIM_KEY]: true,
        [REDEPLOY_BILLING_MAPPER_KEY]: true,
        [REDEPLOY_FRAUD_DESERIALIZER_KEY]: true,
        [BACKFILL_ANALYTICS_WAREHOUSE_KEY]: false,
      },
    },
    incidentState: "analytics-still-broken",
    values: {
      schemaViolationRatePercent: 0,
      billingDroppedEventCount: 340,
      billingUnbilledRevenueUsd: 8_600,
      analyticsCorruptedRowPercent: 38,
      fraudConsumerLagSeconds: 5,
      fraudPodRestartCount: 11,
      warehouseCompactionQueueDepth: 7,
      diagnosisPath: "billing-and-fraud-only",
    },
    componentHealth: { ...healthyHealth, "analytics-warehouse": "critical" },
  },

  // ── Two of three fixed: Billing and Analytics remediated, Fraud still
  // crash-looping (shim published but Fraud's own deserializer never
  // redeployed, so its already-running old binary keeps throwing on
  // every new-shape event it was never fixed to tolerate).
  {
    id: "billing-and-analytics-fixed-fraud-still-crashing",
    when: {
      triggerEquals: { schemaContractDrifting: true },
      controlEquals: {
        [PUBLISH_SCHEMA_COMPAT_SHIM_KEY]: true,
        [REDEPLOY_BILLING_MAPPER_KEY]: true,
        [BACKFILL_ANALYTICS_WAREHOUSE_KEY]: true,
        [REDEPLOY_FRAUD_DESERIALIZER_KEY]: false,
      },
    },
    incidentState: "fraud-still-broken",
    values: {
      schemaViolationRatePercent: 0,
      billingDroppedEventCount: 340,
      billingUnbilledRevenueUsd: 8_600,
      analyticsCorruptedRowPercent: 0,
      fraudConsumerLagSeconds: 410,
      fraudPodRestartCount: 52,
      warehouseCompactionQueueDepth: 6,
      diagnosisPath: "billing-and-analytics-only",
    },
    componentHealth: { ...healthyHealth, "fraud-detection": "critical" },
  },

  // ── Loudest-pipeline-only trap: Fraud Detection redeployed (and shim
  // published), but Billing and Analytics — both silent failure modes —
  // were never touched. This is the scenario's central lesson made
  // concrete: the candidate fixed the pipeline that was SCREAMING
  // (crash-loop alerts) while two pipelines with zero error-rate alarms
  // kept silently losing and corrupting data the whole time.
  {
    id: "fraud-fixed-only-silent-failures-continue",
    when: {
      triggerEquals: { schemaContractDrifting: true },
      controlEquals: {
        [PUBLISH_SCHEMA_COMPAT_SHIM_KEY]: true,
        [REDEPLOY_FRAUD_DESERIALIZER_KEY]: true,
        [REDEPLOY_BILLING_MAPPER_KEY]: false,
        [BACKFILL_ANALYTICS_WAREHOUSE_KEY]: false,
      },
    },
    incidentState: "only-loud-pipeline-fixed",
    values: {
      schemaViolationRatePercent: 0,
      billingDroppedEventCount: 860,
      billingUnbilledRevenueUsd: 21_400,
      analyticsCorruptedRowPercent: 71,
      fraudConsumerLagSeconds: 5,
      fraudPodRestartCount: 11,
      warehouseCompactionQueueDepth: 7,
      diagnosisPath: "fraud-only",
    },
    componentHealth: { ...healthyHealth, "billing-pipeline": "critical", "analytics-warehouse": "critical" },
  },

  // ── Plausible-but-inferior: restarting Fraud Detection's pods without
  // the shim or the deserializer fix. Lag briefly drains because the
  // crashed workers restart clean, but the still-incompatible stream
  // crashes them again within seconds — a real but temporary dip,
  // nothing is actually fixed, and Billing/Analytics are entirely
  // unaffected either way.
  {
    id: "restarted-fraud-pods-only-relapses",
    when: {
      triggerEquals: { schemaContractDrifting: true },
      controlEquals: {
        [RESTART_FRAUD_DETECTION_PODS_KEY]: true,
        [PUBLISH_SCHEMA_COMPAT_SHIM_KEY]: false,
      },
    },
    incidentState: "fraud-restart-relapsing",
    values: {
      schemaViolationRatePercent: 46,
      billingDroppedEventCount: 860,
      billingUnbilledRevenueUsd: 21_400,
      analyticsCorruptedRowPercent: 71,
      fraudConsumerLagSeconds: 380,
      fraudPodRestartCount: 64,
      warehouseCompactionQueueDepth: 8,
      diagnosisPath: "restarted-fraud-pods-only",
    },
    componentHealth: allBrokenHealth,
  },

  // ── Shim published, but no consumer-side remediation at all. Stops
  // the bleeding going forward (schemaViolationRatePercent drops to 0)
  // but every consumer still carries whatever it already dropped/
  // corrupted/queued — proof the shim alone is necessary but not
  // sufficient.
  {
    id: "shim-only-consumers-still-unrecovered",
    when: {
      triggerEquals: { schemaContractDrifting: true },
      controlEquals: {
        [PUBLISH_SCHEMA_COMPAT_SHIM_KEY]: true,
        [REDEPLOY_BILLING_MAPPER_KEY]: false,
        [BACKFILL_ANALYTICS_WAREHOUSE_KEY]: false,
        [REDEPLOY_FRAUD_DESERIALIZER_KEY]: false,
      },
    },
    incidentState: "shim-only",
    values: {
      schemaViolationRatePercent: 0,
      billingDroppedEventCount: 860,
      billingUnbilledRevenueUsd: 21_400,
      analyticsCorruptedRowPercent: 71,
      fraudConsumerLagSeconds: 410,
      fraudPodRestartCount: 52,
      warehouseCompactionQueueDepth: 7,
      diagnosisPath: "shim-only",
    },
    componentHealth: { ...healthyHealth, "billing-pipeline": "critical", "analytics-warehouse": "critical", "fraud-detection": "critical" },
  },

  // ── Baseline critical: drift active, candidate has taken no
  // meaningfully mitigating action yet. All three pipelines degrading in
  // their own distinct way, compounding every tick.
  {
    id: "drift-baseline-all-three-degrading",
    when: { triggerEquals: { schemaContractDrifting: true } },
    incidentState: "drifting",
    values: {
      schemaViolationRatePercent: 46,
      billingDroppedEventCount: 860,
      billingUnbilledRevenueUsd: 21_400,
      analyticsCorruptedRowPercent: 71,
      fraudConsumerLagSeconds: 410,
      fraudPodRestartCount: 52,
      warehouseCompactionQueueDepth: 8,
      diagnosisPath: "not-attempted",
    },
    componentHealth: allBrokenHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      schemaViolationRatePercent: 0,
      billingDroppedEventCount: 0,
      billingUnbilledRevenueUsd: 0,
      analyticsCorruptedRowPercent: 0,
      fraudConsumerLagSeconds: 4,
      fraudPodRestartCount: 0,
      warehouseCompactionQueueDepth: 3,
      diagnosisPath: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];
