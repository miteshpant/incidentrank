import type { ControlDefinition } from "@incidentrank/simulator";

export const CONSUMER_INSTANCES_KEY = "consumerInstances";
export const MAX_POLL_RECORDS_KEY = "maxPollRecords";
export const AUTO_COMMIT_ENABLED_KEY = "autoCommitEnabled";

export const controls: ControlDefinition[] = [
  { key: CONSUMER_INSTANCES_KEY, allowedValues: [2, 4, 8, 16], initialValue: 2 },
  {
    key: MAX_POLL_RECORDS_KEY,
    allowedValues: [100, 500, 1_000, 5_000],
    initialValue: 500,
  },
  {
    key: AUTO_COMMIT_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
