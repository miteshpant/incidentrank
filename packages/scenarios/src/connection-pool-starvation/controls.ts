import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation controls (non-destructive) ───────────────────────────
// Each is a toggle a candidate flips to signal "I looked here." None of
// these change component health, revenue loss, or cost — they only
// advance `investigation*Done`-style state keys, which the rule table
// reads to determine the authored `diagnosisPath` value (see rules.ts).
// This mirrors the reference incident's investigation-control pattern
// exactly (packages/scenarios/src/checkout-payment-inventory-redis-
// contention/controls.ts) — the engine has no separate "investigation
// action" primitive, by design.
export const INSPECT_DEPLOY_HISTORY_KEY = "inspectDeployHistory";
export const INSPECT_TRAFFIC_GRAPHS_KEY = "inspectTrafficGraphs";
export const INSPECT_POOL_CONFIG_KEY = "inspectPoolConfig";

// ── Remediation controls (state-mutating) ──────────────────────────────
export const RESTART_API_PODS_KEY = "restartApiPods";
export const SCALE_API_REPLICAS_KEY = "scaleApiReplicas";
export const DB_POOL_MAX_SIZE_KEY = "dbPoolMaxSize";

export const controls: ControlDefinition[] = [
  { key: INSPECT_DEPLOY_HISTORY_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_TRAFFIC_GRAPHS_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_POOL_CONFIG_KEY, allowedValues: [false, true], initialValue: false },
  { key: RESTART_API_PODS_KEY, allowedValues: [false, true], initialValue: false },
  { key: SCALE_API_REPLICAS_KEY, allowedValues: [false, true], initialValue: false },
  { key: DB_POOL_MAX_SIZE_KEY, allowedValues: [10, 25, 50, 100, 200], initialValue: 10 },
];
