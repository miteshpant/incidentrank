import type { TimedEvent } from "@incidentrank/simulator";

const STAMPEDE_START_MS = 30_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "stampede-begins",
    atMs: STAMPEDE_START_MS,
    type: "TRIGGER_SET",
    message: "A popular cache key has expired under peak read traffic — requests are missing the cache simultaneously.",
    setTriggers: { stampedeActive: true },
  },
];
