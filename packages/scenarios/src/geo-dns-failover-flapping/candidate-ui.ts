import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  FORCE_PIN_REGION_KEY,
  HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY,
  HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY,
  INSPECT_DNS_FAILOVER_HISTORY_KEY,
  INSPECT_HEALTH_CHECK_LOGS_KEY,
  INSPECT_REGION_LATENCY_HISTORY_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 */
export const geoDnsFailoverFlappingCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "regionEastP99LatencyMs",
      label: "US-East p99 Latency",
      sourceStateKey: "regionEastP99LatencyMs",
      format: "duration",
      roleInIncident: "context",
    },
    {
      key: "regionWestP99LatencyMs",
      label: "US-West p99 Latency",
      sourceStateKey: "regionWestP99LatencyMs",
      format: "duration",
      roleInIncident: "context",
    },
    {
      key: "healthCheckFailureStreakCount",
      label: "Health Check Failure Streak",
      sourceStateKey: "healthCheckFailureStreakCount",
      format: "number",
      roleInIncident: "contributing_factor",
    },
    {
      key: "dnsFailoverFlapCount",
      label: "DNS Failover Flap Count",
      sourceStateKey: "dnsFailoverFlapCount",
      format: "number",
      roleInIncident: "root_cause",
    },
    {
      key: "clientConnectionResetRatePercent",
      label: "Client Connection Reset Rate",
      sourceStateKey: "clientConnectionResetRatePercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "clientErrorRatePercent",
      label: "Client Error Rate",
      sourceStateKey: "clientErrorRatePercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "edgeCdnCacheHitRatePercent",
      label: "Edge CDN Cache Hit Rate",
      sourceStateKey: "edgeCdnCacheHitRatePercent",
      format: "percentage",
      roleInIncident: "noise",
    },
  ],
  controls: [
    {
      key: INSPECT_HEALTH_CHECK_LOGS_KEY,
      label: "Inspect Health Check Logs",
      componentId: "health-checker",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_REGION_LATENCY_HISTORY_KEY,
      label: "Inspect Region Latency History",
      componentId: "region-east",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_DNS_FAILOVER_HISTORY_KEY,
      label: "Inspect DNS Failover History",
      componentId: "geo-dns",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY,
      label: "Required Consecutive Failures Before Failover",
      componentId: "health-checker",
      kind: "remediation",
      valueLabels: { "1": "1", "2": "2", "3": "3", "5": "5" },
    },
    {
      key: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY,
      label: "Health Check Latency Tolerance",
      componentId: "health-checker",
      kind: "remediation",
      valueLabels: { "150": "150ms", "300": "300ms", "600": "600ms", "1200": "1,200ms" },
    },
    {
      key: FORCE_PIN_REGION_KEY,
      label: "Force-Pin DNS to One Region",
      componentId: "geo-dns",
      kind: "remediation",
      valueLabels: { false: "Not pinned", true: "Pinned" },
    },
  ],
  components: [
    { id: "global-clients", label: "Global Clients" },
    { id: "geo-dns", label: "GeoDNS Failover Controller" },
    { id: "health-checker", label: "Health Checker" },
    { id: "region-east", label: "Region: US-East" },
    { id: "region-west", label: "Region: US-West" },
  ],
};
