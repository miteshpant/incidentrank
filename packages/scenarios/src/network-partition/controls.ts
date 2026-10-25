import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Business consistency requirement (stated in the candidate briefing, see
 * network-partition.ts's description): ledger writes (account balance /
 * financial transaction state) must never be accepted by more than one
 * region at the same time during a partition. "single-region-authoritative"
 * routes every ledger write through exactly one region regardless of which
 * region a request physically lands on — the only setting that keeps
 * ledgerConsistencyViolationCount at zero. "local-region-authoritative" is
 * the dangerous default: each region accepts ledger writes it receives
 * using only its own local view, with no cross-region check — during a
 * partition this lets both regions accept divergent ledger writes
 * independently while each side's own write-success metrics read 100%.
 */
export const LEDGER_WRITE_ROUTING_KEY = "ledgerWriteRouting";

/** Which single region is authoritative for ledger writes when
 * LEDGER_WRITE_ROUTING_KEY is "single-region-authoritative". Irrelevant
 * (but still a real, authored choice) when routing is left at
 * "local-region-authoritative" — the two controls are independent; this
 * one only matters once single-region routing is actually selected. */
export const LEDGER_AUTHORITATIVE_REGION_KEY = "ledgerAuthoritativeRegion";

/** Business consistency requirement: profile data (display name, UI
 * preferences, notification settings) MAY legitimately tolerate temporary
 * staleness or degraded availability during a partition — unlike ledger
 * writes, there is no correctness requirement here, only an availability/
 * freshness tradeoff. "eventual-multi-region" keeps profile writes
 * available in both regions during the partition (each side accepts
 * writes locally, to be reconciled once connectivity returns) — a
 * deliberate, bounded, genuinely defensible tradeoff. "strong-single-
 * region" instead routes profile writes through one region only, same as
 * ledger — fully consistent, but it sacrifices profile-write availability
 * in the non-authoritative region for a correctness guarantee the business
 * never actually required for this data. */
export const PROFILE_CONSISTENCY_MODE_KEY = "profileConsistencyMode";

/** Region A's current access mode for read traffic and non-ledger
 * operations. "serving" keeps the region in normal rotation. "read-only"
 * continues serving reads (including possibly-stale reads during the
 * partition) while rejecting writes. "isolated" removes the region from
 * customer traffic entirely. */
export const REGION_A_ISOLATION_KEY = "regionAIsolation";

/** Region B's current access mode. Same three values and meaning as
 * REGION_A_ISOLATION_KEY, applied to Region B. */
export const REGION_B_ISOLATION_KEY = "regionBIsolation";

/** Whether stale-read protection is enabled for ledger reads specifically
 * (balance lookups, transaction history) in the non-authoritative region
 * while ledger writes are routed elsewhere. "block-stale-reads" rejects a
 * ledger read in the non-authoritative region rather than risk serving a
 * balance that is behind the authoritative region's latest write —
 * trading read availability in that region for correctness on what the
 * customer sees. "allow-stale-reads" keeps ledger reads available
 * everywhere but can show a balance that does not yet reflect the
 * authoritative region's latest write. */
export const LEDGER_READ_MODE_KEY = "ledgerReadMode";

export const controls: ControlDefinition[] = [
  {
    key: LEDGER_WRITE_ROUTING_KEY,
    allowedValues: ["local-region-authoritative", "single-region-authoritative"],
    initialValue: "local-region-authoritative",
  },
  {
    key: LEDGER_AUTHORITATIVE_REGION_KEY,
    allowedValues: ["region-a", "region-b"],
    initialValue: "region-a",
  },
  {
    key: PROFILE_CONSISTENCY_MODE_KEY,
    allowedValues: ["eventual-multi-region", "strong-single-region"],
    initialValue: "eventual-multi-region",
  },
  {
    key: REGION_A_ISOLATION_KEY,
    allowedValues: ["serving", "read-only", "isolated"],
    initialValue: "serving",
  },
  {
    key: REGION_B_ISOLATION_KEY,
    allowedValues: ["serving", "read-only", "isolated"],
    initialValue: "serving",
  },
  {
    key: LEDGER_READ_MODE_KEY,
    allowedValues: ["allow-stale-reads", "block-stale-reads"],
    initialValue: "allow-stale-reads",
  },
];
