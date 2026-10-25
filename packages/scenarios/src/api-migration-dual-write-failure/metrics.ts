import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Customer-facing request success rate, 0-100. Stays high throughout
  // most of the incident — this is deliberate: the business invariant
  // violations here are correctness problems, not availability
  // problems, and a candidate who only watches this metric will
  // conclude everything is fine.
  requestSuccessRate: 99,

  // ── HISTORICAL DAMAGE (phase6d.2.md section 9) ──────────────────────
  // The core cumulative counter. Grows ONLY while writeMode === "dual"
  // and an asymmetric-write event actually occurs (authored via rules,
  // not a formula). Freezing writeMode to "legacy-only" or "new-only"
  // stops this from growing further, but it NEVER resets to zero on
  // its own — the only way it decreases is reconciliationMode ===
  // "diff-and-repair" actually running, and even then only gradually,
  // over real elapsed reconciliation time (see timed-events.ts /
  // rules.ts's drain sequence). Rollback, write-mode changes, and
  // migrationDirection declarations never touch this field directly.
  unreconciledDivergentRecordCount: 0,

  // How many of the records counted above were, at some point, written
  // ONLY to New (not Legacy) while dual-write was active — the specific
  // sub-population at risk of being silently "lost" if reads are later
  // routed to Legacy without reconciling first. Same non-self-resetting
  // behavior as unreconciledDivergentRecordCount; this is the subset
  // reconciliation must repair before a rollback-to-legacy direction is
  // safe.
  newOnlyUnreconciledRecordCount: 0,

  // The direct, counted correctness violation: how many times a read
  // was actually served (to a real customer-facing request) from a
  // source that did not reflect an acknowledged write sitting
  // unreconciled on the other side. This is what "read routing must
  // not expose unresolved divergent state" gates on — distinct from
  // unreconciledDivergentRecordCount (which can be nonzero with zero
  // exposed reads, if read routing is paused/contained correctly).
  exposedDivergentReadCount: 0,

  // How many acknowledged New-only writes became permanently
  // unreachable from the customer's point of view because reads were
  // switched to Legacy while those writes were still unreconciled —
  // the specific, named unsafe-sequencing violation
  // ("rollback application traffic -> leave new-only writes
  // unreconciled -> switch reads to legacy"). Distinct from
  // exposedDivergentReadCount: this counts writes that are now
  // invisible outright, not merely stale-but-visible.
  silentlyLostAcknowledgedWriteCount: 0,

  // How many divergent records replay-blind reconciliation has
  // mechanically overwritten/duplicated without checking for a
  // genuine conflict — real data-integrity damage distinct from (and
  // additive to) the original divergence, authored to make
  // "replaying blindly can duplicate/corrupt data" a real counted
  // consequence, not a cosmetic warning.
  blindReplayCorruptionCount: 0,

  // New Service/DB write-path latency, ms. Baseline is healthy; climbs
  // under reconciliation-vs-live-traffic contention (the required
  // pressure-transfer mechanism) once repairPriority is
  // "critical-first" while live rollout volume is also high.
  newServiceWriteLatencyMs: 90,

  // Reconciliation queue depth — how many known-divergent records are
  // currently queued for diff-and-repair. Zero whenever
  // reconciliationMode is "off" or no divergence exists; climbs to
  // mirror unreconciledDivergentRecordCount once reconciliation starts
  // actively draining it; purely a progress/rate-of-drain signal, not
  // itself a correctness count.
  reconciliationQueueDepth: 0,

  // Generic string-state field read by scoring's dataIntegrity measure
  // and successCondition — the single unified correctness gate.
  // "safe" only once new divergence has stopped accumulating AND no
  // exposed-divergent-read / lost-write / blind-replay-corruption event
  // has ever occurred AND the historical backlog is fully drained to
  // zero. "contained" means new divergence has stopped and no read/
  // write-loss violation has occurred, but the historical backlog is
  // still nonzero (even if draining) — the acceptable tier's gate.
  // "violated" means at least one of the hard correctness events
  // (exposed divergent read, lost acknowledged write, blind-replay
  // corruption) has actually happened — this NEVER heals back to
  // "contained"/"safe" within the same incident, because the
  // historical event already occurred and the counts above are
  // non-self-resetting. Starts "safe" (pre-incident, dual-write has
  // not yet produced any real divergence) — matches rules.ts's
  // healthy-default rule exactly, since createInitialState reads these
  // values directly without evaluating any rule.
  correctnessStatus: "safe",

  // Severity field (exactly normal|warning|critical) tracking write-
  // authority risk specifically — "critical" while writeMode is "dual"
  // (actively diverging), "warning" while divergence is frozen but the
  // historical backlog is still draining, "normal" once fully
  // reconciled and a single write authority is firmly in place.
  writeAuthorityRiskStatus: "normal",

  // Which write source is CURRENTLY authoritative, mirrored into its
  // own field so rules can express "exactly one authoritative write
  // source" as a readable string rather than only via the control's
  // own echoed value — kept identical to writeMode's current value by
  // every rule below (never diverges from it).
  authoritativeWriteSource: "dual",

  // Generic string-state field read ONLY by scoring's dataIntegrity
  // measure — "protected" once write authority has genuinely been
  // contained (correctnessStatus is "contained" or "safe"), "not-
  // protected" while dual-write is still active/unresolved (the
  // untouched baseline: new damage still accumulating) OR a hard
  // correctness violation has occurred. Kept distinct from
  // correctnessStatus itself (which has three non-boolean states)
  // because the generic scorer bands a single measure per dimension —
  // this collapses the three-way state into exactly the boolean
  // dataIntegrity actually needs to gate on: "is correctness currently
  // being protected," never conflating "nothing has gone wrong yet
  // because nothing has been tried" with "this is actually safe."
  dataIntegrityProtected: "protected",
};
