import type { TimedEvent } from "@incidentrank/simulator";

/** A sustained write-volume increase begins — not a one-time spike. Write
 * throughput climbs past what the replication stream can apply, and the
 * backlog begins growing continuously from this point on. */
const WRITE_SURGE_MS = 30_000;

/** Second wave: if the backlog has been left to grow unmitigated,
 * sustained replication-stream queueing finally exhausts the staging
 * storage set aside for unapplied write-ahead segments, pushing storage
 * pressure past its safe ceiling. This is reachable only as the
 * continuation of an already-visible trend — networkPressure and
 * storagePressure have both been climbing since WRITE_SURGE_MS, and
 * replicationLagMs/staleReadAgeMs have been visibly growing without
 * bound the whole time — never a surprise flip from a healthy-looking
 * state. */
const STORAGE_PRESSURE_CRITICAL_MS = WRITE_SURGE_MS + 4 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "write-surge-begins",
    atMs: WRITE_SURGE_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained write volume has risen above what the replication stream can apply; replication lag is beginning to grow continuously rather than settling back down.",
    setTriggers: { writeSurgeActive: true },
  },
  {
    id: "storage-pressure-critical",
    atMs: STORAGE_PRESSURE_CRITICAL_MS,
    type: "TRIGGER_SET",
    message:
      "Unapplied write-ahead segments have continued to accumulate; staging storage for the replication stream is now approaching capacity.",
    setTriggers: { writeSurgeActive: true, storageNearCapacity: true },
  },
];

export { WRITE_SURGE_MS, STORAGE_PRESSURE_CRITICAL_MS };
