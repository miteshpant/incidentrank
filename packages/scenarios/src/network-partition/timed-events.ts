import type { TimedEvent } from "@incidentrank/simulator";

// The inter-region replication link between Region A and Region B is
// severed. Each region's local health checks still look fine in
// isolation -- the observable precursor the candidate actually sees is
// replicationHealth flipping to "broken" and, under the default routing,
// ledgerWriteAuthority flipping to "dual" with ledgerConsistencyViolationCount
// climbing the moment both sides independently accept ledger writes.
const NETWORK_PARTITION_MS = 30_000;

// Second wave: inter-region connectivity is restored. This does not
// retroactively change whether an earlier routing decision was safe -- it
// is a genuine, independent external event, observable the moment it
// happens via replicationHealth flipping back to "replicating". What
// happens next depends entirely on what the candidate did during the
// partition: a real ledger-violation count or profile backlog accrued
// during the split does not vanish just because the network healed.
const NETWORK_HEALED_MS = NETWORK_PARTITION_MS + 4 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "network-partition",
    atMs: NETWORK_PARTITION_MS,
    type: "TRIGGER_SET",
    message:
      "Inter-region replication between Region A and Region B has been severed. Each region can no longer confirm writes with the other.",
    setTriggers: { networkPartitioned: true },
  },
  {
    id: "network-healed",
    atMs: NETWORK_HEALED_MS,
    type: "TRIGGER_SET",
    message:
      "Inter-region replication between Region A and Region B has been restored. Both regions can exchange writes again.",
    setTriggers: { networkPartitioned: true, networkHealed: true },
  },
];

export { NETWORK_PARTITION_MS, NETWORK_HEALED_MS };
