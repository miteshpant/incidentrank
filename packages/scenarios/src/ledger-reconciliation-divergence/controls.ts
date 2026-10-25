import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Whether the Event Stream -> Settlement Ledger publisher path is
 * emitting events correctly. "buggy" (the root cause, set by a timed
 * event — not directly candidate-controlled as a start state, but
 * candidate-reachable via EVENT_PUBLISHING_MODE_KEY) drops some events
 * and duplicates others. "at-least-once-safe" is the real structural
 * fix: it stops NEW drops/duplicates, but — per the Historical Damage
 * model — does nothing to the backlog/duplicate/missing counts already
 * accrued while buggy. "replay-unsafe" is the tempting trap: it
 * re-publishes the entire recent event window to "catch up" missing
 * entries fast, but has no way to distinguish an event that already
 * safely landed in the Settlement Ledger from one that genuinely never
 * arrived, so it duplicates settlement entries for every event that DID
 * land, on top of whatever is still genuinely missing.
 */
export const EVENT_PUBLISHING_MODE_KEY = "eventPublishingMode";

/**
 * Settlement Ledger's consumer of the Event Stream. "consuming"
 * (default) keeps settling new events — including, while the publisher
 * bug is active, new divergence. "paused" stops the Settlement Ledger
 * from consuming ANY new events at all: this stops new divergence from
 * accruing, but it ALSO stops all new legitimate settlement, which is
 * why "pause everything forever" is not a free safe state — paused
 * settlement means acknowledged transactions are not being settled at
 * all, which this scenario's failure condition treats as its own
 * growing risk if sustained too long. The correct play is: pause only
 * long enough to fix publishing, then resume.
 */
export const SETTLEMENT_CONSUMER_MODE_KEY = "settlementConsumerMode";

/**
 * Whether the Reconciliation Service actively routes detected
 * ledger/settlement mismatches into the Exception/Repair Queue for
 * repair, or merely measures/reports divergence without acting on it.
 * "passive-detect" (default) computes settlementDivergenceCount but
 * does nothing to resolve it — the backlog can freeze once the root
 * cause is fixed, but it never drains on its own. "active-exception-
 * routing" is required before any repair throughput (repairQueuePriority,
 * duplicateSuppression) can do anything at all — repair without
 * detection-and-routing has nothing to work from.
 */
export const RECONCILIATION_MODE_KEY = "reconciliationMode";

/**
 * How the Exception/Repair Queue's entries are handled once
 * reconciliation is actively routing mismatches into it. "hold-for-
 * review" (default) keeps every exception queued until it is genuinely
 * repaired (matched, backfilled, or confirmed duplicate-suppressed) --
 * slower, but never destroys a real financial discrepancy. "auto-
 * discard" is the scenario's forbidden lever: it clears the queue and
 * makes reconciliationBacklogCount look instantly healthy, but it does
 * this by DELETING exception records for transactions that were already
 * acknowledged to the customer -- a direct violation of "a transaction
 * acknowledged to the customer may not simply be discarded to make
 * reconciliation metrics look healthy," counted as its own, separate,
 * irreversible correctness violation (discardedAcknowledgedEntryCount).
 * "auto-repair" actually resolves exceptions against authoritative
 * Operational Ledger records once active routing + enough repair
 * throughput is engaged, draining the backlog for real.
 */
export const EXCEPTION_POLICY_KEY = "exceptionPolicy";

/**
 * Exception/Repair Queue worker throughput once exceptionPolicy is
 * "auto-repair". "normal" (default) drains the backlog slowly.
 * "expedited" drains it meaningfully faster — this scenario's
 * recovery-lag lever: raising this does not make the backlog vanish
 * instantly, it raises the drain RATE over real elapsed simulated
 * time (see rules.ts's multi-tick draining sequence), at a real,
 * authored infrastructure cost.
 */
export const REPAIR_QUEUE_PRIORITY_KEY = "repairQueuePriority";

/**
 * Write-time duplicate suppression at the Settlement Ledger: when "on",
 * an incoming settlement write whose event id has already been applied
 * is recognized and skipped rather than re-applied — this is what stops
 * NEW duplicate settlement entries from being created (including
 * specifically protecting against replay-unsafe's blind-replay
 * duplication, and against the publisher bug's own native duplicate
 * emission). It has no effect on duplicate entries that already landed
 * before it was turned on — those remain, historically, until repaired.
 */
export const DUPLICATE_SUPPRESSION_KEY = "duplicateSuppression";

/**
 * Settlement Ledger write-path concurrency. "high" increases settlement
 * write throughput — legitimately useful once the publisher bug is
 * fixed and duplicate suppression is on, where it helps the system work
 * through a now-correct event stream faster. But while the publisher
 * is still buggy and/or duplicate suppression is off, raising write
 * concurrency lets MORE duplicate/erroneous writes land per unit of
 * real time — the required pressure-transfer trap: a lever that looks
 * like pure throughput actually accelerates the exact damage this
 * scenario measures, with real, distinct authored numbers (see rules.ts).
 */
export const SETTLEMENT_WRITE_CONCURRENCY_KEY = "settlementWriteConcurrency";

export const controls: ControlDefinition[] = [
  {
    key: EVENT_PUBLISHING_MODE_KEY,
    allowedValues: ["buggy", "at-least-once-safe", "replay-unsafe"],
    initialValue: "buggy",
  },
  {
    key: SETTLEMENT_CONSUMER_MODE_KEY,
    allowedValues: ["consuming", "paused"],
    initialValue: "consuming",
  },
  {
    key: RECONCILIATION_MODE_KEY,
    allowedValues: ["passive-detect", "active-exception-routing"],
    initialValue: "passive-detect",
  },
  {
    key: EXCEPTION_POLICY_KEY,
    allowedValues: ["hold-for-review", "auto-discard", "auto-repair"],
    initialValue: "hold-for-review",
  },
  {
    key: REPAIR_QUEUE_PRIORITY_KEY,
    allowedValues: ["normal", "expedited"],
    initialValue: "normal",
  },
  {
    key: DUPLICATE_SUPPRESSION_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: SETTLEMENT_WRITE_CONCURRENCY_KEY,
    allowedValues: ["normal", "high"],
    initialValue: "normal",
  },
];
