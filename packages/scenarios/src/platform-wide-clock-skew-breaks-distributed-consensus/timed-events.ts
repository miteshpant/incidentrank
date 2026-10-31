import type { TimedEvent } from "@incidentrank/simulator";

const CLOCK_SKEW_BEGINS_MS = 30_000;
const CASCADE_WIDENS_MS = 150_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "ntp-sync-fails",
    atMs: CLOCK_SKEW_BEGINS_MS,
    type: "TRIGGER_SET",
    message:
      "The primary NTP sync job has been failing silently for the last several cycles. Fleet node clocks are drifting apart.",
    setTriggers: { clockSkewActive: true },
  },
  {
    id: "cascade-widens",
    atMs: CASCADE_WIDENS_MS,
    type: "TRIGGER_SET",
    message:
      "Clock drift has continued unresynced. Lock service split-brain, ledger write reordering, and rate-limiter false throttling are all worsening together.",
    setTriggers: { clockSkewActive: true, skewCascadeWidened: true },
  },
];
