import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  DEPENDENCY_BACKOFF_KEY,
  LOGGING_LEVEL_KEY,
  PAYLOAD_LOGGING_MODE_KEY,
  RETENTION_MODE_KEY,
  RETRY_COUNT_KEY,
  RETRY_OWNERSHIP_KEY,
  SAMPLING_RATE_PERCENT_KEY,
  TELEMETRY_DUPLICATION_KEY,
} from "./controls";

export const expensiveRetryAndLoggingAmplificationCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "requestSuccessRate", label: "Request Success Rate", sourceStateKey: "requestSuccessRate", format: "percentage" },
    { key: "dependencyRequestCostUsdPerMonth", label: "Dependency Request Cost (monthly)", sourceStateKey: "dependencyRequestCostUsdPerMonth", format: "currency" },
    { key: "loggingCostUsdPerMonth", label: "Logging Cost (monthly)", sourceStateKey: "loggingCostUsdPerMonth", format: "currency" },
    { key: "telemetryCostUsdPerMonth", label: "Telemetry Cost (monthly)", sourceStateKey: "telemetryCostUsdPerMonth", format: "currency" },
    { key: "costOverrunPercent", label: "Cost Overrun vs. Pre-Deploy Baseline", sourceStateKey: "costOverrunPercent", format: "percentage" },
    { key: "operationalDebugSignalPercent", label: "Operational Debug Signal", sourceStateKey: "operationalDebugSignalPercent", format: "percentage" },
    { key: "auditLogIntegrityStatus", label: "Audit Log Integrity", sourceStateKey: "auditLogIntegrityStatus", format: "status" },
    { key: "cumulativeAuditLogBlindWindowSeconds", label: "Cumulative Audit Blind-Window Seconds (historical)", sourceStateKey: "cumulativeAuditLogBlindWindowSeconds", format: "number" },
    { key: "costPosture", label: "Cost/Observability Posture", sourceStateKey: "costPosture", format: "status" },
  ],
  controls: [
    {
      key: RETRY_COUNT_KEY,
      label: "Retry Count",
      componentId: "worker",
      valueLabels: { "2": "2 (deployed)", "1": "1", "0": "0 (no retries)" },
    },
    {
      key: RETRY_OWNERSHIP_KEY,
      label: "Retry Ownership",
      componentId: "api",
      valueLabels: { duplicated: "Duplicated (API + Worker)", "worker-owns-retries": "Worker Owns Retries" },
    },
    {
      key: LOGGING_LEVEL_KEY,
      label: "Logging Level",
      componentId: "logging-telemetry-pipeline",
      valueLabels: { verbose: "Verbose (deployed)", standard: "Standard", off: "Off (disables all logging)" },
    },
    {
      key: SAMPLING_RATE_PERCENT_KEY,
      label: "Telemetry Sampling Rate",
      componentId: "logging-telemetry-pipeline",
      valueLabels: { "100": "100% (deployed)", "25": "25%", "10": "10%" },
    },
    {
      key: PAYLOAD_LOGGING_MODE_KEY,
      label: "Payload Logging Mode",
      componentId: "logging-telemetry-pipeline",
      valueLabels: { "full-payload": "Full Payload (deployed)", "metadata-only": "Metadata Only" },
    },
    {
      key: TELEMETRY_DUPLICATION_KEY,
      label: "Telemetry Duplication",
      componentId: "logging-telemetry-pipeline",
      valueLabels: { duplicated: "Duplicated (deployed defect)", deduplicated: "Deduplicated" },
    },
    {
      key: RETENTION_MODE_KEY,
      label: "Retention Mode",
      componentId: "log-store",
      valueLabels: { "uniform-hot": "Uniform Hot (deployed)", tiered: "Tiered (audit logs full retention, routine logs cheap tier)" },
    },
    {
      key: DEPENDENCY_BACKOFF_KEY,
      label: "Dependency Backoff",
      componentId: "worker",
      valueLabels: { none: "None (deployed)", exponential: "Exponential" },
    },
  ],
  components: [
    { id: "api", label: "API" },
    { id: "worker", label: "Worker" },
    { id: "external-dependency", label: "External Dependency" },
    { id: "logging-telemetry-pipeline", label: "Logging + Telemetry Pipeline" },
    { id: "log-store", label: "Log Store" },
  ],
};
