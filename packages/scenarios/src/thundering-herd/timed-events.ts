import type { TimedEvent } from "@incidentrank/simulator";
import { INCIDENT_START_MS } from "../timing";

const SYNCHRONIZED_SPIKE_MS = INCIDENT_START_MS;

export const timedEvents: TimedEvent[] = [
  {
    id: "synchronized-spike-begins",
    atMs: SYNCHRONIZED_SPIKE_MS,
    type: "TRIGGER_SET",
    message: "The entire client fleet's scheduled refresh has fired simultaneously.",
    setTriggers: { synchronizedSpike: true },
  },
];
