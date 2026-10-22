import type { TimedEvent } from "@incidentrank/simulator";

const DOWNSTREAM_FAILURE_START_MS = 30_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "downstream-failure-begins",
    atMs: DOWNSTREAM_FAILURE_START_MS,
    type: "TRIGGER_SET",
    message: "The downstream service has begun timing out on all requests.",
    setTriggers: { downstreamFailing: true },
  },
];
