import type { ScenarioDefinition } from "./types";
import {
  ledgerReconciliationDivergenceSimulation,
  DUPLICATE_SUPPRESSION_KEY,
  EVENT_PUBLISHING_MODE_KEY,
  EXCEPTION_POLICY_KEY,
  RECONCILIATION_MODE_KEY,
  REPAIR_QUEUE_PRIORITY_KEY,
  SETTLEMENT_CONSUMER_MODE_KEY,
  SETTLEMENT_WRITE_CONCURRENCY_KEY,
} from "./ledger-reconciliation-divergence/definition";
import { ledgerReconciliationDivergenceCandidateUI } from "./ledger-reconciliation-divergence/candidate-ui";
import { LEDGER_RECONCILIATION_DIVERGENCE_SCORING } from "./ledger-reconciliation-divergence/scoring";

/**
 * Ledger Reconciliation Divergence — a paid, Principal-level
 * IncidentRank scenario (docs/implementation_plan/phase6d.2.md,
 * scenario 66). The Event Stream publisher between the Operational
 * Ledger and the Settlement Ledger has begun dropping a subset of
 * financial events and duplicating others. The customer-facing
 * Transaction API and the Operational Ledger itself never degrade —
 * this is not an availability outage. The only visible symptoms are
 * downstream: rising event lag, rising settlement divergence, a
 * growing reconciliation backlog, and climbing missing/duplicate
 * settlement entry counts.
 */
export const ledgerReconciliationDivergence: ScenarioDefinition = {
  id: "ledger-reconciliation-divergence",
  slug: "ledger-reconciliation-divergence",
  version: 1,
  name: "Ledger Reconciliation Divergence",
  description:
    "The Event Stream publisher that carries financial events from the Operational Ledger to the Settlement Ledger has begun dropping a subset of events and duplicating others. Transaction API success and the Operational Ledger's own health never move — this does not look like, and must not be mistaken for, a simple availability outage. The only visible symptoms are downstream: event lag is growing, settlement divergence is rising, a reconciliation backlog is accumulating in the Exception/Repair Queue, and missing-entry and duplicate-settlement-entry counts are climbing. Four business invariants govern every decision here: (1) the Operational Ledger is the authoritative transaction record — it is never to be treated as suspect, and no fix should ever touch it to make downstream numbers look better; (2) settlement must never invent or double-apply value — a missing entry is repaired by backfilling from the authoritative Operational Ledger record, never guessed, and a duplicate is repaired by reversing the extra application, never by pretending it didn't happen; (3) a transaction already acknowledged to the customer may not simply be discarded to make reconciliation metrics look healthy — deleting an exception record for an acknowledged transaction is a permanent, irreversible correctness violation, not a shortcut; (4) historical financial divergence must be accounted for before this incident can be considered fully resolved — stopping the publisher defect only stops NEW divergence from accruing, it does not erase missing or duplicated entries that already happened, which require a real, separately-engaged repair process to drain over time. Decide how to stop new divergence without simply pausing settlement forever, how to route and repair the backlog that has already accrued without blindly replaying the event stream (which duplicates everything that already safely landed), and how much elapsed repair time a given backlog genuinely needs before handing the incident back.",
  difficulty: "principal",
  estimatedMinutes: 25,
  isFree: false,
  simulation: ledgerReconciliationDivergenceSimulation,
  library: {
    category: "Data Pipelines",
    tags: [
      "Financial Correctness",
      "Ledger Reconciliation",
      "Historical Damage",
      "Event Streaming",
      "Settlement",
      "Data Integrity",
    ],
    skills: [
      "Distinguishing live-traffic health from financial correctness",
      "Recognizing that fixing a root cause does not undo damage already caused",
      "Avoiding blind replay as a correctness-destroying shortcut",
      "Modeling a bounded, draining backlog instead of a frozen or discarded one",
    ],
    shortDescription:
      "A subset of financial events is missing, duplicated, or delayed between two ledgers while customer-facing traffic stays healthy — fixing the cause doesn't undo the backlog it already created.",
  },
};

export {
  ledgerReconciliationDivergenceSimulation,
  ledgerReconciliationDivergenceCandidateUI,
  LEDGER_RECONCILIATION_DIVERGENCE_SCORING,
  DUPLICATE_SUPPRESSION_KEY,
  EVENT_PUBLISHING_MODE_KEY,
  EXCEPTION_POLICY_KEY,
  RECONCILIATION_MODE_KEY,
  REPAIR_QUEUE_PRIORITY_KEY,
  SETTLEMENT_CONSUMER_MODE_KEY,
  SETTLEMENT_WRITE_CONCURRENCY_KEY,
};
