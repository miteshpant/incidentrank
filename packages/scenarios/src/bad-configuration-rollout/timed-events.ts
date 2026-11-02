import type { TimedEvent } from "@incidentrank/simulator";
import { INCIDENT_START_MS } from "../timing";

const BAD_CONFIG_PUSH_MS = INCIDENT_START_MS;

export const timedEvents: TimedEvent[] = [
  {
    id: "bad-config-pushed",
    atMs: BAD_CONFIG_PUSH_MS,
    type: "CONFIG_CHANGED",
    message: "A configuration change was just pushed that set the API rate limit far below normal traffic levels.",
    setTriggers: { badConfigActive: true },
  },
];
