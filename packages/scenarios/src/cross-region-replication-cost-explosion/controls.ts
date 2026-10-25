import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Replication factor authored for the CRITICAL data class (e.g. ledger
 * / account-state records), as a plain regional-copy count. The
 * business-mandated durability policy floor for critical data is 3
 * full regional copies. 3 (the value the policy change set everyone
 * to, including classes that never needed it) keeps critical data
 * genuinely safe but is also the single largest driver of this
 * scenario's cost explosion once applied uniformly to every class.
 * Dropping this to 2 or 1 for CRITICAL data specifically (as opposed to
 * dropping fan-out scope for low-priority data, the SAFE lever below)
 * is what actually breaches the durability floor — a real, authored
 * policy violation, not a cosmetic relabeling. Numeric (not a string
 * enum) so rules.ts can gate the unsafe trap with a genuine
 * controlAtMost condition rather than enumerating every unsafe value by
 * hand.
 */
export const CRITICAL_REPLICATION_FACTOR_KEY = "criticalReplicationFactor";

/**
 * Replication factor for the LOW-PRIORITY data class (e.g. UI
 * telemetry, ephemeral analytics exports), as a plain regional-copy
 * count. The business invariant "not all data requires full active
 * replication to every region" applies squarely here: this class was
 * never policy-mandated to carry 3 full copies, so reducing it carries
 * no durability-floor risk at all — genuinely free cost relief, unlike
 * reducing the critical class's factor above.
 */
export const LOW_PRIORITY_REPLICATION_FACTOR_KEY = "lowPriorityReplicationFactor";

/**
 * Replication mode for the STANDARD data class (ordinary transactional
 * records that are not the ledger/account-state critical class but are
 * not disposable telemetry either). "sync" replicates to every target
 * region synchronously before acknowledging a write — the freshest
 * possible, most expensive mode. "async-batched" instead batches and
 * ships standard-class writes on a short delay — materially cheaper
 * (fewer, larger cross-region transfers) while keeping staleness
 * bounded to the batch interval, never unbounded. This is the
 * scenario's SECOND genuinely distinct safe lever (Strategy B): instead
 * of narrowing WHICH regions get a copy (Strategy A, below), this
 * lowers HOW urgently a copy is shipped for a class that does not need
 * synchronous freshness.
 */
export const STANDARD_REPLICATION_MODE_KEY = "standardReplicationMode";

/**
 * How many regions the LOW-PRIORITY class actively replicates to.
 * "all-regions" (the value the policy change set, inherited uniformly
 * from the critical-data fan-out rule) ships every low-priority write
 * to US, EU, AND APAC regardless of where it originated or who reads
 * it — real egress cost with no durability or freshness justification,
 * since low-priority data was never policy-mandated to need
 * disaster-recovery-grade regional coverage. "origin-plus-one" ships
 * each write to its origin region plus exactly one DR-designated
 * region — this is the scenario's Strategy A lever: narrowing
 * low-priority fan-out scope directly, independent of Strategy B's
 * sync/async lever on the standard class.
 */
export const LOW_PRIORITY_REGION_FAN_OUT_KEY = "lowPriorityRegionFanOut";

/**
 * Whether cross-region transfer payloads are compressed before
 * shipping. "off" (the value left over from before this policy
 * change, when fan-out was small enough that compression overhead
 * wasn't worth paying) ships raw payloads — compression CPU cost was
 * never worth it at the old, small fan-out volume, but at the new
 * expanded fan-out it is a real, legitimate, uniformly-safe lever:
 * "on" reduces cross-region transfer bytes for every class and every
 * region without touching durability or freshness for any of them,
 * genuinely free relief orthogonal to both Strategy A and Strategy B.
 */
export const TRANSFER_COMPRESSION_KEY = "transferCompression";

/**
 * Archive / Object Storage's own replication mode, independent of the
 * live Primary Data Store path. "full-sync" (the value the policy
 * change set uniformly) replicates archived/cold data synchronously to
 * every region just like live critical data — real, substantial, and
 * explicitly unnecessary cost, since the business invariant
 * "archived/low-priority data may use slower replication where
 * explicitly allowed" names archive data as the one class where this
 * is categorically true (not a judgment call, not a durability-floor
 * question) — archived data is, by definition, not on the
 * disaster-recovery critical path the way live critical data is.
 * "scheduled-batch" ships archive replication on a long batch
 * interval instead — a real, always-safe cost reduction for this one
 * class regardless of any other control's setting.
 */
export const ARCHIVE_REPLICATION_MODE_KEY = "archiveReplicationMode";

/**
 * Explicit pin protecting the CRITICAL data class's replication factor
 * from being touched by any later blanket cost-reduction action.
 * "false" (default, inherited from the policy change) means critical
 * data's replication factor is just another dial a candidate can turn
 * down along with everything else. "true" is this scenario's explicit,
 * named implementation of the business invariant "a cost optimization
 * must not silently weaken disaster-recovery guarantees below policy"
 * — engaging it is a deliberate, visible acknowledgment that critical
 * data's 3x floor is being protected on purpose, not merely left
 * alone by accident. It does not, by itself, reduce any cost — it is a
 * safety rail other levers are judged against, never a cost lever of
 * its own.
 */
export const CRITICAL_DATA_PINNING_KEY = "criticalDataPinning";

/**
 * How standard- and low-priority-class writes are batched before being
 * shipped across regions. "small-frequent" (inherited default) ships
 * many small cross-region transfers — real, measurable per-transfer
 * overhead at this fan-out volume. "large-batched" consolidates writes
 * into fewer, larger transfers, reducing per-transfer overhead cost for
 * whichever classes are already in async/batched mode — but batching
 * the CRITICAL class (which stays synchronous regardless of this
 * control once pinned) has no effect on it at all, since critical
 * data's replication mode is never batched-async in a policy-compliant
 * configuration.
 */
export const TRANSFER_BATCHING_KEY = "transferBatching";

export const controls: ControlDefinition[] = [
  {
    key: CRITICAL_REPLICATION_FACTOR_KEY,
    allowedValues: [3, 2, 1],
    initialValue: 3,
  },
  {
    key: LOW_PRIORITY_REPLICATION_FACTOR_KEY,
    allowedValues: [3, 2, 1],
    initialValue: 3,
  },
  {
    key: STANDARD_REPLICATION_MODE_KEY,
    allowedValues: ["sync", "async-batched"],
    initialValue: "sync",
  },
  {
    key: LOW_PRIORITY_REGION_FAN_OUT_KEY,
    allowedValues: ["all-regions", "origin-plus-one"],
    initialValue: "all-regions",
  },
  {
    key: TRANSFER_COMPRESSION_KEY,
    allowedValues: ["off", "on"],
    initialValue: "off",
  },
  {
    key: ARCHIVE_REPLICATION_MODE_KEY,
    allowedValues: ["full-sync", "scheduled-batch"],
    initialValue: "full-sync",
  },
  {
    key: CRITICAL_DATA_PINNING_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: TRANSFER_BATCHING_KEY,
    allowedValues: ["small-frequent", "large-batched"],
    initialValue: "small-frequent",
  },
];
