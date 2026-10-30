import type { TimedEvent } from "@incidentrank/simulator";

const CONTENTION_BEGINS_MS = 30_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "redis-contention-begins",
    atMs: CONTENTION_BEGINS_MS,
    type: "TRIGGER_SET",
    message: "Payment retries and Inventory latency have both started climbing.",
    setTriggers: { redisContending: true },
  },
];
