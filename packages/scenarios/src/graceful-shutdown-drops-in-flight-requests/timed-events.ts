import type { TimedEvent } from "@incidentrank/simulator";
import { INCIDENT_START_MS } from "../timing";

const DEPLOY_BEGINS_MS = INCIDENT_START_MS;

export const timedEvents: TimedEvent[] = [
  {
    id: "rolling-deploy-begins",
    atMs: DEPLOY_BEGINS_MS,
    type: "TRIGGER_SET",
    message: "A rolling deploy has started. Checkout error rate and dropped-request counts are climbing.",
    setTriggers: { deployInProgress: true },
  },
];
