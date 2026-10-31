import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  FORCE_LEADER_REELECTION_KEY,
  INSPECT_LEDGER_ORDERING_KEY,
  INSPECT_LOCK_SERVICE_LOGS_KEY,
  INSPECT_NTP_SYNC_STATUS_KEY,
  INSPECT_RATE_LIMITER_WINDOWS_KEY,
  RESTART_LEDGER_SERVICE_KEY,
  RESTART_LOCK_SERVICE_KEY,
  RESTART_RATE_LIMITER_KEY,
  RESYNC_FLEET_CLOCKS_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 *
 * ntpSyncOffsetMs is the root cause: the NTP sync job silently failing is
 * the single shared ancestor behind all three downstream symptoms.
 * fleetClockSkewMs is a contributing factor — the directly-measurable
 * consequence of the offset that actually corrupts each subsystem's
 * timestamp-ordered decisions. lockServiceSplitBrainCount,
 * ledgerOutOfOrderWriteRatePercent, and rateLimiterFalseThrottleRatePercent
 * are the three simultaneous, independently-observed downstream symptoms
 * — the whole point of the scenario is that none of them call each
 * other, so a candidate who fixes one in isolation leaves the other two
 * completely unaffected. apiRequestVolumePerSecond is pure noise: it
 * dips during the incident (an unrelated marketing-campaign traffic dip
 * that happens to overlap the same window) but is never read by any
 * rule, success/failure condition, or fix.
 */
export const platformWideClockSkewBreaksDistributedConsensusCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "ntpSyncOffsetMs",
      label: "NTP Sync Offset",
      sourceStateKey: "ntpSyncOffsetMs",
      format: "duration",
      roleInIncident: "root_cause",
    },
    {
      key: "fleetClockSkewMs",
      label: "Fleet Clock Skew",
      sourceStateKey: "fleetClockSkewMs",
      format: "duration",
      roleInIncident: "contributing_factor",
    },
    {
      key: "lockServiceSplitBrainCount",
      label: "Lock Service Split-Brain Count",
      sourceStateKey: "lockServiceSplitBrainCount",
      format: "number",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "ledgerOutOfOrderWriteRatePercent",
      label: "Ledger Out-of-Order Write Rate",
      sourceStateKey: "ledgerOutOfOrderWriteRatePercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "rateLimiterFalseThrottleRatePercent",
      label: "Rate Limiter False-Throttle Rate",
      sourceStateKey: "rateLimiterFalseThrottleRatePercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "apiRequestVolumePerSecond",
      label: "API Request Volume",
      sourceStateKey: "apiRequestVolumePerSecond",
      format: "number",
      roleInIncident: "noise",
    },
  ],
  controls: [
    {
      key: INSPECT_NTP_SYNC_STATUS_KEY,
      label: "Inspect NTP Sync Status",
      componentId: "ntp-time-source",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_LOCK_SERVICE_LOGS_KEY,
      label: "Inspect Lock Service Logs",
      componentId: "lock-service",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_LEDGER_ORDERING_KEY,
      label: "Inspect Ledger Write Ordering",
      componentId: "ledger-service",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_RATE_LIMITER_WINDOWS_KEY,
      label: "Inspect Rate Limiter Windows",
      componentId: "rate-limiter",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: RESYNC_FLEET_CLOCKS_KEY,
      label: "Resync Fleet Clocks",
      componentId: "ntp-time-source",
      kind: "remediation",
      valueLabels: { false: "Not resynced", true: "Resynced" },
    },
    {
      key: FORCE_LEADER_REELECTION_KEY,
      label: "Force Leader Re-Election",
      componentId: "lock-service",
      kind: "remediation",
      valueLabels: { false: "Not forced", true: "Forced" },
    },
    {
      key: RESTART_LOCK_SERVICE_KEY,
      label: "Restart Lock Service",
      componentId: "lock-service",
      kind: "remediation",
      valueLabels: { false: "Not restarted", true: "Restarted" },
    },
    {
      key: RESTART_LEDGER_SERVICE_KEY,
      label: "Restart Ledger Service",
      componentId: "ledger-service",
      kind: "remediation",
      valueLabels: { false: "Not restarted", true: "Restarted" },
    },
    {
      key: RESTART_RATE_LIMITER_KEY,
      label: "Restart Rate Limiter",
      componentId: "rate-limiter",
      kind: "remediation",
      valueLabels: { false: "Not restarted", true: "Restarted" },
    },
  ],
  components: [
    { id: "ntp-time-source", label: "NTP Time Source" },
    { id: "lock-service", label: "Distributed Lock Service" },
    { id: "ledger-service", label: "Event-Sourcing Ledger" },
    { id: "rate-limiter", label: "Sliding-Window Rate Limiter" },
    { id: "fleet-nodes", label: "Fleet Nodes" },
  ],
};
