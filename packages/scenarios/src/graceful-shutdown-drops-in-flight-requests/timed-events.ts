import type { TimedEvent } from "@incidentrank/simulator";

const DEPLOY_BEGINS_MS = 30_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "rolling-deploy-begins",
    atMs: DEPLOY_BEGINS_MS,
    type: "TRIGGER_SET",
    message: "A rolling deploy has started. Checkout error rate and dropped-request counts are climbing.",
    setTriggers: { deployInProgress: true },
  },
];
