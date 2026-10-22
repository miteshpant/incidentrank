import type { TimedEvent } from "@incidentrank/simulator";

const BAD_CONFIG_PUSH_MS = 30_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "bad-config-pushed",
    atMs: BAD_CONFIG_PUSH_MS,
    type: "CONFIG_CHANGED",
    message: "A configuration change was just pushed that set the API rate limit far below normal traffic levels.",
    setTriggers: { badConfigActive: true },
  },
];
