import type { TimedEvent } from "@incidentrank/simulator";

const LEAK_ONSET_MS = 30_000;
const RECURRENCE_ESCALATION_MS = 5 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "leak-onset",
    atMs: LEAK_ONSET_MS,
    type: "TRIGGER_SET",
    message: "A recent deploy introduced a memory leak; usage has begun climbing steadily.",
    setTriggers: { leakActive: true },
  },
  {
    id: "leak-recurrence-escalation",
    atMs: RECURRENCE_ESCALATION_MS,
    type: "TRIGGER_SET",
    message: "Memory usage is climbing again; a one-time restart alone did not stop the underlying leak.",
    setTriggers: { leakActive: true, leakRecurred: true },
  },
];
