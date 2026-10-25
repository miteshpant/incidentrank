import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Cost, the headline symptom. Dollars/month, read directly by the
  // candidate-facing UI as well as by the generic costIncreaseRatio
  // measure via infrastructureCost below.
  monthlyCrossRegionTransferCostUsd: 4_200,
  monthlyStorageDuplicationCostUsd: 2_100,
  // Combined total — the single field successCondition/
  // acceptableCondition actually gate on, so a candidate who reduces
  // ONLY the storage-duplication half (e.g. archive-only-fix) or ONLY
  // the transfer half is still judged on real, total spend relief
  // rather than a single cost field that happens not to move for a
  // genuinely effective lever.
  monthlyTotalReplicationCostUsd: 6_300,

  // Generic string-state tier (same pattern as Replication Backlog's
  // replicationHealth and Privilege Escalation's authorizationStatus)
  // banding the real, rule-authored total-cost reduction into a
  // discrete judgment tier. This exists because the engine's generic
  // costIncreaseRatio measure compares PEAK infrastructure cost against
  // baseline (Math.max every tick) — since every lever in this
  // scenario only ever reduces cost below the already-inflated
  // baseline, peak cost never rises above baseline and the ratio is
  // permanently 0 for every reachable path. costReductionTier instead
  // reads the real, rule-authored monthlyTotalReplicationCostUsd
  // directly, giving scoring.ts a genuine way to reward deeper cost
  // reduction over shallower cost reduction as a first-class axis
  // (phase6e2.md requirement 1), without inventing scenario-specific
  // scorer code — this is the same generic finalStringEquals mechanism
  // every other built-in scenario's non-generic judgment axis uses.
  costReductionTier: "no-reduction",

  // ── Freshness, per class. All three read as healthy before the
  // policy change — this incident is never about anything being stale
  // or broken; it is about what it now costs to keep everything this
  // fresh.
  criticalFreshnessSeconds: 1,
  standardFreshnessSeconds: 2,
  lowPriorityFreshnessSeconds: 3,

  // ── Durability / policy-compliance judgment fields (generic
  // string-state fields, same pattern as Replication Backlog's
  // replicationHealth and Privilege Escalation's authorizationStatus).
  // "policy-compliant" is the only value meaning "critical data
  // genuinely still carries its mandated 3x regional durability floor
  // right now." Never conflated with freshness or availability — a
  // class can read perfectly fresh while being below its durability
  // floor.
  criticalDataDurabilityStatus: "policy-compliant",

  // Whether low-priority fan-out scope has been narrowed to the
  // business-invariant-sanctioned "not everything needs full active
  // replication everywhere" scope, independent of the durability
  // question above.
  replicationScopeStatus: "full-uniform-fanout",

  // Archive/object storage's own, separately-judged replication mode.
  archiveDurabilityStatus: "full-sync-unneeded",

  // ── Historical exposure — the non-resetting field (numericWatchField
  // with trackPeak: true). Stays 0 unless critical data's durability
  // floor was ever actually breached WHILE a disaster-recovery
  // verification drill ran against it — a real, authored
  // "what already happened cannot be erased" consequence, never a
  // live-cost-only puzzle. See timed-events.ts/rules.ts.
  criticalDataExposureEventCount: 0,

  // Live gauge: is a DR verification drill against critical data
  // currently in flight right now (informational to the candidate;
  // never itself a penalty — only an ACTUAL breach found during one
  // is).
  drDrillStatus: "none-scheduled",
};
