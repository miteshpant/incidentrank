import type { TimedEvent } from "@incidentrank/simulator";

const OWNERSHIP_STATE_STALE_MS = 30_000;
// A second wave: the backing store behind the Coordination Service's
// ownership table falls further behind, widening the staleness window
// itself (not merely continuing the existing trigger) — but only as the
// continuation of an already-visible trend. By this point
// staleLeaseCount/schedulerBacklogCount have already been climbing
// since OWNERSHIP_STATE_STALE_MS, so a candidate watching those is not
// surprised by this; it is an escalation of a known-visible condition,
// never a silent flip from a healthy-looking state.
const STALENESS_WIDENS_MS = OWNERSHIP_STATE_STALE_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "ownership-state-stale",
    atMs: OWNERSHIP_STATE_STALE_MS,
    type: "TRIGGER_SET",
    message:
      "The Coordination Service's ownership table has begun serving stale reads — some workers are being told they own work items another worker already claimed, and some claimed items are not being reflected back to any worker.",
    setTriggers: { ownershipStateStale: true },
  },
  {
    id: "ownership-staleness-widens",
    atMs: STALENESS_WIDENS_MS,
    type: "TRIGGER_SET",
    message:
      "The replication lag behind the ownership table has grown further. Stale leases and scheduler backlog, already rising, are now climbing faster.",
    setTriggers: { ownershipStateStale: true, stalenessWidened: true },
  },
];

export { OWNERSHIP_STATE_STALE_MS, STALENESS_WIDENS_MS };
