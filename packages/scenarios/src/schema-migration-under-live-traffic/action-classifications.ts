import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  APP_ROLLOUT_PERCENT_KEY,
  BACKFILL_CONCURRENCY_KEY,
  COMPATIBILITY_WRITE_MODE_KEY,
  DB_LOCK_TIMEOUT_MODE_KEY,
  MIGRATION_PHASE_KEY,
  RETRY_POLICY_KEY,
  ROLLBACK_APP_FLEET_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per the mandatory post-incident-feedback
 * requirement, describing the system consequence (what happened, why,
 * what pressure moved where, and any historical damage incurred or
 * avoided) rather than a verdict. Ids are stable and intentionally
 * neutral, never self-descriptive of the authored logic. Covers all 7
 * controls — see this scenario's control-usage audit table in the
 * batch completion report.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: COMPATIBILITY_WRITE_MODE_KEY,
    valueEquals: "dual-shape",
    whenTriggerEquals: { compatibilityBrokenActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Switched to dual-shape writes",
      explanation:
        "Moving compatibility write mode to dual-shape means every write now carries both the legacy field and the new field, so whichever fleet reads a row back — old or new — finds the field it expects. This stops any further new-shape-only rows from being created from this point forward. It does NOT repair any rows already written new-shape-only: newShapeOnlyRowCount holds at whatever it already was, and only active backfill can bring it down.",
    },
  },
  {
    id: "acr_2",
    controlKey: COMPATIBILITY_WRITE_MODE_KEY,
    valueEquals: "new-shape-only",
    whenTriggerEquals: { compatibilityBrokenActive: true },
    outcome: "neutral",
    feedback: {
      title: "Switched to new-shape-only writes",
      explanation:
        "Dropping the legacy field from writes is only safe once Old App Fleet has been fenced away from serving traffic. On its own this does not repair the existing backlog, and if Old App Fleet is still serving when rows are read back new-shape-only, those reads become genuinely unreadable — a real correctness violation, not merely a cosmetic risk.",
    },
  },
  {
    id: "acr_3",
    controlKey: APP_ROLLOUT_PERCENT_KEY,
    valueAtLeast: 75,
    whenTriggerEquals: { compatibilityBrokenActive: true },
    outcome: "harmful",
    feedback: {
      title: "Increased rollout while compatibility was still broken",
      explanation:
        "Pushing app rollout percent up while compatibility write mode is still legacy-shape increases the volume of New App Fleet traffic writing new-shape-only rows. This measurably accelerated how fast newShapeOnlyRowCount grew compared to leaving rollout unchanged, trading migration velocity for a bigger correctness backlog to clean up later.",
    },
  },
  {
    id: "acr_4",
    controlKey: MIGRATION_PHASE_KEY,
    valueEquals: "contract",
    whenTriggerEquals: { compatibilityBrokenActive: true },
    outcome: "harmful",
    feedback: {
      title: "Moved to contract phase before the backlog was backfilled",
      explanation:
        "Contracting drops the legacy field from the schema going forward. Doing this before the historical new-shape-only backlog has actually been backfilled discards exactly the acknowledged data the 'no discarding to ease rollback' invariant protects — discardedAcknowledgedWriteCount became real and nonzero, regardless of which fleet was currently serving traffic. This is a correctness violation, not a migration-progress shortcut.",
    },
  },
  {
    id: "acr_5",
    controlKey: BACKFILL_CONCURRENCY_KEY,
    valueEquals: "low",
    whenTriggerEquals: { compatibilityBrokenActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Started backfill at low concurrency",
      explanation:
        "Backfill at low concurrency safely drains the new-shape-only backlog over real elapsed time without materially competing with live traffic for Shared Database lock/write capacity. It does not happen instantly — the backlog shrinks gradually, never in one tick.",
    },
  },
  {
    id: "acr_6",
    controlKey: BACKFILL_CONCURRENCY_KEY,
    valueEquals: "high",
    whenTriggerEquals: { compatibilityBrokenActive: true },
    outcome: "neutral",
    feedback: {
      title: "Started backfill at high concurrency",
      explanation:
        "High-concurrency backfill drains the historical backlog faster, but dedicates materially more of the Shared Database's lock/write capacity to backfill scanning and rewriting — this measurably raised dbLockWaitMs for live request traffic. The pressure did not disappear, it moved from the backlog onto live write latency. Whether this was safe for customers depends on dbLockTimeoutMode: pairing high concurrency with the normal (short) timeout turned that added wait into outright write failures (lockTimeoutFailureCount), while extended timeout absorbed it as latency instead.",
    },
  },
  {
    id: "acr_7",
    controlKey: DB_LOCK_TIMEOUT_MODE_KEY,
    valueEquals: "extended",
    whenTriggerEquals: { compatibilityBrokenActive: true },
    outcome: "neutral",
    feedback: {
      title: "Extended the Shared Database lock timeout",
      explanation:
        "Extending the lock timeout lets live writes wait longer for a lock instead of failing fast. This is the correct pairing once backfill concurrency is high — it absorbed the pressure transfer as added latency instead of outright write failures (lockTimeoutFailureCount stayed at zero). By itself, with no backfill running, it does nothing: there is no lock contention to relieve.",
    },
  },
  {
    id: "acr_8",
    controlKey: ROLLBACK_APP_FLEET_KEY,
    valueEquals: true,
    whenTriggerEquals: { compatibilityBrokenActive: true },
    outcome: "neutral",
    feedback: {
      title: "Rolled back to Old App Fleet",
      explanation:
        "Rolling back stops the Load Balancer from routing new requests to New App Fleet. By itself this is a reasonable containment step — but it does NOT repair any rows already written new-shape-only during the broken-compatibility window. Whether this was safe depends entirely on what already existed: rolling back while new-shape-only rows already exist and compatibility write mode is still legacy-shape strands those rows behind a fleet that cannot interpret them, not merely rolling back traffic.",
    },
  },
  {
    id: "acr_9",
    controlKey: RETRY_POLICY_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { compatibilityBrokenActive: true },
    outcome: "harmful",
    feedback: {
      title: "Switched to aggressive retry policy",
      explanation:
        "Aggressive retries re-attempt rejected or failed writes far more often. Under Shared Database lock contention (from backfill or otherwise), this adds further load onto exactly the capacity already under pressure — dbLockWaitMs and lockTimeoutFailureCount both climbed higher than they would have under normal retry policy at the same backfill-concurrency setting.",
    },
  },
];
