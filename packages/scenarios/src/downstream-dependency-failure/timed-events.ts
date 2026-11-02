import type { TimedEvent } from "@incidentrank/simulator";
import { INCIDENT_START_MS } from "../timing";

const DOWNSTREAM_FAILURE_START_MS = INCIDENT_START_MS;

export const timedEvents: TimedEvent[] = [
  {
    id: "downstream-failure-begins",
    atMs: DOWNSTREAM_FAILURE_START_MS,
    type: "TRIGGER_SET",
    message: "The downstream service has begun timing out on all requests.",
    setTriggers: { downstreamFailing: true },
  },
];
