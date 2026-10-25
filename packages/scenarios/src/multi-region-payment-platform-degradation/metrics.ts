import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Payment authorization success rate per region, 0-100.
  usPaymentSuccessRate: 99,
  euPaymentSuccessRate: 99,
  // Payment authorization P99 latency per region, in ms.
  usPaymentLatencyMs: 220,
  euPaymentLatencyMs: 240,
  // Cross-region ledger replication lag, in seconds. Zero is healthy.
  // Climbs when US-authoritative write volume outpaces the replication
  // link's current throughput; only recovers gradually over real
  // elapsed time once write pressure drops back below the link's
  // catch-up capacity -- never resolved instantly by a control change
  // (see rules.ts's recovery-lag decay sequence).
  ledgerReplicationLagSeconds: 0,
  // US ledger/settlement write-path utilization, 0-100+. Can exceed 100
  // to make overload genuinely visible (not merely "high but still a
  // percentage"). Driven by native US volume PLUS any EU traffic
  // shifted onto US capacity.
  usLedgerUtilization: 40,
  // Settlement backlog, in thousands of unsettled transactions queued
  // for the shared Settlement Pipeline. Zero is healthy. Climbs under
  // ledger-write pressure; drains gradually once write pressure drops,
  // modeled with an explicit multi-tick decay (recovery lag).
  settlementBacklogThousands: 0,
  // Fraud Provider's own health as seen by both regions' risk services.
  // This is the ROOT EU-side dependency degradation driving the
  // incident -- EU calls it over a materially slower/lossier regional
  // path than US does, so the SAME provider degradation affects EU far
  // more than US (modeled as separate risk-check success fields below).
  fraudProviderHealth: "healthy",
  // Risk-check (fraud + enrichment) success rate per region, 0-100.
  // Distinct from payment success: a request can be correctly BLOCKED
  // by risk/fraud (not a "success" for risk-check purposes) without
  // that being a payment platform defect.
  usRiskCheckSuccessRate: 99,
  euRiskCheckSuccessRate: 99,
  // Percentage of EU-origin traffic currently being served by US
  // capacity instead of EU capacity -- the direct mirror/consequence of
  // the euTrafficPercentage control, surfaced as its own metric so the
  // candidate can observe actual cross-region traffic flow distinct
  // from the control's nominal setting.
  crossRegionTrafficPercentage: 0,

  // ── Internal tracking fields (not necessarily all surfaced in
  // candidate-ui.ts, but real authored state) ───────────────────────

  // Whether a payment has actually been authorized by one region's
  // payment API against an account whose ledger authority has not
  // settled consistently -- the direct, counted correctness violation
  // the "no divergent ledger authority" invariant gates on. Zero is the
  // only safe value.
  divergentLedgerAuthorityCount: 0,
  // Whether the live fraud/risk check was bypassed for any processed
  // payment -- the direct, counted correctness violation the "mandatory
  // fraud controls may not be bypassed" invariant gates on. Zero is the
  // only safe value.
  fraudControlBypassCount: 0,
  // Generic string-state field recording the dominant risk-posture
  // currently in effect, read by scoring's dataIntegrity measure.
  // "fraud-controls-intact" = live-provider or cached-rules fallback in
  // use (a real mandatory check always ran). "fraud-controls-bypassed" =
  // bypass mode engaged while the fraud provider is the active risk
  // path -- the forbidden state.
  riskControlPosture: "fraud-controls-intact",
  // Generic string-state field recording how ledger write authority is
  // currently being maintained, read by scoring's dataIntegrity measure
  // and mirroring Network Partition's ledgerSafetyMechanism precedent.
  // "us-authoritative-routed" = the structural fix (ledgerWriteAuthority
  // control set to us-authoritative) -- safe regardless of how much EU
  // traffic is shifted. "region-local-safe" = region-local routing with
  // negligible/no cross-region shift in effect, so no divergence risk
  // has actually materialized yet. "region-local-unsafe" = region-local
  // routing WHILE EU traffic is being shifted onto US capacity -- the
  // trap: a payment authorized via US infra against an EU-origin
  // account can race the EU ledger's own local write for the same
  // account.
  ledgerAuthorityMechanism: "region-local-safe",
  // Severity field (exactly "normal"|"warning"|"critical", per
  // SeverityFieldConfig) tracking US ledger/settlement capacity risk
  // specifically -- distinct from fraudProviderHealth (which tracks the
  // EU dependency root cause) and from payment-availability metrics
  // (which can read healthy while this is critical). "critical" only
  // while US ledger/settlement is genuinely overloaded
  // (usLedgerUtilization > 100, e.g. the us-ledger-overloaded harmful
  // path or either divergent-authority trap); "warning" while
  // correctness is safe but capacity is still draining (the
  // acceptable-tier states); "normal" once fully drained (optimal) or
  // before any capacity pressure has materialized. This is what gives
  // reliability's criticalTimeRatio measure real discriminating power
  // between the acceptable (draining) and optimal (fully recovered)
  // tiers, since payment-availability metrics alone do not distinguish
  // them.
  capacityRiskStatus: "normal",
  // Unified correctness gate read by scoring's dataIntegrity measure --
  // "safe" only when NEITHER business invariant has been violated
  // (ledgerAuthorityMechanism !== "region-local-unsafe" AND
  // riskControlPosture !== "fraud-controls-bypassed"); "violated"
  // otherwise. A single field so dataIntegrity can band on ONE measure
  // (the generic scorer's per-dimension limitation) while still
  // reflecting BOTH correctness invariants -- an attempt that bypassed
  // fraud controls must never score full dataIntegrity marks merely
  // because ledger authority happened to be routed correctly, and vice
  // versa.
  correctnessStatus: "safe",
};
