import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation controls (non-destructive) ───────────────────────────
// Toggles a candidate flips to signal "I looked here." None of these
// change component health, revenue loss, or cost — they only advance
// `investigation*Done` state keys, which the rule table reads to
// determine the authored `diagnosisPath` value (see rules.ts). Same
// pattern as the checkout-payment-inventory-redis-contention reference
// incident's investigation controls.
export const INSPECT_WORKER_LOGS_KEY = "inspectWorkerLogs";
export const INSPECT_DEPLOY_DIFF_KEY = "inspectDeployDiff";
export const INSPECT_QUEUE_DEPTH_KEY = "inspectQueueDepth";

// ── Remediation controls (state-mutating) ──────────────────────────────
// Track A — fix the deploy so workers can actually consume again.
export const ROLLBACK_WORKER_DEPLOY_KEY = "rollbackWorkerDeploy";
// Plausible-but-inferior: restarting the pods without rolling back the
// bad env var just crash-loops them again — the root cause is the
// environment variable baked into the new deploy, not a stuck process.
export const RESTART_WORKER_PODS_KEY = "restartWorkerPods";

// Track B — drain the backlog once workers are healthy again. Genuinely
// independent of Track A: raising worker concurrency while the deploy is
// still broken does nothing (there are zero healthy consumers to scale),
// and rolling back the deploy alone leaves the accumulated backlog to
// drain at normal (slow) throughput for a long time.
export const WORKER_CONCURRENCY_KEY = "workerConcurrencyPerPod";
// Plausible-but-inferior: pausing producers stops the backlog from
// growing further, but does not drain a single already-enqueued job and
// does not address the dead-consumer root cause either.
export const PAUSE_PRODUCERS_KEY = "pauseProducers";

export const controls: ControlDefinition[] = [
  { key: INSPECT_WORKER_LOGS_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_DEPLOY_DIFF_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_QUEUE_DEPTH_KEY, allowedValues: [false, true], initialValue: false },
  { key: ROLLBACK_WORKER_DEPLOY_KEY, allowedValues: [false, true], initialValue: false },
  { key: RESTART_WORKER_PODS_KEY, allowedValues: [false, true], initialValue: false },
  { key: WORKER_CONCURRENCY_KEY, allowedValues: [4, 8, 16, 32], initialValue: 4 },
  { key: PAUSE_PRODUCERS_KEY, allowedValues: [false, true], initialValue: false },
];
