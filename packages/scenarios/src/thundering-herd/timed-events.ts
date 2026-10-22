import type { TimedEvent } from "@incidentrank/simulator";

const SYNCHRONIZED_SPIKE_MS = 30_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "synchronized-spike-begins",
    atMs: SYNCHRONIZED_SPIKE_MS,
    type: "TRIGGER_SET",
    message: "The entire client fleet's scheduled refresh has fired simultaneously.",
    setTriggers: { synchronizedSpike: true },
  },
];
