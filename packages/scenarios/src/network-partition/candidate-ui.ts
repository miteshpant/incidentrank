import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  LEDGER_AUTHORITATIVE_REGION_KEY,
  LEDGER_READ_MODE_KEY,
  LEDGER_WRITE_ROUTING_KEY,
  PROFILE_CONSISTENCY_MODE_KEY,
  REGION_A_ISOLATION_KEY,
  REGION_B_ISOLATION_KEY,
} from "./controls";

export const networkPartitionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "replicationHealth", label: "Replication Health", sourceStateKey: "replicationHealth", format: "status" },
    { key: "regionAAvailability", label: "Region A Availability", sourceStateKey: "regionAAvailability", format: "percentage" },
    { key: "regionBAvailability", label: "Region B Availability", sourceStateKey: "regionBAvailability", format: "percentage" },
    { key: "ledgerWriteAuthority", label: "Ledger Write Authority", sourceStateKey: "ledgerWriteAuthority", format: "status" },
    { key: "ledgerConsistencyViolationCount", label: "Ledger Consistency Violations", sourceStateKey: "ledgerConsistencyViolationCount", format: "number" },
    { key: "staleLedgerReadsServedPerMin", label: "Stale Ledger Reads/min", sourceStateKey: "staleLedgerReadsServedPerMin", format: "number" },
    { key: "profileStaleReadAgeSeconds", label: "Profile Staleness (s)", sourceStateKey: "profileStaleReadAgeSeconds", format: "duration" },
    { key: "profileUnreconciledWriteCount", label: "Unreconciled Profile Writes", sourceStateKey: "profileUnreconciledWriteCount", format: "number" },
    { key: "ledgerSafetyStatus", label: "Ledger Safety Status", sourceStateKey: "ledgerSafetyStatus", format: "status" },
  ],
  controls: [
    {
      key: LEDGER_WRITE_ROUTING_KEY,
      label: "Ledger Write Routing",
      componentId: "replicated-service",
      valueLabels: {
        "local-region-authoritative": "Local Region Authoritative",
        "single-region-authoritative": "Single Region Authoritative",
      },
    },
    {
      key: LEDGER_AUTHORITATIVE_REGION_KEY,
      label: "Ledger Authoritative Region",
      componentId: "replicated-service",
      valueLabels: { "region-a": "Region A", "region-b": "Region B" },
    },
    {
      key: LEDGER_READ_MODE_KEY,
      label: "Ledger Read Mode",
      componentId: "replicated-service",
      valueLabels: { "allow-stale-reads": "Allow Stale Reads", "block-stale-reads": "Block Stale Reads" },
    },
    {
      key: PROFILE_CONSISTENCY_MODE_KEY,
      label: "Profile Consistency Mode",
      componentId: "replicated-service",
      valueLabels: {
        "eventual-multi-region": "Eventual (Multi-Region)",
        "strong-single-region": "Strong (Single-Region)",
      },
    },
    {
      key: REGION_A_ISOLATION_KEY,
      label: "Region A Isolation",
      componentId: "region-a",
      valueLabels: { serving: "Serving", "read-only": "Read-Only", isolated: "Isolated" },
    },
    {
      key: REGION_B_ISOLATION_KEY,
      label: "Region B Isolation",
      componentId: "region-b",
      valueLabels: { serving: "Serving", "read-only": "Read-Only", isolated: "Isolated" },
    },
  ],
  components: [
    { id: "region-a", label: "Region A" },
    { id: "replicated-service", label: "Replicated Service" },
    { id: "region-b", label: "Region B" },
  ],
};
