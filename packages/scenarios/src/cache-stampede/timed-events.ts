import type { TimedEvent } from "@incidentrank/simulator";
import { INCIDENT_START_MS } from "../timing";

const STAMPEDE_START_MS = INCIDENT_START_MS;

export const timedEvents: TimedEvent[] = [
  {
    id: "stampede-begins",
    atMs: STAMPEDE_START_MS,
    type: "TRIGGER_SET",
    message: "A popular cache key has expired under peak read traffic — requests are missing the cache simultaneously.",
    setTriggers: { stampedeActive: true },
  },
];
