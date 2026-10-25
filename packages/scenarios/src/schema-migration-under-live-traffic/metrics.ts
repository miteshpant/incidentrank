import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Customer-facing request success rate, 0-100. Stays high through
  // most of the incident on purpose: the business invariant violations
  // here are correctness problems (a stranded/unreadable row), not
  // outright availability problems, so a candidate watching only this
  // metric will conclude everything is fine.
  requestSuccessRate: 99,

  // ── HISTORICAL DAMAGE (phase6d3.md section 12) ──────────────────────
  // The core cumulative counter: how many rows currently in the Shared
  // Database carry ONLY the new field, with no legacy-shape fallback.
  // Grows only while compatibilityWriteMode is "legacy-shape" (New App
  // Fleet is forced to improvise the new field on its own because no
  // compatible write mode has been established) or "new-shape-only" (by
  // design, before Old App Fleet has actually been fenced away), and
  // only while New App Fleet is serving any real traffic
  // (appRolloutPercent > 0) or already-rolled-back but previously
  // created rows remain. Never resets on its own merely because a
  // control changed — only actively running backfill
  // (backfillConcurrency != "off") drains it, and only gradually, over
  // real elapsed repair time (see timed-events.ts / rules.ts).
  newShapeOnlyRowCount: 0,

  // How many rows Old App Fleet was ACTUALLY asked to serve (a real
  // read attempt) that it could not safely interpret, because they are
  // new-shape-only. Distinct from newShapeOnlyRowCount itself (which
  // can be nonzero with zero reads against it, if Old App Fleet's
  // cohort never happens to read those specific rows) — this is the
  // actual, counted "rows written during mixed-version operation must
  // remain readable by the currently-serving application fleet"
  // violation.
  unreadableByServingFleetCount: 0,

  // How many already-acknowledged writes were discarded specifically to
  // make a rollback or contract step easier (e.g. a "just drop the
  // unrecognized rows" repair path). Distinct from
  // unreadableByServingFleetCount: this tracks "acknowledged writes may
  // not be discarded to make rollback easier" directly, as its own
  // named, irreversible-within-the-attempt correctness violation.
  discardedAcknowledgedWriteCount: 0,

  // Shared Database lock wait time for live request traffic, ms.
  // Healthy baseline; climbs under backfill/lock pressure (the
  // REQUIRED pressure-transfer mechanism) once backfillConcurrency is
  // "high", worse still if dbLockTimeoutMode is still "normal" (short)
  // and/or retryPolicy is "aggressive" (more write attempts competing
  // for the same held locks).
  dbLockWaitMs: 40,

  // How many writes failed outright due to a lock-wait timeout being
  // exceeded (as opposed to merely waiting longer). Distinct from
  // dbLockWaitMs (a latency signal): this is the harder failure-count
  // signal that climbs specifically when dbLockTimeoutMode is "normal"
  // (short) while real lock contention exists.
  lockTimeoutFailureCount: 0,

  // How many of the rows in newShapeOnlyRowCount have been safely
  // repaired (given a legacy-shape fallback value and verified
  // consistent) by the Backfill/Migration Workers. Only moves while
  // backfillConcurrency != "off"; mirrors the historical counter
  // draining over real elapsed time, never instantly.
  backfillRepairedRowCount: 0,

  // Generic string-state field read by scoring's dataIntegrity measure
  // and successCondition — the single unified correctness gate.
  // "safe" only once every row in the Shared Database is readable by
  // whichever fleet(s) are actually serving traffic AND no hard
  // violation (unreadable read, discarded acknowledged write) has ever
  // occurred AND the historical backlog is fully repaired to zero.
  // "contained" means new incompatible rows have stopped accumulating
  // and no hard violation has occurred, but the historical backlog is
  // still nonzero (even if draining). "violated" means at least one
  // hard violation has actually happened — this never heals back to
  // "contained"/"safe" within the same incident, because the
  // historical event already occurred and the counts above are
  // non-self-resetting. Starts "safe" (pre-incident).
  compatibilityStatus: "safe",

  // Severity field (exactly normal|warning|critical) tracking
  // migration-correctness risk specifically — "critical" while new
  // incompatible rows are actively being created, "warning" while
  // creation has stopped but the historical backlog is still draining,
  // "normal" once fully repaired with a single, safely-fenced fleet
  // serving traffic.
  migrationRiskStatus: "normal",

  // Which fleet(s) are currently actually serving traffic, mirrored
  // into its own field so rules can express "has traffic been safely
  // fenced to one fleet" as a readable string: "mixed" (both fleets
  // live, the incident-start default), "old-only" (rolled back),
  // "new-only" (rollout completed to 100%).
  servingFleetMode: "mixed",

  // Generic string-state field read ONLY by scoring's dataIntegrity
  // measure — "protected" once compatibilityStatus is "contained" or
  // "safe" (new damage has genuinely stopped), "not-protected" while
  // new incompatible rows are still actively accumulating OR a hard
  // violation has occurred.
  dataIntegrityProtected: "protected",
};
