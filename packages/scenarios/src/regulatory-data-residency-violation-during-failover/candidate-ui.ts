import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
  FAIL_BACK_TO_EU_KEY,
  FILE_BREACH_NOTIFICATION_KEY,
  INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY,
  INSPECT_FAILOVER_ROUTING_LOGS_KEY,
  INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY,
  STAY_FAILED_OVER_KEY,
  VERIFY_EU_REGION_RECOVERED_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 */
export const regulatoryDataResidencyViolationDuringFailoverCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "euRequestAvailabilityPercent",
      label: "EU Request Availability",
      sourceStateKey: "euRequestAvailabilityPercent",
      format: "percentage",
      roleInIncident: "context",
    },
    {
      key: "euRequestLatencyMs",
      label: "EU Request Latency",
      sourceStateKey: "euRequestLatencyMs",
      format: "duration",
      roleInIncident: "context",
    },
    {
      key: "euPersonalDataRecordsProcessedInUsCount",
      label: "EU Personal Data Records Processed in US",
      sourceStateKey: "euPersonalDataRecordsProcessedInUsCount",
      format: "number",
      roleInIncident: "root_cause",
    },
    {
      key: "dataResidencyViolationMinutes",
      label: "Data Residency Violation Duration",
      sourceStateKey: "dataResidencyViolationMinutes",
      format: "duration",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "usRegionCpuPercent",
      label: "US Failover Region CPU",
      sourceStateKey: "usRegionCpuPercent",
      format: "percentage",
      roleInIncident: "context",
    },
    {
      key: "euRegionCpuPercent",
      label: "EU Region CPU",
      sourceStateKey: "euRegionCpuPercent",
      format: "percentage",
      roleInIncident: "contributing_factor",
    },
    {
      key: "supportEscalationCount",
      label: "Support Escalation Count",
      sourceStateKey: "supportEscalationCount",
      format: "number",
      roleInIncident: "noise",
    },
  ],
  controls: [
    {
      key: INSPECT_FAILOVER_ROUTING_LOGS_KEY,
      label: "Inspect Failover Routing Logs",
      componentId: "global-traffic-manager",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY,
      label: "Inspect Data Residency Audit Trail",
      componentId: "compliance-gateway",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY,
      label: "Inspect Legal Notification Requirements",
      componentId: "compliance-gateway",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: FAIL_BACK_TO_EU_KEY,
      label: "Fail Back to EU Region Now",
      componentId: "global-traffic-manager",
      kind: "remediation",
      valueLabels: { false: "Not forced", true: "Forced" },
    },
    {
      key: STAY_FAILED_OVER_KEY,
      label: "Stay Failed Over to US Region",
      componentId: "global-traffic-manager",
      kind: "remediation",
      valueLabels: { false: "Not chosen", true: "Chosen" },
    },
    {
      key: VERIFY_EU_REGION_RECOVERED_KEY,
      label: "Verify EU Region Recovery",
      componentId: "eu-region",
      kind: "investigation",
      valueLabels: { false: "Not verified", true: "Verified" },
    },
    {
      key: ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
      label: "Enable EU Data-Lock Gateway",
      componentId: "compliance-gateway",
      kind: "remediation",
      valueLabels: { false: "Disabled", true: "Enabled" },
    },
    {
      key: FILE_BREACH_NOTIFICATION_KEY,
      label: "File Regulatory Breach Notification",
      componentId: "compliance-gateway",
      kind: "remediation",
      valueLabels: { false: "Not filed", true: "Filed" },
    },
  ],
  components: [
    { id: "global-traffic-manager", label: "Global Traffic Manager" },
    { id: "eu-region", label: "EU Region (eu-west-1)" },
    { id: "us-failover-region", label: "US Failover Region (us-east-1)" },
    { id: "compliance-gateway", label: "Data Residency Compliance Gateway" },
  ],
};
