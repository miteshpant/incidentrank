import type { TimedEvent } from "@incidentrank/simulator";

const DEPLOY_ROLLOUT_MS = 30_000;
const HEALTH_CHECK_FLAPPING_MS = 5 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "deploy-rollout-begins",
    atMs: DEPLOY_ROLLOUT_MS,
    type: "TRIGGER_SET",
    message: "A rolling deploy has begun; every pod restart is triggering a consumer group rebalance.",
    setTriggers: { deployRollingOut: true },
  },
  {
    id: "health-check-flapping-begins",
    atMs: HEALTH_CHECK_FLAPPING_MS,
    type: "TRIGGER_SET",
    message: "The health check has started flapping, triggering additional unnecessary restarts.",
    setTriggers: { deployRollingOut: true, healthCheckFlapping: true },
  },
];
