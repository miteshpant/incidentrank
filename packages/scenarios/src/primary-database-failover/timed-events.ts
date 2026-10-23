import type { TimedEvent } from "@incidentrank/simulator";

const PRIMARY_DEGRADING_MS = 30_000;
// Second wave: the primary, already visibly unhealthy and falling behind
// on replication acknowledgement since PRIMARY_DEGRADING_MS, becomes
// fully unavailable. This is a continuation of an already-visible trend
// (primaryHealthPct declining, replicationLagMs climbing, writeSuccessRatePct
// slipping have all been observable since the first event), never a
// surprise flip from a healthy-looking state.
const PRIMARY_UNAVAILABLE_MS = PRIMARY_DEGRADING_MS + 2 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "primary-degrading",
    atMs: PRIMARY_DEGRADING_MS,
    type: "TRIGGER_SET",
    message:
      "The primary database's health is declining: replication acknowledgement is slowing and write latency is rising.",
    setTriggers: { primaryDegrading: true },
  },
  {
    id: "primary-unavailable",
    atMs: PRIMARY_UNAVAILABLE_MS,
    type: "TRIGGER_SET",
    message:
      "The primary database has become unavailable. Writes against it are now failing outright.",
    setTriggers: { primaryDegrading: true, primaryUnavailable: true },
  },
];

export { PRIMARY_DEGRADING_MS, PRIMARY_UNAVAILABLE_MS };
