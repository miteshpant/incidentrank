import type { TimedEvent } from "@incidentrank/simulator";

// Source order volume has grown steadily; tonight is the first night the
// reconciliation job's own runtime (now ~34 minutes) exceeds its 30-minute
// schedule interval. The next scheduled fire launches a second instance
// before the first one has finished — overlap begins.
const OVERLAP_BEGINS_MS = 30_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "job-overlap-begins",
    atMs: OVERLAP_BEGINS_MS,
    type: "TRIGGER_SET",
    message:
      "The nightly reconciliation job's run duration has exceeded the 30-minute schedule interval — the next scheduled run fired while the previous run was still in progress.",
    setTriggers: { jobOverlapping: true },
  },
];
