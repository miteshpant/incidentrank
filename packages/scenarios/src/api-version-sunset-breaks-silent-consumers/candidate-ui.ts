import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  ENABLE_COMPATIBILITY_SHIM_KEY,
  EXTEND_SUNSET_DEADLINE_KEY,
  FORCE_HARD_CUTOVER_KEY,
  INSPECT_CONSUMER_REGISTRY_KEY,
  INSPECT_GATEWAY_ACCESS_LOGS_KEY,
  INSPECT_SUPPORT_TICKET_QUEUE_KEY,
  MIGRATE_DISCOVERED_CONSUMERS_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 */
export const apiVersionSunsetBreaksSilentConsumersCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "v1ErrorRate5xxPercent",
      label: "Orders API v1 5xx Error Rate",
      sourceStateKey: "v1ErrorRate5xxPercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "orderCreationFailureRatePercent",
      label: "Order Creation Failure Rate",
      sourceStateKey: "orderCreationFailureRatePercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "unregisteredV1CallerCount",
      label: "Unregistered v1 Caller Count",
      sourceStateKey: "unregisteredV1CallerCount",
      format: "number",
      roleInIncident: "root_cause",
    },
    {
      key: "registeredV1ConsumerMigratedPercent",
      label: "Registered Consumer Migration Rate",
      sourceStateKey: "registeredV1ConsumerMigratedPercent",
      format: "percentage",
      roleInIncident: "context",
    },
    {
      key: "supportTicketBacklogCount",
      label: "Support Ticket Backlog",
      sourceStateKey: "supportTicketBacklogCount",
      format: "number",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "gatewayTlsHandshakeFailureCount",
      label: "Gateway TLS Handshake Failures",
      sourceStateKey: "gatewayTlsHandshakeFailureCount",
      format: "number",
      roleInIncident: "noise",
    },
  ],
  controls: [
    {
      key: INSPECT_CONSUMER_REGISTRY_KEY,
      label: "Inspect Consumer Registry",
      componentId: "consumer-registry",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_GATEWAY_ACCESS_LOGS_KEY,
      label: "Inspect Gateway Access Logs",
      componentId: "api-gateway",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_SUPPORT_TICKET_QUEUE_KEY,
      label: "Inspect Support Ticket Queue",
      componentId: "orders-api-v1",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: EXTEND_SUNSET_DEADLINE_KEY,
      label: "Extend Sunset Deadline",
      componentId: "orders-api-v1",
      kind: "remediation",
      valueLabels: { false: "Not extended", true: "Extended" },
    },
    {
      key: ENABLE_COMPATIBILITY_SHIM_KEY,
      label: "Enable Emergency Compatibility Shim",
      componentId: "api-gateway",
      kind: "remediation",
      valueLabels: { false: "Disabled", true: "Enabled" },
    },
    {
      key: FORCE_HARD_CUTOVER_KEY,
      label: "Force Hard Cutover (Block v1 Traffic)",
      componentId: "api-gateway",
      kind: "remediation",
      valueLabels: { false: "Not forced", true: "Forced" },
    },
    {
      key: MIGRATE_DISCOVERED_CONSUMERS_KEY,
      label: "Migrate Discovered Long-Tail Consumers",
      componentId: "orders-api-v2",
      kind: "remediation",
      valueLabels: { false: "Not migrated", true: "Migrated" },
    },
  ],
  components: [
    { id: "api-gateway", label: "API Gateway" },
    { id: "orders-api-v1", label: "Orders API v1 (deprecated)" },
    { id: "orders-api-v2", label: "Orders API v2 (current)" },
    { id: "consumer-registry", label: "Consumer Registry" },
  ],
};
