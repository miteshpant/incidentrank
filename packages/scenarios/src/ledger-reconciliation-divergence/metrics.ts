import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Live-traffic health (the DECOY signal) ──────────────────────────
  // Stays high/healthy throughout the entire incident, by design — the
  // customer-facing transaction path and the Operational Ledger (the
  // authoritative transaction record) are never the thing that's
  // broken. A candidate who only watches these two never discovers
  // anything is wrong.
  transactionApiSuccessRate: 99,
  // Severity field. The Operational Ledger is the authoritative
  // transaction record (business invariant #1) and is never the
  // source of damage in this scenario — it stays "normal" the entire
  // time, no matter what happens downstream.
  operationalLedgerStatus: "normal",

  // ── Propagation health ───────────────────────────────────────────
  // Seconds of lag between an event landing on the Event Stream and
  // being reflected in the Settlement Ledger. Zero is healthy. Climbs
  // while the publisher is buggy or the settlement consumer is paused;
  // only drains gradually once BOTH the publisher is fixed AND the
  // consumer is actively consuming again (see rules.ts's multi-tick
  // decay — never resolved instantly by a control flip).
  eventLagSeconds: 0,

  // Rate (events/minute) at which NEW ledger/settlement divergence is
  // currently being created. This is the single field that answers
  // "has new damage stopped," independent of the historical backlog
  // counters below — the phase6d.2 binding distinction between
  // CURRENT health and HISTORICAL damage. Zero means no new divergence
  // is being created right now; it says nothing about backlog already
  // accrued.
  newDivergenceRatePerMinute: 0,

  // ── HISTORICAL / CUMULATIVE damage (phase6d.2 section 9) ───────────
  // These three counters only ever INCREASE while the mechanisms that
  // cause them are active. None of them is ever silently reset to zero
  // just because newDivergenceRatePerMinute reaches zero — see
  // rules.ts's "freeze" states, where these fields are carried forward
  // unchanged from whatever they last reached, and definition.ts's
  // completion-mode audit for the explicit non-reset proof.

  // Entries whose event was lost between the Event Stream and the
  // Settlement Ledger — a transaction the Operational Ledger
  // acknowledged that never settled. Repaired only via active
  // reconciliation + auto-repair, which backfills from the
  // authoritative Operational Ledger record (never invents a value —
  // business invariant #2).
  missingEntryCount: 0,
  // Entries duplicated in the Settlement Ledger — the same financial
  // event applied more than once. Created by the publisher bug itself,
  // by blind replay (replay-unsafe), or accelerated by high write
  // concurrency without duplicate suppression. Repaired only via
  // auto-repair, which reverses the extra application (never by
  // discarding the underlying transaction — business invariant #2:
  // settlement must never invent or double-apply value, and fixing
  // that double-application is a repair action, not an invention).
  duplicateSettlementEntryCount: 0,
  // Irreversible correctness violation: an exception queue entry for
  // an ALREADY-CUSTOMER-ACKNOWLEDGED transaction that was deleted
  // outright (exceptionPolicy = "auto-discard") instead of repaired.
  // This can only ever increase. There is no control, mode, or elapsed
  // time that reduces it — discarding an acknowledged transaction's
  // record is a real, permanent correctness loss, not a recoverable
  // backlog state. Business invariant #3.
  discardedAcknowledgedEntryCount: 0,

  // Total items currently queued in the Exception/Repair Queue awaiting
  // resolution (missing + duplicate + other detected mismatches not
  // yet repaired). This is the backlog the "bounded and draining"
  // acceptable-tier language refers to — distinct from the two
  // uncapped historical counters above, because repair genuinely
  // removes items from THIS queue (counted as resolved) even though it
  // does not erase the fact that missingEntryCount/
  // duplicateSettlementEntryCount peaked at some nonzero historical
  // value along the way.
  reconciliationBacklogCount: 0,

  // Generic string-state field read by scoring's dataIntegrity measure
  // and by successCondition/acceptableCondition — the single
  // authoritative summary of "what kind of state is this."
  //   "diverging"           — new divergence is actively being created.
  //   "frozen-unrepaired"   — new divergence stopped, but backlog is
  //                           frozen (not draining) because
  //                           reconciliation is not actively routing
  //                           into repair, or repair isn't engaged.
  //   "draining"            — new divergence stopped AND backlog is
  //                           bounded and demonstrably shrinking via
  //                           real repair throughput, but not yet zero.
  //   "reconciled"          — new divergence stopped AND backlog has
  //                           fully drained to zero.
  //   "discarded-violation" — exceptionPolicy destroyed acknowledged
  //                           records outright. Permanent violation;
  //                           never improves regardless of any other
  //                           control.
  reconciliationStatus: "diverging",

  // Generic string-state field read by scoring's dataIntegrity measure,
  // specifically isolating duplicate-settlement severity (the generic
  // scorer has no numeric-threshold penalty measure — only
  // finalStringEquals/NotEquals on a string field — so duplication
  // severity banding is expressed as this closed three-value
  // enumeration rather than a raw count comparison).
  //   "none"     — duplicateSettlementEntryCount is zero or a small,
  //                ordinary transient value.
  //   "moderate" — real, nonzero duplication from the baseline
  //                publisher defect itself.
  //   "severe"   — duplication was actively amplified (replay-unsafe
  //                blind replay, or unsuppressed high write
  //                concurrency) well beyond the baseline defect alone.
  duplicationSeverity: "none",
};
