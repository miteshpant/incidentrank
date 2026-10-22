import type { TimedEvent } from "@incidentrank/simulator";

const WRITE_BURST_MS = 30_000;
const REPORTING_JOB_MS = 5 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "write-burst-begins",
    atMs: WRITE_BURST_MS,
    type: "TRIGGER_SET",
    message: "A write-heavy batch job has started on the primary database.",
    setTriggers: { writeBurstActive: true },
  },
  {
    id: "reporting-job-starts",
    atMs: REPORTING_JOB_MS,
    type: "TRIGGER_SET",
    message: "A scheduled reporting job has started issuing large read queries against the replica.",
    setTriggers: { writeBurstActive: true, reportingJobRunning: true },
  },
];
