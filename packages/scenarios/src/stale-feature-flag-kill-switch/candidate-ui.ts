import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
  INSPECT_FLAG_AUDIT_LOG_KEY,
  INSPECT_LEGACY_ENGINE_LOGS_KEY,
  RESTART_CHECKOUT_SERVICE_KEY,
  REVERT_UNRELATED_FLAG_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 */
export const staleFeatureFlagKillSwitchCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "checkoutErrorRate",
      label: "Checkout Error Rate",
      sourceStateKey: "checkoutErrorRate",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "checkoutLatencyMs",
      label: "Checkout Latency",
      sourceStateKey: "checkoutLatencyMs",
      format: "duration",
      roleInIncident: "context",
    },
    {
      key: "priceMismatchRatePercent",
      label: "Price Mismatch Rate",
      sourceStateKey: "priceMismatchRatePercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "legacyPricingEngineTrafficSharePercent",
      label: "Legacy Pricing Engine Traffic Share",
      sourceStateKey: "legacyPricingEngineTrafficSharePercent",
      format: "percentage",
      roleInIncident: "root_cause",
    },
    {
      key: "pricingCacheStaleEntryCount",
      label: "Pricing Cache Stale Entries",
      sourceStateKey: "pricingCacheStaleEntryCount",
      format: "number",
      roleInIncident: "contributing_factor",
    },
    {
      key: "supportTicketBacklogCount",
      label: "Support Ticket Backlog",
      sourceStateKey: "supportTicketBacklogCount",
      format: "number",
      roleInIncident: "noise",
    },
  ],
  controls: [
    {
      key: INSPECT_FLAG_AUDIT_LOG_KEY,
      label: "Inspect Feature Flag Audit Log",
      componentId: "feature-flag-service",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_LEGACY_ENGINE_LOGS_KEY,
      label: "Inspect Legacy Pricing Engine Logs",
      componentId: "legacy-pricing-engine",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: REVERT_UNRELATED_FLAG_KEY,
      label: "New Checkout Layout Flag",
      componentId: "feature-flag-service",
      kind: "remediation",
      valueLabels: { false: "Disabled", true: "Enabled" },
    },
    {
      key: RESTART_CHECKOUT_SERVICE_KEY,
      label: "Restart Checkout Service",
      componentId: "checkout-service",
      kind: "remediation",
      valueLabels: { false: "Not restarted", true: "Restarted" },
    },
    {
      key: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
      label: "Legacy Pricing Engine Kill Switch",
      componentId: "legacy-pricing-engine",
      kind: "remediation",
      valueLabels: { false: "Active (stale)", true: "Disabled" },
    },
  ],
  components: [
    { id: "web-frontend", label: "Web Frontend" },
    { id: "feature-flag-service", label: "Feature Flag Service" },
    { id: "checkout-service", label: "Checkout Service" },
    { id: "legacy-pricing-engine", label: "Legacy Pricing Engine" },
    { id: "pricing-cache", label: "Pricing Cache" },
  ],
};
