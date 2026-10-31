import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation controls (non-destructive) ───────────────────────────
// Toggles a candidate flips to signal "I looked here." None of these
// change component health, revenue loss, or cost — they only advance
// `investigation*Done` state keys, which the rule table reads to
// determine the authored `diagnosisPath` value (see rules.ts). Mirrors
// the Checkout/Payment/Inventory/Redis reference incident's investigation
// pattern exactly (packages/scenarios/src/checkout-payment-inventory-
// redis-contention/controls.ts).
export const INSPECT_SHUTDOWN_HOOK_LOGS_KEY = "inspectShutdownHookLogs";
export const INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY = "inspectLoadBalancerDrainEvents";
export const INSPECT_DEPLOY_HISTORY_KEY = "inspectDeployHistory";

// ── Remediation controls (state-mutating) ──────────────────────────────
// The branching choice: raise the pod's termination grace period /
// in-process drain timeout (fast deploys get a little slower, but
// in-flight requests actually get to finish), OR switch the rollout
// strategy to surge/blue-green (deploys take noticeably longer and cost
// more capacity during the rollout window, but pods are never killed
// mid-request because the old generation keeps serving until the new one
// is fully up). Both are legitimate fixes for the same root cause with a
// different tradeoff — the authored distinction scoring.ts reads off
// `diagnosisPath`/`remediationApproach`, never a quality judgment baked
// into the rule table itself.
export const DRAIN_TIMEOUT_SECONDS_KEY = "drainTimeoutSeconds";
export const DEPLOY_STRATEGY_KEY = "deployStrategy";

// ── Plausible-but-inferior remediation ──────────────────────────────────
// Scaling out replica count is a reasonable instinct when requests are
// failing during deploys — more pods should mean less per-pod traffic to
// drop, right? But the drop happens because EVERY pod's shutdown hook
// fails to drain, regardless of how many pods exist — so this does
// nothing to the per-deploy drop rate and just costs more every month.
export const REPLICA_COUNT_KEY = "replicaCount";

export const controls: ControlDefinition[] = [
  { key: INSPECT_SHUTDOWN_HOOK_LOGS_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_DEPLOY_HISTORY_KEY, allowedValues: [false, true], initialValue: false },
  { key: DRAIN_TIMEOUT_SECONDS_KEY, allowedValues: [0, 5, 15, 30, 45], initialValue: 0 },
  {
    key: DEPLOY_STRATEGY_KEY,
    allowedValues: ["rolling", "surge", "blue-green"],
    initialValue: "rolling",
  },
  { key: REPLICA_COUNT_KEY, allowedValues: [4, 6, 8, 12], initialValue: 4 },
];
