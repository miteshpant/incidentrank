import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Per-region rollout state for the US Service Fleet. "rolled-out"
 * (default, root-cause state) means the US fleet is actively serving the
 * new feature and writing the NEW representation to the Shared Data
 * Store for US customer records. "halted" stops the US fleet from
 * writing any further new-representation rows — a region may be halted
 * INDEPENDENTLY of EU/APAC (business invariant: "a regional rollout may
 * be halted independently"). Halting a region does NOT retroactively
 * repair rows that region already wrote under the new representation —
 * see migrationRepair.
 */
export const REGION_ROLLOUT_US_KEY = "regionRolloutUs";

/** Per-region rollout state for the EU Service Fleet. Same semantics as regionRolloutUs, independently controllable. */
export const REGION_ROLLOUT_EU_KEY = "regionRolloutEu";

/** Per-region rollout state for the APAC Service Fleet. Same semantics as regionRolloutUs, independently controllable. */
export const REGION_ROLLOUT_APAC_KEY = "regionRolloutApac";

/**
 * Whether the Shared Data Store's write path is forced into
 * "dual-write" compatibility mode. "new-only" (default, root-cause
 * state) means any region currently rolled out writes ONLY the new
 * representation for affected records — a record written this way is
 * unreadable by a region/version that expects the old representation.
 * "dual-write" means every write populates BOTH the old and new
 * representations simultaneously, so the record remains correctly
 * readable by old-representation readers even while new-representation
 * writes continue. This is the scenario's core "the shared data store
 * must not contain mutually incompatible active representations without
 * an explicit compatibility strategy" lever — it does not by itself
 * repair rows already written new-only before it was engaged.
 */
export const WRITE_COMPATIBILITY_MODE_KEY = "writeCompatibilityMode";

/**
 * Global feature rollback. false (default) means the feature rollout is
 * still globally active (individual regions may still be independently
 * halted via the per-region controls above). true means the feature has
 * been globally rolled back — ALL regions stop writing the new
 * representation for new records. Critically, per the business
 * invariant "global rollback may not discard or hide already-written
 * incompatible data," setting this to true does NOT erase, hide, or
 * repair alreadyIncompatibleWriteCount — it only stops the count from
 * growing further. This is the scenario's central premature-declare
 * trap: rolling back alone looks like "the incident is over" but leaves
 * every already-written incompatible record exactly as unreadable as
 * before.
 */
export const GLOBAL_ROLLBACK_KEY = "globalRollback";

/**
 * Migration repair / reconciliation worker state for already-written
 * incompatible records. "idle" (default) — no repair is running;
 * alreadyIncompatibleWriteCount never decreases on its own, no matter
 * how long the incident runs or how many other controls are fixed.
 * "repairing" — a real reconciliation process is actively rewriting
 * already-incompatible records into a dual-readable representation.
 * This is the scenario's required historical-damage repair mechanism:
 * repairedRecordCount climbs toward alreadyIncompatibleWriteCount over
 * genuine elapsed simulated time once engaged, never instantly.
 */
export const MIGRATION_REPAIR_KEY = "migrationRepair";

/**
 * Shared Data Store read-path compatibility behavior. "strict" (default)
 * means a read against a record written in the "wrong" representation
 * for the reading region/version returns corrupt/unreadable data (a
 * real, counted correctness failure — see unreadableReadCount).
 * "compatibility-shim" engages a read-time translation layer that can
 * interpret either representation, making already-written records
 * readable again WITHOUT needing every record to be repaired first.
 * This is the scenario's second alternate strong path's key lever
 * (global rollback + compatibility) — distinct from migrationRepair,
 * which permanently rewrites the underlying data rather than
 * translating it at read time.
 */
export const DATA_READ_COMPATIBILITY_MODE_KEY = "dataReadCompatibilityMode";

/**
 * Global rollout pause. false (default) means the rollout pipeline
 * keeps expanding exposure — additional regional cohorts keep being
 * onboarded into the rollout over time even if no single region has
 * been explicitly halted yet. true freezes further cohort expansion
 * globally. Distinct from the per-region halt controls: pausing stops
 * NEW exposure growth; it does nothing for a region already rolled out
 * and already writing the new representation — that still requires an
 * explicit per-region halt or global rollback.
 */
export const ROLLOUT_PAUSE_KEY = "rolloutPause";

export const controls: ControlDefinition[] = [
  { key: REGION_ROLLOUT_US_KEY, allowedValues: ["rolled-out", "halted"], initialValue: "rolled-out" },
  { key: REGION_ROLLOUT_EU_KEY, allowedValues: ["rolled-out", "halted"], initialValue: "rolled-out" },
  { key: REGION_ROLLOUT_APAC_KEY, allowedValues: ["rolled-out", "halted"], initialValue: "rolled-out" },
  { key: WRITE_COMPATIBILITY_MODE_KEY, allowedValues: ["new-only", "dual-write"], initialValue: "new-only" },
  { key: GLOBAL_ROLLBACK_KEY, allowedValues: [false, true], initialValue: false },
  { key: MIGRATION_REPAIR_KEY, allowedValues: ["idle", "repairing"], initialValue: "idle" },
  { key: DATA_READ_COMPATIBILITY_MODE_KEY, allowedValues: ["strict", "compatibility-shim"], initialValue: "strict" },
  { key: ROLLOUT_PAUSE_KEY, allowedValues: [false, true], initialValue: false },
];
