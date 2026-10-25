import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  DUPLICATE_SUPPRESSION_KEY,
  EVENT_PUBLISHING_MODE_KEY,
  EXCEPTION_POLICY_KEY,
  RECONCILIATION_MODE_KEY,
  REPAIR_QUEUE_PRIORITY_KEY,
  SETTLEMENT_CONSUMER_MODE_KEY,
  SETTLEMENT_WRITE_CONCURRENCY_KEY,
} from "./controls";

export const ledgerReconciliationDivergenceCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "transactionApiSuccessRate", label: "Transaction API Success", sourceStateKey: "transactionApiSuccessRate", format: "percentage" },
    { key: "operationalLedgerStatus", label: "Operational Ledger Status", sourceStateKey: "operationalLedgerStatus", format: "status" },
    { key: "eventLagSeconds", label: "Event Stream Lag (s)", sourceStateKey: "eventLagSeconds", format: "duration" },
    { key: "newDivergenceRatePerMinute", label: "New Divergence Rate (events/min)", sourceStateKey: "newDivergenceRatePerMinute", format: "number" },
    { key: "missingEntryCount", label: "Missing Settlement Entries (historical)", sourceStateKey: "missingEntryCount", format: "number" },
    { key: "duplicateSettlementEntryCount", label: "Duplicate Settlement Entries (historical)", sourceStateKey: "duplicateSettlementEntryCount", format: "number" },
    { key: "discardedAcknowledgedEntryCount", label: "Discarded Acknowledged Entries", sourceStateKey: "discardedAcknowledgedEntryCount", format: "number" },
    { key: "reconciliationBacklogCount", label: "Reconciliation Backlog", sourceStateKey: "reconciliationBacklogCount", format: "number" },
    { key: "reconciliationStatus", label: "Reconciliation Status", sourceStateKey: "reconciliationStatus", format: "status" },
  ],
  controls: [
    {
      key: EVENT_PUBLISHING_MODE_KEY,
      label: "Event Publishing Mode",
      componentId: "event-stream",
      valueLabels: { buggy: "Buggy (default)", "at-least-once-safe": "At-Least-Once Safe", "replay-unsafe": "Replay Window (unsafe)" },
    },
    {
      key: SETTLEMENT_CONSUMER_MODE_KEY,
      label: "Settlement Consumer",
      componentId: "settlement-ledger",
      valueLabels: { consuming: "Consuming", paused: "Paused" },
    },
    {
      key: RECONCILIATION_MODE_KEY,
      label: "Reconciliation Mode",
      componentId: "reconciliation-service",
      valueLabels: { "passive-detect": "Passive Detect", "active-exception-routing": "Active Exception Routing" },
    },
    {
      key: EXCEPTION_POLICY_KEY,
      label: "Exception Policy",
      componentId: "repair-queue",
      valueLabels: { "hold-for-review": "Hold For Review", "auto-discard": "Auto-Discard", "auto-repair": "Auto-Repair" },
    },
    {
      key: REPAIR_QUEUE_PRIORITY_KEY,
      label: "Repair Queue Priority",
      componentId: "repair-queue",
      valueLabels: { normal: "Normal", expedited: "Expedited" },
    },
    {
      key: DUPLICATE_SUPPRESSION_KEY,
      label: "Duplicate Suppression",
      componentId: "settlement-ledger",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: SETTLEMENT_WRITE_CONCURRENCY_KEY,
      label: "Settlement Write Concurrency",
      componentId: "settlement-ledger",
      valueLabels: { normal: "Normal", high: "High" },
    },
  ],
  components: [
    { id: "transaction-api", label: "Transaction API" },
    { id: "operational-ledger", label: "Operational Ledger" },
    { id: "event-stream", label: "Event Stream" },
    { id: "settlement-ledger", label: "Settlement Ledger" },
    { id: "reconciliation-service", label: "Reconciliation Service" },
    { id: "repair-queue", label: "Exception / Repair Queue" },
  ],
};
