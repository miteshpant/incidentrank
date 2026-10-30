import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation controls (non-destructive) ───────────────────────────
// Each is a toggle a candidate flips to signal "I looked here." None of
// these change component health, revenue loss, or cost — they only
// advance `investigation*Done` state keys, which the rule table reads to
// determine the authored `diagnosisPath` value (see rules.ts). This is
// the "investigation" kind described in Phase 10F's authoring schema
// (AuthoredControl.kind): purely descriptive to the candidate UI, with
// its actual non-destructive behavior coming entirely from how the rule
// table and action-classification table treat these specific keys — the
// engine has no separate "investigation action" primitive, by design
// (docs/implementation_plan/phase10f.md's "do not introduce a new
// runtime").
export const INSPECT_PAYMENT_METRICS_KEY = "inspectPaymentMetrics";
export const INSPECT_INVENTORY_DEPLOYS_KEY = "inspectInventoryDeploys";
export const INSPECT_REDIS_CONNECTIONS_KEY = "inspectRedisConnections";

// ── Remediation controls (state-mutating) ──────────────────────────────
export const RESTART_PAYMENT_PODS_KEY = "restartPaymentPods";
export const ROLLBACK_INVENTORY_DEPLOY_KEY = "rollbackInventoryDeploy";
export const REDIS_CONNECTION_POOL_KEY = "redisConnectionPoolSize";

export const controls: ControlDefinition[] = [
  { key: INSPECT_PAYMENT_METRICS_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_INVENTORY_DEPLOYS_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_REDIS_CONNECTIONS_KEY, allowedValues: [false, true], initialValue: false },
  { key: RESTART_PAYMENT_PODS_KEY, allowedValues: [false, true], initialValue: false },
  { key: ROLLBACK_INVENTORY_DEPLOY_KEY, allowedValues: [false, true], initialValue: false },
  { key: REDIS_CONNECTION_POOL_KEY, allowedValues: [128, 256, 512, 1_024], initialValue: 128 },
];
