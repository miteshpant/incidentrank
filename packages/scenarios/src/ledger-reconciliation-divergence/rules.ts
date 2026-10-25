import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  DUPLICATE_SUPPRESSION_KEY,
  EVENT_PUBLISHING_MODE_KEY,
  EXCEPTION_POLICY_KEY,
  RECONCILIATION_MODE_KEY,
  REPAIR_QUEUE_PRIORITY_KEY,
  SETTLEMENT_CONSUMER_MODE_KEY,
  SETTLEMENT_WRITE_CONCURRENCY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "transaction-api": "healthy",
  "operational-ledger": "healthy",
  "event-stream": "healthy",
  "settlement-ledger": "healthy",
  "reconciliation-service": "healthy",
  "repair-queue": "healthy",
};

// Transaction API and Operational Ledger are ALWAYS healthy in this
// scenario, by design (business invariant #1 — the Operational Ledger
// is the authoritative transaction record, never the broken thing).
// Only the downstream half of the pipeline ever shows degraded/critical
// health.
const divergingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "event-stream": "degraded",
  "settlement-ledger": "critical",
  "reconciliation-service": "degraded",
  "repair-queue": "degraded",
};

const frozenUnrepairedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "event-stream": "healthy",
  "settlement-ledger": "degraded",
  "reconciliation-service": "degraded",
  "repair-queue": "critical",
};

const drainingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "settlement-ledger": "degraded",
  "reconciliation-service": "degraded",
  "repair-queue": "degraded",
};

const pausedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "event-stream": "degraded",
  "settlement-ledger": "degraded",
};

const replayUnsafeHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "event-stream": "degraded",
  "settlement-ledger": "critical",
  "reconciliation-service": "degraded",
  "repair-queue": "critical",
};

const discardedViolationHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "settlement-ledger": "degraded",
  "reconciliation-service": "critical",
  "repair-queue": "critical",
};

const concurrencyAmplifiedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "event-stream": "critical",
  "settlement-ledger": "critical",
  "reconciliation-service": "critical",
  "repair-queue": "critical",
};

/**
 * Authored rule table for Ledger Reconciliation Divergence, ordered
 * most-specific-first (correctness-violation traps checked before
 * capacity/pressure states, which are checked before the ordinary
 * progression of stop-divergence -> engage-repair -> drain).
 *
 * ROOT CAUSE: the Event Stream -> Settlement Ledger publisher begins
 * dropping a subset of events and duplicating others
 * (publisherBugActive). Transaction API success and
 * operationalLedgerStatus never move — this must not look like an
 * availability outage (phase6d.2.md's framing requirement). The ONLY
 * visible symptoms are downstream: eventLagSeconds, divergence rate,
 * and the two historical counters.
 *
 * HISTORICAL DAMAGE MODEL (phase6d.2.md section 9 — this is the
 * archetype scenario for it): missingEntryCount and
 * duplicateSettlementEntryCount only ever increase while
 * newDivergenceRatePerMinute > 0 (i.e. while the publisher bug is
 * actively creating new damage, or while replay-unsafe/unsuppressed
 * concurrency are actively creating MORE of it). The moment
 * eventPublishingMode is fixed (at-least-once-safe) AND no other
 * damage-creating control is active, newDivergenceRatePerMinute drops
 * to 0 and these two counters FREEZE at whatever peak they last
 * reached — they are never silently reset to zero by that fix alone.
 * The engine has no running accumulator across rule transitions, so
 * "how much backlog accrued" is modeled by keying the frozen/draining
 * states' authored values on which divergence-duration trigger
 * (publisherBugActive / sustainedDivergence) was ever active —
 * sustainedDivergence, once set by its timed event, is never unset, so
 * a candidate who let the bug run longer always repairs from a larger
 * authored backlog than one who fixed it quickly, even though both
 * eventually show newDivergenceRatePerMinute = 0.
 *
 * The backlog (reconciliationBacklogCount) only ever SHRINKS once
 * BOTH: (a) new divergence has genuinely stopped, AND (b) real repair
 * throughput is engaged (reconciliationMode = active-exception-routing
 * AND exceptionPolicy = auto-repair). It drains across three real
 * elapsed repair-time windows (REPAIR_WINDOW_1/2/FULLY_DRAINED), never
 * instantly on the tick the controls are set — this is the required
 * recovery-lag mechanism. repairQueuePriority = expedited drains
 * faster at the same elapsed window (a real, authored difference, not
 * a cosmetic one).
 *
 * PRESSURE-TRANSFER MECHANISM (phase6d.2.md binding): raising
 * settlementWriteConcurrency to "high" while the publisher bug is
 * still active (or while replay-unsafe is in effect) does not relieve
 * anything — it lets MORE duplicate/erroneous writes land per unit of
 * real time, authored as a materially higher duplicateSettlementEntryCount
 * and newDivergenceRatePerMinute than the same trigger state at normal
 * concurrency. This is the tempting "just scale it" lever that actively
 * worsens the exact damage being measured.
 *
 * TEMPTING UNSAFE PATHS:
 *   - eventPublishingMode = "replay-unsafe": re-publishes the recent
 *     event window to "catch up" missing entries fast. It cannot tell
 *     an event that already safely settled from one that never
 *     arrived, so it duplicates settlement for everything that DID
 *     land while still leaving some genuinely missing — duplicate
 *     count explodes while missing count barely improves.
 *   - exceptionPolicy = "auto-discard": clears the Exception/Repair
 *     Queue by deleting records for transactions already acknowledged
 *     to the customer. reconciliationBacklogCount drops to 0
 *     immediately (looks perfectly healthy) but
 *     discardedAcknowledgedEntryCount — a separate, irreversible
 *     correctness violation — becomes permanently nonzero. This state
 *     NEVER qualifies as acceptable or optimal, regardless of any
 *     other metric, including after any amount of elapsed time.
 *   - settlementConsumerMode = "paused" held indefinitely: stops new
 *     divergence (newDivergenceRatePerMinute = 0) but also stops ALL
 *     new legitimate settlement — not a free safe state, and never
 *     reaches "reconciled" because nothing is draining.
 */
export const ledgerReconciliationDivergenceRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE CORRECTNESS TRAPS — checked first, win regardless of every
  // other control, because a correctness violation is never acceptable
  // no matter how healthy other metrics look.
  // ══════════════════════════════════════════════════════════════════

  // Discarded-acknowledged-entries trap: exceptionPolicy = auto-discard
  // while reconciliation is actively routing (so there's something real
  // being discarded, not merely a dead lever on an empty queue). The
  // sustained (more specific -- requires sustainedDivergence too) rule
  // is listed FIRST, since rule matching is first-match-wins top-to-
  // bottom and sustainedDivergence implies publisherBugActive is also
  // true -- the less-specific publisherBugActive-only rule below must
  // never shadow it.
  {
    id: "exceptions-discarded-sustained",
    when: {
      triggerEquals: { publisherBugActive: true, sustainedDivergence: true },
      controlEquals: {
        [RECONCILIATION_MODE_KEY]: "active-exception-routing",
        [EXCEPTION_POLICY_KEY]: "auto-discard",
      },
    },
    incidentState: "exceptions-discarded-sustained",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 70,
      newDivergenceRatePerMinute: 4,
      missingEntryCount: 140,
      duplicateSettlementEntryCount: 90,
      discardedAcknowledgedEntryCount: 230,
      reconciliationBacklogCount: 0,
      reconciliationStatus: "discarded-violation",
      duplicationSeverity: "moderate",
    },
    componentHealth: discardedViolationHealth,
  },
  {
    id: "exceptions-discarded",
    when: {
      triggerEquals: { publisherBugActive: true },
      controlEquals: {
        [RECONCILIATION_MODE_KEY]: "active-exception-routing",
        [EXCEPTION_POLICY_KEY]: "auto-discard",
      },
    },
    incidentState: "exceptions-discarded",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 40,
      newDivergenceRatePerMinute: 4,
      missingEntryCount: 60,
      duplicateSettlementEntryCount: 35,
      discardedAcknowledgedEntryCount: 95,
      reconciliationBacklogCount: 0,
      reconciliationStatus: "discarded-violation",
      duplicationSeverity: "moderate",
    },
    componentHealth: discardedViolationHealth,
  },

  // Blind-replay trap: event publishing set to replay-unsafe. Missing
  // entries improve only modestly (replay cannot distinguish "never
  // arrived" from "already safely landed") while duplicate count
  // explodes, because every event that DID land gets re-applied.
  {
    id: "replay-unsafe-amplifies-duplicates",
    when: {
      triggerEquals: { publisherBugActive: true },
      controlEquals: { [EVENT_PUBLISHING_MODE_KEY]: "replay-unsafe" },
    },
    incidentState: "replay-unsafe-amplified",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 15,
      newDivergenceRatePerMinute: 18,
      missingEntryCount: 22,
      duplicateSettlementEntryCount: 210,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 232,
      reconciliationStatus: "diverging",
      duplicationSeverity: "severe",
    },
    componentHealth: replayUnsafeHealth,
  },

  // Pressure-transfer trap: write concurrency raised to "high" while
  // the publisher bug is still active and duplicate suppression is
  // off. More duplicate/erroneous writes land per unit time — strictly
  // worse than the plain baseline at the same trigger state, not
  // merely "no better."
  {
    id: "concurrency-amplifies-damage",
    when: {
      triggerEquals: { publisherBugActive: true },
      controlEquals: {
        [SETTLEMENT_WRITE_CONCURRENCY_KEY]: "high",
        [DUPLICATE_SUPPRESSION_KEY]: false,
        [EVENT_PUBLISHING_MODE_KEY]: "buggy",
      },
    },
    incidentState: "concurrency-amplified-damage",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 30,
      newDivergenceRatePerMinute: 26,
      missingEntryCount: 48,
      duplicateSettlementEntryCount: 160,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 208,
      reconciliationStatus: "diverging",
      duplicationSeverity: "severe",
    },
    componentHealth: concurrencyAmplifiedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE PROGRESSION — new divergence stopped once publishing is fixed.
  // Backlog freezes (not draining) unless reconciliation is ACTIVELY
  // routing AND exceptionPolicy is auto-repair AND enough elapsed
  // repair time has passed. Checked after traps, ordered: draining ->
  // frozen -> still-diverging baseline.
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL: fully reconciled. New divergence stopped, repair fully
  // engaged, and the longest repair window has elapsed — backlog has
  // drained to zero. Reachable from EITHER the short or sustained
  // divergence window (both eventually reach zero given enough real
  // repair time); authored identically here since "fully drained" is
  // fully drained regardless of how large the peak was.
  {
    id: "fully-reconciled",
    when: {
      triggerEquals: { publisherBugActive: true, repairWindowFullyDrainedElapsed: true },
      controlEquals: {
        [EVENT_PUBLISHING_MODE_KEY]: "at-least-once-safe",
        [SETTLEMENT_CONSUMER_MODE_KEY]: "consuming",
        [RECONCILIATION_MODE_KEY]: "active-exception-routing",
        [EXCEPTION_POLICY_KEY]: "auto-repair",
      },
    },
    incidentState: "fully-reconciled",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 2,
      newDivergenceRatePerMinute: 0,
      missingEntryCount: 0,
      duplicateSettlementEntryCount: 0,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 0,
      reconciliationStatus: "reconciled",
      duplicationSeverity: "none",
    },
    componentHealth: healthyHealth,
  },

  // ── Draining, window 2 (expedited repair priority) — sustained
  // (larger) backlog, repaired with expedited throughput: drains
  // faster at the SAME elapsed window than normal priority below, a
  // real, distinct authored value proving repairQueuePriority is not a
  // dead control.
  {
    id: "draining-sustained-window2-expedited",
    when: {
      triggerEquals: {
        publisherBugActive: true,
        sustainedDivergence: true,
        repairWindow2Elapsed: true,
        repairWindowFullyDrainedElapsed: false,
      },
      controlEquals: {
        [EVENT_PUBLISHING_MODE_KEY]: "at-least-once-safe",
        [SETTLEMENT_CONSUMER_MODE_KEY]: "consuming",
        [RECONCILIATION_MODE_KEY]: "active-exception-routing",
        [EXCEPTION_POLICY_KEY]: "auto-repair",
        [REPAIR_QUEUE_PRIORITY_KEY]: "expedited",
      },
    },
    incidentState: "draining-sustained-window2-expedited",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 5,
      newDivergenceRatePerMinute: 0,
      missingEntryCount: 140,
      duplicateSettlementEntryCount: 90,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 35,
      reconciliationStatus: "draining",
      duplicationSeverity: "moderate",
    },
    componentHealth: drainingHealth,
  },

  // ── Draining, window 2, normal repair priority — same backlog
  // origin, slower drain rate at the identical elapsed window (proves
  // the recovery-lag mechanism: mitigation applied != instantly
  // healthy, and priority genuinely changes the rate).
  {
    id: "draining-sustained-window2-normal",
    when: {
      triggerEquals: {
        publisherBugActive: true,
        sustainedDivergence: true,
        repairWindow2Elapsed: true,
        repairWindowFullyDrainedElapsed: false,
      },
      controlEquals: {
        [EVENT_PUBLISHING_MODE_KEY]: "at-least-once-safe",
        [SETTLEMENT_CONSUMER_MODE_KEY]: "consuming",
        [RECONCILIATION_MODE_KEY]: "active-exception-routing",
        [EXCEPTION_POLICY_KEY]: "auto-repair",
        [REPAIR_QUEUE_PRIORITY_KEY]: "normal",
      },
    },
    incidentState: "draining-sustained-window2-normal",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 8,
      newDivergenceRatePerMinute: 0,
      missingEntryCount: 140,
      duplicateSettlementEntryCount: 90,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 95,
      reconciliationStatus: "draining",
      duplicationSeverity: "moderate",
    },
    componentHealth: drainingHealth,
  },

  // ── Draining, window 1, sustained backlog, expedited — the first
  // real repair window: backlog has started shrinking from its
  // sustained peak but is still well above zero. This is the
  // archetype "bounded and draining" ACCEPTABLE-tier state: new
  // divergence has stopped and the backlog is demonstrably moving
  // down from where it peaked, but has not reached zero.
  {
    id: "draining-sustained-window1-expedited",
    when: {
      triggerEquals: {
        publisherBugActive: true,
        sustainedDivergence: true,
        repairWindow1Elapsed: true,
        repairWindow2Elapsed: false,
      },
      controlEquals: {
        [EVENT_PUBLISHING_MODE_KEY]: "at-least-once-safe",
        [SETTLEMENT_CONSUMER_MODE_KEY]: "consuming",
        [RECONCILIATION_MODE_KEY]: "active-exception-routing",
        [EXCEPTION_POLICY_KEY]: "auto-repair",
        [REPAIR_QUEUE_PRIORITY_KEY]: "expedited",
      },
    },
    incidentState: "draining-sustained-window1-expedited",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 10,
      newDivergenceRatePerMinute: 0,
      missingEntryCount: 140,
      duplicateSettlementEntryCount: 90,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 115,
      reconciliationStatus: "draining",
      duplicationSeverity: "moderate",
    },
    componentHealth: drainingHealth,
  },

  // ── Draining, window 1, sustained backlog, normal priority.
  {
    id: "draining-sustained-window1-normal",
    when: {
      triggerEquals: {
        publisherBugActive: true,
        sustainedDivergence: true,
        repairWindow1Elapsed: true,
        repairWindow2Elapsed: false,
      },
      controlEquals: {
        [EVENT_PUBLISHING_MODE_KEY]: "at-least-once-safe",
        [SETTLEMENT_CONSUMER_MODE_KEY]: "consuming",
        [RECONCILIATION_MODE_KEY]: "active-exception-routing",
        [EXCEPTION_POLICY_KEY]: "auto-repair",
        [REPAIR_QUEUE_PRIORITY_KEY]: "normal",
      },
    },
    incidentState: "draining-sustained-window1-normal",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 14,
      newDivergenceRatePerMinute: 0,
      missingEntryCount: 140,
      duplicateSettlementEntryCount: 90,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 165,
      reconciliationStatus: "draining",
      duplicationSeverity: "moderate",
    },
    componentHealth: drainingHealth,
  },

  // ── Draining, short/early backlog origin (publisher bug fixed
  // BEFORE sustainedDivergence fired), window 1, expedited — smaller
  // peak backlog, same mechanism.
  {
    id: "draining-early-window1-expedited",
    when: {
      triggerEquals: {
        publisherBugActive: true,
        sustainedDivergence: false,
        repairWindow1Elapsed: true,
      },
      controlEquals: {
        [EVENT_PUBLISHING_MODE_KEY]: "at-least-once-safe",
        [SETTLEMENT_CONSUMER_MODE_KEY]: "consuming",
        [RECONCILIATION_MODE_KEY]: "active-exception-routing",
        [EXCEPTION_POLICY_KEY]: "auto-repair",
        [REPAIR_QUEUE_PRIORITY_KEY]: "expedited",
      },
    },
    incidentState: "draining-early-window1-expedited",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 6,
      newDivergenceRatePerMinute: 0,
      missingEntryCount: 22,
      duplicateSettlementEntryCount: 14,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 9,
      reconciliationStatus: "draining",
      duplicationSeverity: "moderate",
    },
    componentHealth: drainingHealth,
  },

  // ── Draining, short/early backlog origin, window 1, normal
  // priority.
  {
    id: "draining-early-window1-normal",
    when: {
      triggerEquals: {
        publisherBugActive: true,
        sustainedDivergence: false,
        repairWindow1Elapsed: true,
      },
      controlEquals: {
        [EVENT_PUBLISHING_MODE_KEY]: "at-least-once-safe",
        [SETTLEMENT_CONSUMER_MODE_KEY]: "consuming",
        [RECONCILIATION_MODE_KEY]: "active-exception-routing",
        [EXCEPTION_POLICY_KEY]: "auto-repair",
        [REPAIR_QUEUE_PRIORITY_KEY]: "normal",
      },
    },
    incidentState: "draining-early-window1-normal",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 9,
      newDivergenceRatePerMinute: 0,
      missingEntryCount: 22,
      duplicateSettlementEntryCount: 14,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 19,
      reconciliationStatus: "draining",
      duplicationSeverity: "moderate",
    },
    componentHealth: drainingHealth,
  },

  // ── Repair engaged but NO elapsed repair window yet (candidate just
  // flipped the controls this instant) — backlog is exactly what it
  // was at the moment repair started; this is the tick-zero proof that
  // repair does not instantly clear the backlog.
  {
    id: "repair-just-engaged-sustained",
    when: {
      triggerEquals: {
        publisherBugActive: true,
        sustainedDivergence: true,
        repairWindow1Elapsed: false,
      },
      controlEquals: {
        [EVENT_PUBLISHING_MODE_KEY]: "at-least-once-safe",
        [SETTLEMENT_CONSUMER_MODE_KEY]: "consuming",
        [RECONCILIATION_MODE_KEY]: "active-exception-routing",
        [EXCEPTION_POLICY_KEY]: "auto-repair",
      },
    },
    incidentState: "repair-just-engaged-sustained",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 20,
      newDivergenceRatePerMinute: 0,
      missingEntryCount: 140,
      duplicateSettlementEntryCount: 90,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 230,
      reconciliationStatus: "draining",
      duplicationSeverity: "moderate",
    },
    componentHealth: drainingHealth,
  },
  {
    id: "repair-just-engaged-early",
    when: {
      triggerEquals: {
        publisherBugActive: true,
        sustainedDivergence: false,
        repairWindow1Elapsed: false,
      },
      controlEquals: {
        [EVENT_PUBLISHING_MODE_KEY]: "at-least-once-safe",
        [SETTLEMENT_CONSUMER_MODE_KEY]: "consuming",
        [RECONCILIATION_MODE_KEY]: "active-exception-routing",
        [EXCEPTION_POLICY_KEY]: "auto-repair",
      },
    },
    incidentState: "repair-just-engaged-early",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 12,
      newDivergenceRatePerMinute: 0,
      missingEntryCount: 22,
      duplicateSettlementEntryCount: 14,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 36,
      reconciliationStatus: "draining",
      duplicationSeverity: "moderate",
    },
    componentHealth: drainingHealth,
  },

  // ── FROZEN, UNREPAIRED (the "pause everything" trap and the
  // "detect but don't route" trap): new divergence has genuinely
  // stopped (publisher fixed, or consumer paused) but the backlog is
  // NOT draining because repair isn't actually engaged. This is the
  // key UNSAFE-but-tempting state: it LOOKS calm (no new divergence)
  // but reconciliationBacklogCount sits frozen, unmoving, however long
  // the candidate waits — proof that "fix the cause" != "undo the
  // damage."
  {
    id: "frozen-publisher-fixed-passive-detect",
    when: {
      triggerEquals: { publisherBugActive: true, sustainedDivergence: true },
      controlEquals: {
        [EVENT_PUBLISHING_MODE_KEY]: "at-least-once-safe",
        [SETTLEMENT_CONSUMER_MODE_KEY]: "consuming",
        [RECONCILIATION_MODE_KEY]: "passive-detect",
      },
    },
    incidentState: "frozen-publisher-fixed-passive-detect",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 3,
      newDivergenceRatePerMinute: 0,
      missingEntryCount: 140,
      duplicateSettlementEntryCount: 90,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 230,
      reconciliationStatus: "frozen-unrepaired",
      duplicationSeverity: "moderate",
    },
    componentHealth: frozenUnrepairedHealth,
  },
  // sustainedDivergence implies publisherBugActive, so the more
  // specific "-sustained" variant must be listed FIRST (first-match-
  // wins) or it would be permanently shadowed by the less-specific
  // rule below — see exceptions-discarded-sustained's note above.
  {
    id: "frozen-consumer-paused-sustained",
    when: {
      triggerEquals: { publisherBugActive: true, sustainedDivergence: true },
      controlEquals: { [SETTLEMENT_CONSUMER_MODE_KEY]: "paused" },
    },
    incidentState: "frozen-consumer-paused-sustained",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 420,
      newDivergenceRatePerMinute: 0,
      missingEntryCount: 140,
      duplicateSettlementEntryCount: 90,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 230,
      reconciliationStatus: "frozen-unrepaired",
      duplicationSeverity: "moderate",
    },
    componentHealth: pausedHealth,
  },
  {
    id: "frozen-consumer-paused",
    when: {
      triggerEquals: { publisherBugActive: true },
      controlEquals: { [SETTLEMENT_CONSUMER_MODE_KEY]: "paused" },
    },
    incidentState: "frozen-consumer-paused",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 180,
      newDivergenceRatePerMinute: 0,
      missingEntryCount: 48,
      duplicateSettlementEntryCount: 30,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 78,
      reconciliationStatus: "frozen-unrepaired",
      duplicationSeverity: "moderate",
    },
    componentHealth: pausedHealth,
  },

  // ── Routing engaged but exceptionPolicy still hold-for-review (not
  // yet auto-repair): detection is real, items are queued and
  // classified, but nothing actually resolves them yet — still frozen,
  // one step closer to the safe repair path than passive-detect.
  {
    id: "frozen-routed-not-repairing",
    when: {
      triggerEquals: { publisherBugActive: true, sustainedDivergence: true },
      controlEquals: {
        [EVENT_PUBLISHING_MODE_KEY]: "at-least-once-safe",
        [SETTLEMENT_CONSUMER_MODE_KEY]: "consuming",
        [RECONCILIATION_MODE_KEY]: "active-exception-routing",
        [EXCEPTION_POLICY_KEY]: "hold-for-review",
      },
    },
    incidentState: "frozen-routed-not-repairing",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 4,
      newDivergenceRatePerMinute: 0,
      missingEntryCount: 140,
      duplicateSettlementEntryCount: 90,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 230,
      reconciliationStatus: "frozen-unrepaired",
      duplicationSeverity: "moderate",
    },
    componentHealth: frozenUnrepairedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // BASELINE — publisher bug active, no meaningful action taken yet.
  // New divergence is actively accruing; both historical counters are
  // climbing. Ordered after all trap/progression rules so any real
  // control change is recognized first.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "baseline-sustained-diverging",
    when: { triggerEquals: { publisherBugActive: true, sustainedDivergence: true } },
    incidentState: "baseline-sustained-diverging",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 70,
      newDivergenceRatePerMinute: 9,
      missingEntryCount: 140,
      duplicateSettlementEntryCount: 90,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 230,
      reconciliationStatus: "diverging",
      duplicationSeverity: "moderate",
    },
    componentHealth: divergingHealth,
  },
  {
    id: "baseline-diverging",
    when: { triggerEquals: { publisherBugActive: true } },
    incidentState: "baseline-diverging",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 35,
      newDivergenceRatePerMinute: 9,
      missingEntryCount: 22,
      duplicateSettlementEntryCount: 14,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 36,
      reconciliationStatus: "diverging",
      duplicationSeverity: "moderate",
    },
    componentHealth: divergingHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      transactionApiSuccessRate: 99,
      operationalLedgerStatus: "normal",
      eventLagSeconds: 0,
      newDivergenceRatePerMinute: 0,
      missingEntryCount: 0,
      duplicateSettlementEntryCount: 0,
      discardedAcknowledgedEntryCount: 0,
      reconciliationBacklogCount: 0,
      reconciliationStatus: "reconciled",
      duplicationSeverity: "none",
    },
    componentHealth: healthyHealth,
  },
];
