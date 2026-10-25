import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Whether the inter-region replication link is currently healthy.
  // "replicating" is the only safe value; "broken" means Region A and
  // Region B can no longer exchange writes with each other.
  replicationHealth: "replicating",
  // Customer-facing read/write availability, per region, 0-100. Can read
  // 100 in BOTH regions while ledgerConsistencyViolationCount is actively
  // climbing underneath -- that combination is exactly the trap this
  // scenario exists to catch for ledger operations specifically.
  regionAAvailability: 100,
  regionBAvailability: 100,
  // Age, in seconds, of the most stale profile read a region might be
  // serving. Zero when replication is healthy or when a region is routed
  // through the current ledger/profile authority. Profile data is
  // explicitly allowed to go stale per the business requirement -- this
  // is a candidate-visible cost of the eventual-multi-region tradeoff,
  // not a correctness failure.
  profileStaleReadAgeSeconds: 0,
  // Count of profile writes accepted locally by a region during the
  // partition that have not yet been reconciled with the other region.
  // Zero is the safe/caught-up value; nonzero while the partition is
  // active and eventual-multi-region profile writes are being accepted
  // in more than one place. This is an ACCEPTED, bounded tradeoff for
  // profile data, never a correctness violation -- unlike the ledger
  // field below, nothing here is ever gated on by successCondition.
  profileUnreconciledWriteCount: 0,
  // THE correctness field for ledger (account-balance / financial
  // transaction) writes. Zero is the only safe value. Counts ledger
  // writes that were accepted by more than one region independently
  // during the partition -- i.e. an actual divergent-balance risk. This
  // is the field successCondition gates on directly for ledger safety; it
  // stays nonzero for as long as both regions accept ledger writes
  // locally during a partition, no matter how healthy
  // regionAAvailability/regionBAvailability read in either region.
  ledgerConsistencyViolationCount: 0,
  // Which side(s) are currently accepting ledger writes right now.
  // "single" is the only safe value (exactly one region, or neither, is
  // authoritative for ledger writes at a time); "dual" means both regions
  // are independently accepting ledger writes during the partition --
  // the unsafe state, directly observable and distinct from the
  // availability metrics above.
  ledgerWriteAuthority: "single",
  // Ledger reads served per minute that were flagged as possibly behind
  // the authoritative region's latest write (relevant once ledger writes
  // are correctly routed to a single region and the OTHER region is
  // still serving ledger reads). Zero when stale ledger reads are
  // blocked or when no partition is active.
  staleLedgerReadsServedPerMin: 0,
  // Severity field (exactly "normal"|"warning"|"critical", per
  // SeverityFieldConfig) tracking the replicated service's own assessment
  // of ledger-consistency risk -- distinct from replicationHealth/
  // ledgerWriteAuthority, whose value sets are not the normal/warning/
  // critical enum. "critical" only while ledger writes are genuinely,
  // simultaneously accepted by both regions; "warning" while safe-but-
  // imperfect (stale ledger reads being served, or a real unreconciled
  // profile backlog); "normal" for every genuinely safe ledger state.
  ledgerSafetyStatus: "normal",
  // Generic string-state field recording HOW ledger write safety is
  // currently being maintained, not merely whether it currently holds.
  // "single-region-routed" = the durable, structural fix: ledger writes
  // are routed through exactly one authoritative region regardless of
  // which region a request lands in, so this stays safe through any
  // future partition too, with no manual judgment call required.
  // "region-isolated" = safe only because the candidate manually
  // isolated (read-only/offline) the non-authoritative region -- correct
  // right now, but not backed by the structural routing guarantee.
  // "both-isolated" = safe but needlessly conservative (both regions
  // taken off ledger writes entirely). "unresolved" = no safety
  // mechanism has engaged; covers both the untouched baseline and the
  // active dual-write trap. Read only by scoring's dataIntegrity-adjacent
  // measure, never by any scenario-specific scorer code.
  ledgerSafetyMechanism: "unresolved",
};
