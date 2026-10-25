import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CONTINGENCY_RESERVE_KEY,
  FORECAST_CONFIDENCE_THRESHOLD_KEY,
  ON_DEMAND_FALLBACK_POLICY_KEY,
  OPTIONAL_WORKLOAD_SHEDDING_KEY,
  RESERVATION_TIMING_KEY,
  RESERVED_CAPACITY_REGION_A_KEY,
  RESERVED_CAPACITY_REGION_B_KEY,
  RESERVED_CAPACITY_REGION_C_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── reservedCapacityRegionA/B/C ──────────────────────────────────────
  {
    id: "acc_1",
    controlKey: RESERVED_CAPACITY_REGION_A_KEY,
    valueEquals: 900,
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "beneficial",
    feedback: {
      title: "Reserving 900 units in Region A builds real headroom toward the full forecast tail",
      explanation:
        "Committing Region A's reservation to its highest tier moves aggregate protected capacity meaningfully toward (and, paired with similar commitments elsewhere, past) the full p99 demand band. This is real, non-refundable spend paid once regardless of whether the event's actual demand ever uses it — only worthwhile as part of a genuinely balanced, aggregate-adequate strategy, never evaluated on this region alone.",
    },
  },
  {
    id: "acc_2",
    controlKey: RESERVED_CAPACITY_REGION_A_KEY,
    valueEquals: 0,
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving Region A unreserved commits nothing, for better or worse",
      explanation:
        "No capacity is committed in Region A at this level — by itself this is neither safe nor unsafe; it only becomes a real risk once combined with how much (and how unevenly) the other two regions are reserved, and with whether the event has actually arrived yet.",
    },
  },
  {
    id: "acc_3",
    controlKey: RESERVED_CAPACITY_REGION_B_KEY,
    valueEquals: 900,
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "beneficial",
    feedback: {
      title: "Reserving 900 units in Region B builds real headroom toward the full forecast tail",
      explanation:
        "Same lever as Region A, applied to Region B: real, non-refundable committed capacity that only earns its cost as part of a genuinely balanced, aggregate-adequate strategy across all three regions.",
    },
  },
  {
    id: "acc_4",
    controlKey: RESERVED_CAPACITY_REGION_C_KEY,
    valueEquals: 900,
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "beneficial",
    feedback: {
      title: "Reserving 900 units in Region C builds real headroom toward the full forecast tail",
      explanation:
        "Same lever as Regions A/B, applied to Region C: real, non-refundable committed capacity that only earns its cost as part of a genuinely balanced, aggregate-adequate strategy across all three regions.",
    },
  },
  {
    id: "acc_5",
    controlKey: RESERVED_CAPACITY_REGION_A_KEY,
    valueEquals: 300,
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "neutral",
    feedback: {
      title: "A low reservation level in Region A alone is not inherently unsafe",
      explanation:
        "A low per-region reservation level is only a real problem when the AGGREGATE total across all three regions, plus any fallback/shedding policy actually engaged, fails to cover the critical-tier demand band — never a conclusion to draw from one region's dial in isolation.",
    },
  },
  {
    id: "acc_6",
    controlKey: RESERVED_CAPACITY_REGION_B_KEY,
    valueEquals: 300,
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "neutral",
    feedback: {
      title: "A low reservation level in Region B alone is not inherently unsafe",
      explanation:
        "Same reasoning as Region A: only the aggregate strategy across all three regions (plus fallback/shedding) determines real safety, never one region's level alone.",
    },
  },
  {
    id: "acc_7",
    controlKey: RESERVED_CAPACITY_REGION_C_KEY,
    valueEquals: 300,
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "neutral",
    feedback: {
      title: "A low reservation level in Region C alone is not inherently unsafe",
      explanation:
        "Same reasoning as Regions A/B: only the aggregate strategy across all three regions (plus fallback/shedding) determines real safety, never one region's level alone.",
    },
  },

  // ── onDemandFallbackPolicy ────────────────────────────────────────────
  {
    id: "acc_8",
    controlKey: ON_DEMAND_FALLBACK_POLICY_KEY,
    valueEquals: "enabled",
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "beneficial",
    feedback: {
      title: "Enabling the on-demand fallback adds a real, bounded safety valve",
      explanation:
        "This turns a hard demand cliff above the reserved total into a real, if costlier, degraded mode rather than an outright shortfall — but it is a BOUNDED valve, not unlimited burst capacity. It genuinely rescues a moderate, otherwise-thin gap (Alternate Strong Path B's anchor strategy, and a regional-disruption scenario where the remaining regions are only modestly short), but it cannot rescue a severe under-reservation or a severe single-region concentration loss on its own.",
    },
  },
  {
    id: "acc_9",
    controlKey: ON_DEMAND_FALLBACK_POLICY_KEY,
    valueEquals: "disabled",
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the on-demand fallback disabled is safe only when reserved capacity is already adequate on its own",
      explanation:
        "With no fallback engaged, any demand above the reserved total is simply refused rather than served at a premium. This is genuinely fine for a strategy that already reserves enough on its own (Alternate Strong Path A), but removes the one mechanism that would otherwise rescue a thinner reservation or a regional-disruption scenario.",
    },
  },

  // ── optionalWorkloadShedding ──────────────────────────────────────────
  {
    id: "acc_10",
    controlKey: OPTIONAL_WORKLOAD_SHEDDING_KEY,
    valueEquals: "shed-under-pressure",
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "beneficial",
    feedback: {
      title: "Shedding Optional-Tier workload under pressure deliberately protects Critical-Tier capacity",
      explanation:
        "This business's invariants explicitly permit Optional-Tier workload to be degraded or dropped — engaging this policy makes that an explicit, deliberate choice (Alternate Strong Path B's completeness) rather than something that merely happens to work out by coincidence of how much capacity is left over.",
    },
  },
  {
    id: "acc_11",
    controlKey: OPTIONAL_WORKLOAD_SHEDDING_KEY,
    valueEquals: "none",
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving optional-workload shedding disengaged treats all workload identically",
      explanation:
        "Critical-Tier and Optional-Tier workload compete for capacity on equal footing without this engaged. When reserved capacity is already comfortably adequate for everything (Alternate Strong Path A), this never matters in practice — but it means any Optional-Tier protection that does occur was never a deliberate policy decision.",
    },
  },

  // ── forecastConfidenceThreshold ──────────────────────────────────────
  {
    id: "acc_12",
    controlKey: FORECAST_CONFIDENCE_THRESHOLD_KEY,
    valueEquals: "p99-planning",
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "beneficial",
    feedback: {
      title: "Planning against the p99 band explicitly treats forecast uncertainty as real",
      explanation:
        "Declaring the plan basis as the near-worst-case forecast band is the most explicit way to acknowledge that real demand regularly lands above the median — this is a stated intent, not itself a reservation amount, so it must still be backed by an aggregate reservation (plus fallback/shedding) that genuinely covers that band.",
    },
  },
  {
    id: "acc_13",
    controlKey: FORECAST_CONFIDENCE_THRESHOLD_KEY,
    valueEquals: "p90-planning",
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "neutral",
    feedback: {
      title: "Planning against the p90 band is a genuine middle ground, not a guarantee",
      explanation:
        "This acknowledges meaningful forecast uncertainty without committing to the most conservative basis — whether it is adequate depends entirely on whether the actual reservation decision covers the band this declares.",
    },
  },
  {
    id: "acc_14",
    controlKey: FORECAST_CONFIDENCE_THRESHOLD_KEY,
    valueEquals: "p50-only",
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "harmful",
    feedback: {
      title: "Planning against only the median forecast ignores the demand band's own stated uncertainty",
      explanation:
        "The forecast was published with an explicit, wide uncertainty band precisely because real demand regularly lands above the median. Leaving the plan basis at the median alone is a real gap distinct from simply reserving too little capacity outright — a reservation level that happens to look adequate against the median can still fail against the tail this exact choice never acknowledged.",
    },
  },

  // ── reservationTiming ────────────────────────────────────────────────
  {
    id: "acc_15",
    controlKey: RESERVATION_TIMING_KEY,
    valueEquals: "lock-in-now",
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "beneficial",
    feedback: {
      title: "Locking in the reservation actually commits whatever capacity levels are currently set",
      explanation:
        "This is what converts the current region dial settings from a hypothetical plan into a real, committed, non-refundable reservation before the provider's guaranteed window closes. It does not change WHAT is reserved — only whether and when the decision is actually locked in.",
    },
  },
  {
    id: "acc_16",
    controlKey: RESERVATION_TIMING_KEY,
    valueEquals: "wait",
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "harmful",
    feedback: {
      title: "Leaving the reservation decision at 'wait' accrues real deadline risk every tick",
      explanation:
        "Taking no action is not a neutral, cost-free holding pattern here — every tick spent at 'wait' past the authored deadline is a tick of real, accumulating, non-undoable exposure (see cumulativeDeadlineMissExposureUnits), regardless of how adequate the region dial settings currently look. The reservation is never actually committed until this is explicitly flipped.",
    },
  },

  // ── contingencyReservePercent ────────────────────────────────────────
  {
    id: "acc_17",
    controlKey: CONTINGENCY_RESERVE_KEY,
    valueEquals: "large",
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "harmful",
    feedback: {
      title: "A large contingency buffer on top of an already-high reservation is real, priced waste",
      explanation:
        "Paired with an already-high reservation level, this pushes committed capacity far beyond anything the forecast's own worst-case (p99) band would ever use. It does not create a live headroom violation — the system still looks technically safe — but it is a real, non-refundable cost with no corresponding safety benefit over the already-adequate level underneath it, exactly the 'maximal reservation, no regard for waste' trap this scenario requires.",
    },
  },
  {
    id: "acc_18",
    controlKey: CONTINGENCY_RESERVE_KEY,
    valueEquals: "small",
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "neutral",
    feedback: {
      title: "A small contingency buffer is a modest, genuinely bounded cost",
      explanation:
        "This adds a deliberately small margin beyond whatever the region controls already commit — a real but modest cost, not the scenario's required maximal-waste trap, which only manifests once this is paired with already-high reservation levels at 'large'.",
    },
  },
  {
    id: "acc_19",
    controlKey: CONTINGENCY_RESERVE_KEY,
    valueEquals: "none",
    whenTriggerEquals: { decisionWindowOpen: true },
    outcome: "neutral",
    feedback: {
      title: "Carrying no contingency buffer is fine as long as the region reservations are themselves adequate",
      explanation:
        "This control exists purely as an additional margin on top of the region reservations — leaving it at none neither helps nor hurts by itself; it only matters in combination with how adequate the underlying region-level reservation already is.",
    },
  },
];
