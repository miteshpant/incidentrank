import type { TimedEvent } from "@incidentrank/simulator";
import { INCIDENT_START_MS } from "../timing";

const DEPLOY_BREAKS_WORKERS_MS = INCIDENT_START_MS;

export const timedEvents: TimedEvent[] = [
  {
    id: "worker-deploy-breaks-consumers",
    atMs: DEPLOY_BREAKS_WORKERS_MS,
    type: "TRIGGER_SET",
    message:
      "A new worker deploy went out. Worker pods are crash-looping on startup and active consumer count has dropped to zero. Producers are still publishing normally.",
    setTriggers: { workersDead: true },
  },
];
