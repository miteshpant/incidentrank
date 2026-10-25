import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  DUPLICATE_SUPPRESSION_KEY,
  EVENT_PUBLISHING_MODE_KEY,
  EXCEPTION_POLICY_KEY,
  RECONCILIATION_MODE_KEY,
  REPAIR_QUEUE_PRIORITY_KEY,
  SETTLEMENT_CONSUMER_MODE_KEY,
  SETTLEMENT_WRITE_CONCURRENCY_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` explaining the system consequence, including
 * (per phase6d.2.md section 13) any historical damage incurred or
 * avoided and where pressure moved.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: EVENT_PUBLISHING_MODE_KEY,
    valueEquals: "replay-unsafe",
    whenTriggerEquals: { publisherBugActive: true },
    outcome: "harmful",
    feedback: {
      title: "Blind-replayed the recent event window",
      explanation:
        "Replay mode re-publishes the entire recent event window to try to catch missing entries up quickly. It has no way to tell an event that already safely landed in the Settlement Ledger from one that genuinely never arrived, so every event that DID land gets re-applied — duplicateSettlementEntryCount explodes while missingEntryCount barely improves. This is a real, counted Data Integrity violation (settlement double-applying value), not merely a missed opportunity, and it happened on top of whatever divergence already existed.",
    },
  },
  {
    id: "acr_2",
    controlKey: EVENT_PUBLISHING_MODE_KEY,
    valueEquals: "at-least-once-safe",
    whenTriggerEquals: { publisherBugActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Fixed the publisher to stop new divergence",
      explanation:
        "Switching the Event Stream publisher to at-least-once-safe delivery stops NEW events from being dropped or duplicated — newDivergenceRatePerMinute drops to zero. This does not touch the missingEntryCount/duplicateSettlementEntryCount already accrued while the bug was active: those historical counters freeze at whatever they had already reached and require a separate repair process to actually drain. Fixing the cause is necessary but not sufficient on its own.",
    },
  },
  {
    id: "acr_3",
    controlKey: SETTLEMENT_CONSUMER_MODE_KEY,
    valueEquals: "paused",
    whenTriggerEquals: { publisherBugActive: true },
    outcome: "neutral",
    feedback: {
      title: "Paused the settlement consumer",
      explanation:
        "Pausing the Settlement Ledger's consumer stops it from reading any new events at all, which does stop new divergence from accruing — but it also stops ALL new legitimate settlement, including transactions that were never affected by the publisher bug. Event lag climbs sharply while paused. This contains damage but is not a free fix: nothing in the backlog drains while settlement is paused, and leaving it paused indefinitely is itself a growing availability problem.",
    },
  },
  {
    id: "acr_4",
    controlKey: EXCEPTION_POLICY_KEY,
    valueEquals: "auto-discard",
    whenTriggerEquals: { publisherBugActive: true },
    outcome: "harmful",
    feedback: {
      title: "Auto-discarded reconciliation exceptions",
      explanation:
        "Auto-discard clears the Exception/Repair Queue immediately — reconciliationBacklogCount drops to zero and every surface metric looks healthy. It achieves this by deleting exception records for transactions that were already acknowledged to the customer, which is exactly what the business invariant 'a transaction acknowledged to the customer may not simply be discarded to make reconciliation metrics look healthy' forbids. discardedAcknowledgedEntryCount is a separate, permanent, irreversible correctness violation that never improves, regardless of any other control or how much time passes.",
    },
  },
  {
    id: "acr_5",
    controlKey: EXCEPTION_POLICY_KEY,
    valueEquals: "auto-repair",
    whenTriggerEquals: { publisherBugActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Enabled real repair against the authoritative Operational Ledger",
      explanation:
        "Auto-repair resolves queued exceptions by backfilling missing entries from the Operational Ledger's authoritative record and reversing duplicate applications — never inventing a value, never discarding an acknowledged transaction. Combined with active exception routing and real elapsed repair time, this is what actually drains reconciliationBacklogCount rather than merely freezing it.",
    },
  },
  {
    id: "acr_6",
    controlKey: RECONCILIATION_MODE_KEY,
    valueEquals: "active-exception-routing",
    whenTriggerEquals: { publisherBugActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Switched reconciliation to active exception routing",
      explanation:
        "Active exception routing is a prerequisite for any repair to happen at all — passive-detect only measures and reports divergence without ever queuing it for resolution. On its own this does not drain the backlog (exceptionPolicy must also be set to auto-repair), but it is the necessary first step before repair throughput can do anything.",
    },
  },
  {
    id: "acr_7",
    controlKey: REPAIR_QUEUE_PRIORITY_KEY,
    valueEquals: "expedited",
    whenTriggerEquals: { publisherBugActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Expedited repair queue throughput",
      explanation:
        "Expedited priority measurably increases how fast the Exception/Repair Queue drains per unit of elapsed time once active routing and auto-repair are both engaged — reconciliationBacklogCount is materially lower at the same elapsed repair window than with normal priority. This comes at a real, authored infrastructure cost, and it still does not clear the backlog instantly: recovery remains gated on real elapsed repair time.",
    },
  },
  {
    id: "acr_8",
    controlKey: SETTLEMENT_WRITE_CONCURRENCY_KEY,
    valueEquals: "high",
    whenTriggerEquals: { publisherBugActive: true },
    outcome: "harmful",
    feedback: {
      title: "Raised settlement write concurrency while the publisher bug was still active",
      explanation:
        "Raising write concurrency while the publisher is still emitting incorrect events (dropped and duplicated) does not relieve anything — it lets more of those duplicate/erroneous writes land per unit of real time. duplicateSettlementEntryCount and newDivergenceRatePerMinute both come out measurably worse than the same trigger state at normal concurrency: pressure that looked like pure throughput was transferred directly into accelerated correctness damage.",
    },
  },
  {
    id: "acr_9",
    controlKey: DUPLICATE_SUPPRESSION_KEY,
    valueEquals: true,
    whenTriggerEquals: { publisherBugActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Enabled write-time duplicate suppression",
      explanation:
        "Duplicate suppression recognizes an incoming settlement write whose event id has already been applied and skips re-applying it — this stops NEW duplicate settlement entries from being created, including protecting against the publisher bug's own native duplicate emission. It has no effect on duplicate entries that already landed before it was enabled; those remain in the historical count until repaired.",
    },
  },
];
