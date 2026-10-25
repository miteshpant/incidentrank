import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Availability (the misleading first symptom) ─────────────────────
  // requestSuccessRate stays high throughout almost every path — this is
  // NOT a generic availability outage like deployment-regression or
  // partial-rollout-regression. Read naively it can look like "nothing
  // is wrong"; the real failure is a correctness problem in what gets
  // written and read, not in whether requests succeed.
  requestSuccessRate: 99.6,

  // ── Region-dependent correctness divergence ──────────────────────────
  // Percentage of EU requests that actually read/write records
  // correctly (vs. hitting an incompatible/unreadable representation).
  // EU is the region where the divergence first manifests (the US fleet
  // was first to roll out and had already adjusted read paths; EU's
  // rollout timing exposes the mismatch first — see timed-events.ts).
  euCorrectnessRate: 100,
  // US and APAC correctness rates track the same underlying mechanism,
  // but diverge independently per-region once the regression is active —
  // a region may be correct while another is not, since each region's
  // rollout/halt state is independently controlled.
  usCorrectnessRate: 100,
  apacCorrectnessRate: 100,

  // ── Historical / cumulative damage (REQUIRED, non-self-resetting) ───
  // Total number of customer records written under the NEW, incompatible
  // representation while writeCompatibilityMode was "new-only" and at
  // least one region was actively rolled out. Only ever increases.
  // Halting every region, pausing the rollout, or globally rolling back
  // stops NEW incompatible writes but never decrements this count — it
  // is a permanent, irreversible historical consequence until an
  // explicit migrationRepair pass actually processes it (see
  // repairedRecordCount below).
  alreadyIncompatibleWriteCount: 0,

  // Number of alreadyIncompatibleWriteCount records that migrationRepair
  // has actually reconciled into a dual-readable representation. Only
  // ever increases, and only while migrationRepair is "repairing" — a
  // real recovery-lag mechanism: climbs toward alreadyIncompatibleWriteCount
  // over genuine elapsed simulated time, never instantly on the tick
  // repair is engaged.
  repairedRecordCount: 0,

  // Number of read attempts against a record whose representation the
  // reading path cannot currently interpret (a real, counted correctness
  // failure distinct from requestSuccessRate — a read can "succeed" at
  // the HTTP layer while returning corrupt/unreadable application data).
  // Zero whenever dataReadCompatibilityMode is "compatibility-shim" or
  // once a record has been repaired; otherwise grows with
  // alreadyIncompatibleWriteCount's unrepaired remainder while reads
  // keep occurring against it.
  unreadableReadCount: 0,

  // ── Shared Data Store compatibility posture ──────────────────────────
  // Generic string-state summary of whether the store currently holds
  // mutually incompatible ACTIVE representations without an explicit
  // compatibility strategy engaged. Read by success/acceptable
  // conditions and scoring.
  //   "diverging"        — at least one region is actively writing
  //                         new-only while old-representation readers
  //                         still exist; no compatibility strategy is
  //                         engaged; the gap is actively widening.
  //   "contained"         — no NEW incompatible writes are being created
  //                         (rollout paused/halted/rolled back, or
  //                         dual-write engaged), but the already-written
  //                         backlog has not yet been fully repaired.
  //   "compatible"        — either every already-incompatible record has
  //                         been repaired, or dual-write/compatibility-shim
  //                         is actively keeping every active
  //                         representation mutually readable.
  //   "incident-free"     — pre-incident / fully resolved baseline.
  storeCompatibilityStatus: "incident-free",

  // Mirrors globalRollback's candidate-visible control state into a
  // string-state field for condition/scoring access, consistent with
  // this codebase's established pattern.
  rolloutStatus: "active",
};
