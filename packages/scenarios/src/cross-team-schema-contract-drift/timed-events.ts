import type { TimedEvent } from "@incidentrank/simulator";

const SCHEMA_DRIFT_BEGINS_MS = 30_000;
const COMPACTION_JOB_BEGINS_MS = 45_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "schema-drift-begins",
    atMs: SCHEMA_DRIFT_BEGINS_MS,
    type: "TRIGGER_SET",
    message:
      "Orders Service deployed a new event shape. Billing, Analytics, and Fraud Detection are each showing different symptoms.",
    setTriggers: { schemaContractDrifting: true },
  },
  {
    id: "unrelated-compaction-job-begins",
    atMs: COMPACTION_JOB_BEGINS_MS,
    type: "TRIGGER_SET",
    message: "The warehouse's nightly storage compaction job has started (scheduled, unrelated).",
    setTriggers: { compactionJobRunning: true },
  },
];
