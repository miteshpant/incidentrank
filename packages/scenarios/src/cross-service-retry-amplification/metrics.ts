import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Original customer-initiated requests per second entering the
  // Gateway. This number never changes due to retries — retries
  // amplify what happens AFTER this point, never the original demand.
  customerQps: 400,
  // The effective request volume actually arriving at the External
  // Provider per second, after every layer's independent retrying has
  // been applied to the same underlying customer requests. This is the
  // single number that proves (or disproves) amplification.
  providerQps: 400,
  // How many total retry attempts (summed across all four layers) a
  // single original customer request can trigger, given current retry
  // settings — the authored amplification factor made visible.
  effectiveAmplificationFactor: 1,
  // Requests currently in flight somewhere in the chain, waiting on a
  // response or retry.
  inFlightRequests: 300,
  // Percentage of original customer requests that ultimately succeed.
  customerSuccessRate: 99,
  // External Provider's own observed response latency, in milliseconds.
  providerLatencyMs: 220,
  // Percentage of the External Provider's connection pool / accept
  // capacity currently in use. This is what multiplicative amplification
  // actually threatens: the provider has a finite connection budget
  // shared by every one of IncidentRank's customers, not just this one.
  providerConnectionUtilizationPercent: 35,
  // Requests that were abandoned by the client/caller (timeout, retry
  // gave up, or active cancellation) but are still running somewhere
  // downstream, consuming capacity for work nobody is still waiting on.
  zombieRequestCount: 0,
  // Severity-level string field (normal/warning/critical) summarizing
  // overall chain health, driving status/peak-severity bookkeeping —
  // mirrors Payment Retry Storm's paymentTraffic/dbPressure pattern.
  chainHealthStatus: "normal",
  // Generic string-state field recording the retry-ownership topology
  // the candidate has actually reached, read only by scoring/success
  // conditions — never a scenario-specific scorer.
  retryOwnershipMode: "unowned",
  // Generic string-state field recording how fully the two secondary
  // safeguards (circuit breaker, cancellation propagation) have been
  // applied ONCE ownership is already correctly consolidated — "full"
  // (both on), "partial" (exactly one on), "none" (ownership correct
  // but neither secondary safeguard applied yet), or "n/a" (ownership
  // itself not yet consolidated, so hardening is not the relevant
  // question). Read only by scoring — never a scenario-specific scorer.
  hardeningMode: "n/a",
};
