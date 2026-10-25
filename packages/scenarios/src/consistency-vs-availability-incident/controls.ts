import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Consistency mode for account-balance writes (the consistency-critical
 * operation category — balance changes must never be processed against
 * stale or unconfirmed data). "strong" means a balance write is only
 * accepted once BOTH regions have cross-confirmed it — safe, but during
 * a cross-region connectivity problem this means balance writes that
 * can't get cross-confirmed are rejected rather than applied, costing
 * write availability for this category. "relaxed" means a region
 * accepts and applies a balance write using only its own local view,
 * with no cross-region confirmation required — this is the one
 * genuinely unsafe move this scenario is built to catch: it keeps
 * balance writes available during the connectivity problem, but risks
 * two regions independently accepting conflicting balance writes against
 * the same account with neither side aware of the other's write.
 */
export const BALANCE_CONSISTENCY_MODE_KEY = "balanceConsistencyMode";

/**
 * Consistency mode for catalog-view writes/reads (the staleness-tolerant
 * operation category — a catalog view lagging by a few seconds causes no
 * customer harm). "strong" applies the same cross-region confirmation
 * requirement as balance writes — safe, but needlessly sacrifices
 * availability on a category that never needed that guarantee in the
 * first place. "relaxed" lets each region serve/accept catalog writes
 * from its own local view without waiting on the other region — full
 * availability, with only bounded, business-acceptable staleness as the
 * cost, never an unresolved correctness violation (catalog entries have
 * no "double-spend" shape — the eventual converged value is the same
 * regardless of which region's write arrived last).
 */
export const CATALOG_CONSISTENCY_MODE_KEY = "catalogConsistencyMode";

/**
 * How the data service routes writes while regions cannot reliably
 * confirm with each other. "both-regions" lets each region keep
 * accepting local writes independently for whichever category is set to
 * "relaxed" (the default, intended shape of this control). "single-
 * region-a" / "single-region-b" force ALL write traffic — for BOTH
 * categories — to one named region, taking the other region fully off
 * the write path. This is a valid, if more conservative, way to avoid
 * any cross-region divergence risk for a "relaxed" category too, at the
 * cost of concentrating all load (and all customer traffic latency) on
 * one region.
 */
export const WRITE_ROUTING_KEY = "writeRouting";

/**
 * Required confirmations before a "strong" write is accepted. "both-
 * regions" is the real cross-region confirmation strong consistency
 * depends on. "local-only" quietly removes that requirement even while
 * a category control is still set to "strong" — a configuration trap:
 * the category control reads as the safe choice, but the quorum
 * requirement backing it has been pulled out from under it.
 */
export const QUORUM_REQUIREMENT_KEY = "quorumRequirement";

/**
 * Whether balance writes that could not get cross-region confirmation
 * while "strong" mode is active are queued for later application (once
 * connectivity returns) or rejected outright at request time. "queue"
 * keeps every balance write attempt eventually applied once
 * connectivity heals, at the cost of added latency/queue depth visible
 * to the client during the connectivity problem. "reject" returns an
 * immediate, explicit failure to the client instead of holding it —
 * faster feedback to the caller, but the write itself does not happen
 * unless the client retries after connectivity returns.
 */
export const UNCONFIRMED_WRITE_POLICY_KEY = "unconfirmedWritePolicy";

/**
 * Once cross-region connectivity is restored, how divergent catalog
 * writes accepted independently by both regions during the "relaxed"
 * window get reconciled. "last-write-wins" converges every diverging key
 * immediately by timestamp. "merge-latest-per-field" is the slower,
 * field-aware reconciliation that avoids discarding an unrelated field's
 * update just because another field on the same catalog entry also
 * changed on the other side.
 */
export const CATALOG_RECONCILIATION_KEY = "catalogReconciliationPolicy";

export const controls: ControlDefinition[] = [
  {
    key: BALANCE_CONSISTENCY_MODE_KEY,
    allowedValues: ["strong", "relaxed"],
    // Defaults to "relaxed" -- before this connectivity problem, both
    // regions simply applied every write locally with no cross-region
    // confirmation, because there was never a reason to pay that latency
    // cost while connectivity was healthy. This default is exactly what
    // makes the incident real: a candidate who changes nothing keeps
    // every write immediately available in both regions (both
    // availability metrics read 100), while balance writes silently risk
    // landing in conflict the entire time connectivity stays degraded.
    initialValue: "relaxed",
  },
  {
    key: CATALOG_CONSISTENCY_MODE_KEY,
    allowedValues: ["strong", "relaxed"],
    // Same pre-incident default as balance mode -- catalog writes were
    // also already being applied locally in both regions. Unlike
    // balance mode, leaving this at "relaxed" is never unsafe (no
    // correctness violation is possible for catalog data), so a
    // candidate who correctly leaves this untouched while fixing balance
    // mode is making the right call, not an oversight.
    initialValue: "relaxed",
  },
  {
    key: WRITE_ROUTING_KEY,
    allowedValues: ["both-regions", "single-region-a", "single-region-b"],
    initialValue: "both-regions",
  },
  {
    key: QUORUM_REQUIREMENT_KEY,
    allowedValues: ["both-regions", "local-only"],
    initialValue: "both-regions",
  },
  {
    key: UNCONFIRMED_WRITE_POLICY_KEY,
    allowedValues: ["queue", "reject"],
    initialValue: "queue",
  },
  {
    key: CATALOG_RECONCILIATION_KEY,
    allowedValues: ["last-write-wins", "merge-latest-per-field"],
    initialValue: "last-write-wins",
  },
];
