import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Write authority during the migration. "dual" (the default/incident
 * start) means the Migration Layer attempts to write every request to
 * BOTH Legacy Service/DB and New Service/DB — this is the root
 * mechanism: an individual write can succeed on one side and fail on
 * the other (timeout, validation mismatch, capacity), and whichever
 * side it failed on now silently diverges from the side that
 * succeeded. "legacy-only" and "new-only" each pick exactly one
 * authoritative write target and stop attempting the other side
 * entirely — this is what freezes further divergence (new divergent
 * records stop accumulating), but it does NOT retroactively repair any
 * divergence that already exists from the dual-write window (see
 * unreconciledDivergentRecordCount in metrics.ts).
 */
export const WRITE_MODE_KEY = "writeMode";

/**
 * Which system reads are served from. "cohort" (default) routes reads
 * by rollout cohort — some customers read Legacy, some read New,
 * exactly mirroring whichever side their account was assigned to by
 * ROLLOUT_PERCENT_KEY. This is the business-invariant trap: once
 * unreconciled divergence exists, a cohort (or "legacy"/"new") read can
 * serve a value that silently omits an acknowledged write that only
 * landed on the other side — "exposing unresolved divergent state" is
 * a real, counted correctness event (see exposedDivergentReadCount),
 * not merely a hypothetical risk.
 */
export const READ_SOURCE_KEY = "readSource";

/**
 * Percentage of traffic currently assigned to the New-system migration
 * cohort (the rest stays on the Legacy cohort for read-routing
 * purposes). Raising this while unreconciled divergence is high and
 * write mode is still "dual" increases the volume of new dual-write
 * attempts — directly accelerating how fast
 * unreconciledDivergentRecordCount grows, since more concurrent
 * requests means more chances for an asymmetric write outcome. This is
 * the scenario's PRESSURE-TRANSFER-ADJACENT rollout lever: pushing
 * rollout forward to "make migration progress" while the system is
 * still dual-writing and diverging makes the underlying correctness
 * problem measurably worse, not better.
 */
export const ROLLOUT_PERCENT_KEY = "rolloutPercent";

/**
 * The repair process. "off" (default) performs no reconciliation at
 * all — unreconciledDivergentRecordCount can shrink only via this
 * control, never on its own, and never merely because write mode or
 * rollback changed. "replay-blind" is the tempting-but-unsafe repair:
 * it mechanically replays Legacy's write log onto New (or vice versa)
 * without checking whether New already independently has a
 * conflicting/newer record for the same key — this can silently
 * duplicate or overwrite a value that was already correct, so it is
 * authored as HARMFUL to data integrity even though the raw divergence
 * COUNT can drop. "diff-and-repair" is the real fix: it compares both
 * sides record-by-record and repairs only genuine gaps/conflicts,
 * draining unreconciledDivergentRecordCount safely but only over real
 * elapsed reconciliation time (recovery lag), never instantly.
 */
export const RECONCILIATION_MODE_KEY = "reconciliationMode";

/**
 * Shadow-writes every request to New Service in the background WITHOUT
 * granting New any write or read authority — a pure diagnostic/warm-up
 * signal. Useful for later safely increasing rollout, but it does
 * nothing to reduce unreconciledDivergentRecordCount and does nothing
 * to stop a dual-write-caused divergence that is already happening — a
 * candidate who relies on this alone while divergence keeps growing is
 * not actually containing anything.
 */
export const SHADOW_TRAFFIC_KEY = "shadowTraffic";

/**
 * Declares which strategic direction containment is heading toward.
 * "undecided" (default) — no direction chosen yet; rollback-only safety
 * checks below (readSource/rollback coupling) are evaluated against
 * whichever write/read state is actually in effect regardless of this
 * control. "rollback-legacy" declares the strategic decision to
 * abandon the migration and return fully to Legacy as the single
 * source of truth. "continue-new" declares the strategic decision to
 * finish migrating onto New as the single source of truth. Both are
 * legitimate, Principal-defensible end states PROVIDED
 * unreconciledDivergentRecordCount has actually been bounded and
 * drained first — declaring either direction does not, by itself,
 * repair anything.
 */
export const MIGRATION_DIRECTION_KEY = "migrationDirection";

/**
 * Whether application traffic has been rolled back off the migration
 * entirely — all requests are forced through Legacy regardless of
 * rollout cohort or write mode. This is the control at the center of
 * the scenario's named unsafe sequencing trap: rolling back traffic
 * BEFORE reconciling New-only writes, then switching reads to Legacy,
 * makes those already-acknowledged New-only writes invisible to every
 * subsequent read — a real, counted correctness violation
 * (exposedDivergentReadCount / silentlyLostAcknowledgedWriteCount), not
 * a cosmetic one, even though the system looks fully available
 * immediately after the rollback.
 */
export const ROLLBACK_APPLICATION_TRAFFIC_KEY = "rollbackApplicationTraffic";

/**
 * Reconciliation worker priority once RECONCILIATION_MODE_KEY is
 * "diff-and-repair". "normal" shares New DB's write capacity evenly
 * between live migration traffic and repair work — slower drain, lower
 * contention. "critical-path-first" dedicates most of New DB's write
 * capacity to draining the repair queue fastest — this is the
 * scenario's REQUIRED pressure-transfer mechanism: faster divergence
 * drain measurably raises newServiceWriteLatencyMs / New DB contention
 * for live migration traffic, and the effect compounds further if
 * ROLLOUT_PERCENT_KEY is simultaneously increased while repair is
 * running critical-path-first (more live write volume competing with
 * the same dedicated repair capacity).
 */
export const REPAIR_PRIORITY_KEY = "repairPriority";

export const controls: ControlDefinition[] = [
  {
    key: WRITE_MODE_KEY,
    allowedValues: ["dual", "legacy-only", "new-only"],
    initialValue: "dual",
  },
  {
    key: READ_SOURCE_KEY,
    allowedValues: ["cohort", "legacy", "new"],
    initialValue: "cohort",
  },
  {
    key: ROLLOUT_PERCENT_KEY,
    allowedValues: [0, 25, 50, 75, 100],
    initialValue: 50,
  },
  {
    key: RECONCILIATION_MODE_KEY,
    allowedValues: ["off", "replay-blind", "diff-and-repair"],
    initialValue: "off",
  },
  {
    key: SHADOW_TRAFFIC_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: MIGRATION_DIRECTION_KEY,
    allowedValues: ["undecided", "rollback-legacy", "continue-new"],
    initialValue: "undecided",
  },
  {
    key: ROLLBACK_APPLICATION_TRAFFIC_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: REPAIR_PRIORITY_KEY,
    allowedValues: ["normal", "critical-first"],
    initialValue: "normal",
  },
];
