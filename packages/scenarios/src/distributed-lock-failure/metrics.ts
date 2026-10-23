import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Rate (per minute) at which workers attempt to acquire a lock that is
  // currently held by another worker.
  lockContentionRate: 2,
  // Count of leases that expired while the worker holding them was
  // still actively, legitimately processing (not crashed) — the direct
  // precursor to a second worker acquiring the "same" lock.
  leaseExpiryDuringProcessingCount: 0,
  // Count of job windows where two workers simultaneously believed they
  // held the same lock. Zero is the only safe value.
  overlappingOwnerCount: 0,
  // Count of job units processed more than once as a direct result of
  // overlapping ownership (both the original and the new "owner" running
  // the same unit of work against the shared resource).
  duplicateWorkCount: 0,
  // Direct, authored evidence of a concurrent conflicting write actually
  // landing on the shared resource because of overlapping ownership —
  // the real correctness-violation field Data Integrity scoring gates
  // on. Zero is the only safe value; a fenced/rejected write never
  // increments this even when overlappingOwnerCount is nonzero.
  correctnessViolationCount: 0,
  // Average processing duration per job, milliseconds. Rises when a
  // downstream dependency the job touches is itself under load.
  processingDurationMs: 4_000,
  // How long the shared resource is effectively unreachable/blocked
  // after a worker genuinely crashes while holding the lock, before the
  // lease expires and another worker can take over. Zero while no
  // worker has crashed.
  resourceBlockedSeconds: 0,
  lockServiceStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Missing Database
  // Index's orderHistoryQueryHealth / Kafka Partition Skew's
  // orderingMode) distinguishing WHY the system is currently safe, not
  // merely THAT it is. "fenced" = the durable fix: ownership is
  // validated at write time, so overlapping ownership (if it occurs at
  // all) can never corrupt the shared resource, independent of lease
  // duration and independent of any future crash. "renewed" = safe
  // only because every worker involved so far has stayed alive long
  // enough to keep heartbeating; a worker crash still blocks the
  // resource for up to the full configured lease. "unresolved" = no
  // safety mechanism has engaged yet. Read only by scoring's
  // dataIntegrity-adjacent measure, never by any scenario-specific
  // scorer code.
  lockSafetyMechanism: "unresolved",
};
