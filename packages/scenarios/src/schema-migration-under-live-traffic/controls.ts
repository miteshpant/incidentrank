import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * How Old App Fleet / New App Fleet traffic is split, 0-100 (percent on
 * New App Fleet; the rest stays on Old App Fleet). The root mechanism:
 * New App Fleet already writes the new row shape (an extra field Old
 * App Fleet cannot safely interpret) the instant any of its traffic
 * reaches the Shared Database, regardless of compatibilityWriteMode —
 * the write mode controls WHICH shape gets written, not WHETHER New App
 * Fleet is live. Raising this while compatibility is still broken
 * ("continue rollout to finish faster") increases the volume of
 * incompatible rows being created per unit time — a real, authored,
 * tempting-but-unsafe lever (see rules.ts). Dropping it to 0 does not,
 * by itself, repair anything already written; it only stops creating
 * MORE of it.
 */
export const APP_ROLLOUT_PERCENT_KEY = "appRolloutPercent";

/**
 * What row shape writes actually land in. "legacy-shape" (the default/
 * incident-start value) means every app version is still writing the
 * OLD row shape — but New App Fleet's code, once it is serving any
 * traffic at all, needs the NEW field to behave correctly, so it begins
 * emitting rows carrying the new field as soon as it writes anything,
 * creating exactly the incompatible-row condition the business
 * invariant forbids ("rows written during mixed-version operation must
 * remain readable by the currently-serving fleet"). "dual-shape" is the
 * real fix: every app version (old and new) writes BOTH the legacy
 * field and the new field on every row, so whichever fleet reads a row
 * back — old or new — finds the field it expects. "new-shape-only"
 * drops the legacy field entirely; it stops growing the incompatible-row
 * backlog only once Old App Fleet has been safely fenced out of serving
 * traffic (see rollbackAppFleet/appRolloutPercent), otherwise it is
 * exactly as unsafe as leaving things on legacy-shape, just from the
 * opposite direction.
 */
export const COMPATIBILITY_WRITE_MODE_KEY = "compatibilityWriteMode";

/**
 * The migration's expand/contract phase (the standard safe schema-change
 * pattern, without naming it as the answer in candidate-facing text).
 * "expand" (default) means the old column/shape is still a live,
 * required read path — Old App Fleet still needs it, so it must keep
 * being populated. "contract" declares that the old shape is no longer
 * needed and may be dropped/ignored going forward. Moving to "contract"
 * while Old App Fleet is still serving any real traffic
 * (appRolloutPercent < 100 and rollbackAppFleet is false) is a hard
 * business-invariant violation: rows become unreadable by a fleet that
 * is still actually serving requests. "contract" is only genuinely safe
 * once traffic has been fenced fully onto New App Fleet.
 */
export const MIGRATION_PHASE_KEY = "migrationPhase";

/**
 * Backfill/repair worker throughput against the Shared Database. "off"
 * (default) performs no repair at all — the incompatible-row backlog
 * this scenario creates never shrinks on its own, regardless of what
 * else the candidate does. "low" repairs gradually at a rate the
 * database can absorb alongside live traffic. "high" is the REQUIRED
 * pressure-transfer lever (phase6d3.md section 13): it drains the
 * backlog faster, but dedicates materially more of the Shared
 * Database's write/lock capacity to backfill scanning and rewriting,
 * which measurably raises dbLockWaitMs / live write contention for
 * ordinary request traffic — worse still if dbLockTimeoutMode is still
 * "normal" (short) while high-concurrency backfill is running, since
 * live requests then time out waiting for locks backfill is holding.
 */
export const BACKFILL_CONCURRENCY_KEY = "backfillConcurrency";

/**
 * Lock wait behavior for live request traffic against the Shared
 * Database. "normal" (default) uses the ordinary short timeout —
 * appropriate when backfill isn't competing for the same rows/locks.
 * "extended" lets live writes wait longer for a lock instead of failing
 * fast, which is the correct pairing once backfillConcurrency is "high"
 * (it absorbs the pressure transfer as added latency instead of as
 * outright write failures/retries) — but by itself, with no backfill
 * running, it does nothing: there is no lock contention to relieve.
 */
export const DB_LOCK_TIMEOUT_MODE_KEY = "dbLockTimeoutMode";

/**
 * Whether Old App Fleet has been declared the sole fleet serving
 * traffic (true) or both fleets remain live per appRolloutPercent
 * (false, default). This is the scenario's named unsafe-tempting lever:
 * rolling the app fleet back to Old-only is a reasonable-sounding
 * containment instinct, but if any new-shape-only rows already exist
 * (newShapeOnlyRowCount > 0) at the moment this is set, Old App Fleet
 * cannot safely interpret them — those rows become a real, counted data
 * integrity violation (unreadableByServingFleetCount), not merely a
 * theoretical risk, even though the rollback itself looks maximally
 * safe and fast. Rolling back is NOT unsafe by itself — it is only
 * unsafe when it strands already-existing new-shape-only rows behind a
 * fleet that was never fenced away from them first.
 */
export const ROLLBACK_APP_FLEET_KEY = "rollbackAppFleet";

/**
 * Client/app retry behavior on a rejected or failed write. "normal"
 * (default) retries a bounded, modest number of times. "aggressive"
 * retries much more readily — this is the documented interacting
 * symptom (phase6d3.md's incident framing: "retries increase write
 * pressure"): under aggressive retries, every write already struggling
 * against lock contention gets re-attempted far more often, which adds
 * further load to the exact Shared Database capacity that backfill
 * pressure is already consuming, measurably compounding dbLockWaitMs
 * beyond what high backfill concurrency alone produces.
 */
export const RETRY_POLICY_KEY = "retryPolicy";

export const controls: ControlDefinition[] = [
  {
    key: APP_ROLLOUT_PERCENT_KEY,
    allowedValues: [0, 25, 50, 75, 100],
    initialValue: 50,
  },
  {
    key: COMPATIBILITY_WRITE_MODE_KEY,
    allowedValues: ["legacy-shape", "dual-shape", "new-shape-only"],
    initialValue: "legacy-shape",
  },
  {
    key: MIGRATION_PHASE_KEY,
    allowedValues: ["expand", "contract"],
    initialValue: "expand",
  },
  {
    key: BACKFILL_CONCURRENCY_KEY,
    allowedValues: ["off", "low", "high"],
    initialValue: "off",
  },
  {
    key: DB_LOCK_TIMEOUT_MODE_KEY,
    allowedValues: ["normal", "extended"],
    initialValue: "normal",
  },
  {
    key: ROLLBACK_APP_FLEET_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: RETRY_POLICY_KEY,
    allowedValues: ["normal", "aggressive"],
    initialValue: "normal",
  },
];
