import type { TimedEvent } from "@incidentrank/simulator";

const SATURATION_START_MS = 30_000;
const ESCALATION_MS = 5 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "saturation-begins",
    atMs: SATURATION_START_MS,
    type: "TRIGGER_SET",
    message: "A marketing-driven traffic spike is exhausting the connection pool.",
    setTriggers: { saturating: true },
  },
  {
    id: "batch-job-overlap",
    atMs: ESCALATION_MS,
    type: "TRIGGER_SET",
    message: "A scheduled analytics batch job has started competing for the same pool.",
    setTriggers: { saturating: true, batchJobRunning: true },
  },
];
