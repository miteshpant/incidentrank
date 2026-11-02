import type { TimedEvent } from "@incidentrank/simulator";
import { INCIDENT_START_MS } from "../timing";

const BATCH_JOB_START_MS = INCIDENT_START_MS;
const SECOND_WORKLOAD_MS = 5 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "batch-job-begins",
    atMs: BATCH_JOB_START_MS,
    type: "TRIGGER_SET",
    message: "A scheduled batch job has started updating rows on a hot table.",
    setTriggers: { batchJobRunning: true },
  },
  {
    id: "second-workload-begins",
    atMs: SECOND_WORKLOAD_MS,
    type: "TRIGGER_SET",
    message: "A second concurrent batch job has started against the same table.",
    setTriggers: { batchJobRunning: true, secondWorkloadActive: true },
  },
];
