import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  EXTERNAL_RISK_PROVIDER_FALLBACK_KEY,
  FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY,
  MANUAL_REVIEW_QUEUE_PRIORITY_KEY,
  RISK_PROVIDER_CIRCUIT_BREAKER_KEY,
  RULES_ENGINE_MODE_KEY,
  TRANSACTION_VELOCITY_THRESHOLD_KEY,
} from "./controls";

export const fraudControlDegradationCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "ledgerWriteSuccessRate", label: "Ledger Write Success Rate", sourceStateKey: "ledgerWriteSuccessRate", format: "percentage" },
    { key: "riskProviderLatencyMs", label: "External Risk Provider Latency", sourceStateKey: "riskProviderLatencyMs", format: "duration" },
    { key: "riskProviderFailureRate", label: "External Risk Provider Failure Rate", sourceStateKey: "riskProviderFailureRate", format: "percentage" },
    { key: "riskProviderStatus", label: "External Risk Provider Status", sourceStateKey: "riskProviderStatus", format: "status" },
    { key: "checkoutSuccessRate", label: "Checkout Success Rate", sourceStateKey: "checkoutSuccessRate", format: "percentage" },
    { key: "checkoutP99LatencyMs", label: "Checkout P99 Latency", sourceStateKey: "checkoutP99LatencyMs", format: "duration" },
    { key: "lowRiskTransactionSuccessRate", label: "Low-Risk Transaction Success Rate", sourceStateKey: "lowRiskTransactionSuccessRate", format: "percentage" },
    { key: "highRiskTransactionSuccessRate", label: "High-Risk Transaction Success Rate", sourceStateKey: "highRiskTransactionSuccessRate", format: "percentage" },
    { key: "manualReviewQueueDepth", label: "Manual Review Queue Depth", sourceStateKey: "manualReviewQueueDepth", format: "number" },
    { key: "cumulativeFraudReviewBypassCount", label: "Fraud Review Bypasses (Cumulative)", sourceStateKey: "cumulativeFraudReviewBypassCount", format: "number" },
    { key: "fraudControlStatus", label: "Fraud Control Status", sourceStateKey: "fraudControlStatus", format: "status" },
  ],
  controls: [
    {
      key: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY,
      label: "Fraud Review Mode by Risk Tier",
      componentId: "fraud-service",
      valueLabels: {
        "mandatory-all": "Mandatory Review for All",
        "risk-tiered-bounded-fallback": "Risk-Tiered Bounded Fallback",
        "bypass-all": "Bypass Review for All",
      },
    },
    {
      key: EXTERNAL_RISK_PROVIDER_FALLBACK_KEY,
      label: "External Risk Provider Fallback",
      componentId: "external-risk-provider",
      valueLabels: {
        "block-on-timeout": "Block on Timeout",
        "cached-risk-scores": "Cached Risk Scores",
        "approve-on-timeout": "Approve on Timeout",
      },
    },
    {
      key: RULES_ENGINE_MODE_KEY,
      label: "Rules Engine Mode",
      componentId: "rules-engine",
      valueLabels: { full: "Full", reduced: "Reduced", disabled: "Disabled" },
    },
    {
      key: TRANSACTION_VELOCITY_THRESHOLD_KEY,
      label: "Transaction Velocity Threshold",
      componentId: "rules-engine",
      valueLabels: { strict: "Strict", relaxed: "Relaxed" },
    },
    {
      key: RISK_PROVIDER_CIRCUIT_BREAKER_KEY,
      label: "Risk Provider Circuit Breaker",
      componentId: "external-risk-provider",
      valueLabels: {
        closed: "Closed",
        "half-open-probe": "Half-Open Probe",
        open: "Open",
      },
    },
    {
      key: MANUAL_REVIEW_QUEUE_PRIORITY_KEY,
      label: "Manual Review Queue Priority",
      componentId: "fraud-service",
      valueLabels: { fifo: "FIFO", "risk-weighted": "Risk-Weighted" },
    },
  ],
  components: [
    { id: "checkout", label: "Checkout" },
    { id: "payment-api", label: "Payment API" },
    { id: "fraud-service", label: "Fraud Service" },
    { id: "rules-engine", label: "Rules Engine" },
    { id: "external-risk-provider", label: "External Risk Provider" },
    { id: "ledger", label: "Ledger" },
  ],
};
