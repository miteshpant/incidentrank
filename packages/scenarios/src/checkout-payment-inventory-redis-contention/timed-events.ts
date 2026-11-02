import type { TimedEvent } from "@incidentrank/simulator";
import { INCIDENT_START_MS } from "../timing";

const CONTENTION_BEGINS_MS = INCIDENT_START_MS;

export const timedEvents: TimedEvent[] = [
  {
    id: "redis-contention-begins",
    atMs: CONTENTION_BEGINS_MS,
    type: "TRIGGER_SET",
    message: "Payment retries and Inventory latency have both started climbing.",
    setTriggers: { redisContending: true },
  },
];
