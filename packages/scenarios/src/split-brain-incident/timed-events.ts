import type { TimedEvent } from "@incidentrank/simulator";

// The network link between Region A and Region B is severed. Each
// region's local health checks still look fine in isolation -- the
// observable precursor the candidate actually sees is leaderCount
// climbing to 2 and writeAuthorityState flipping to "dual" the moment
// both sides decide, independently, that they hold leadership (under
// the default any-single-region quorum setting).
const NETWORK_PARTITION_MS = 30_000;

// Second wave: connectivity between the two regions is restored. This
// does not retroactively change whether an earlier handback decision
// was safe -- it is a genuine, independent external event, observable
// the moment it happens via partitionState flipping to "healed". What
// happens next depends entirely on what the candidate did during the
// partition: if both sides were ever writable, there is now a real,
// visible backlog of unreconciled divergent writes to deal with; if
// only one side was ever writable, healing is a non-event.
const NETWORK_HEALED_MS = NETWORK_PARTITION_MS + 4 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "network-partition",
    atMs: NETWORK_PARTITION_MS,
    type: "TRIGGER_SET",
    message:
      "Network connectivity between Region A and Region B has been severed. Each region can no longer see the other's nodes.",
    setTriggers: { networkPartitioned: true },
  },
  {
    id: "network-healed",
    atMs: NETWORK_HEALED_MS,
    type: "TRIGGER_SET",
    message:
      "Network connectivity between Region A and Region B has been restored. Both regions can see each other's nodes again.",
    setTriggers: { networkPartitioned: true, networkHealed: true },
  },
];

export { NETWORK_PARTITION_MS, NETWORK_HEALED_MS };
