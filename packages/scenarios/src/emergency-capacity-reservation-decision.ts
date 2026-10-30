import type { ScenarioDefinition } from "./types";
import {
  CONTINGENCY_RESERVE_KEY,
  emergencyCapacityReservationDecisionSimulation,
  FORECAST_CONFIDENCE_THRESHOLD_KEY,
  ON_DEMAND_FALLBACK_POLICY_KEY,
  OPTIONAL_WORKLOAD_SHEDDING_KEY,
  RESERVATION_TIMING_KEY,
  RESERVED_CAPACITY_REGION_A_KEY,
  RESERVED_CAPACITY_REGION_B_KEY,
  RESERVED_CAPACITY_REGION_C_KEY,
} from "./emergency-capacity-reservation-decision/definition";
import { emergencyCapacityReservationDecisionCandidateUI } from "./emergency-capacity-reservation-decision/candidate-ui";
import { EMERGENCY_CAPACITY_RESERVATION_DECISION_SCORING } from "./emergency-capacity-reservation-decision/scoring";

/**
 * Emergency Capacity Reservation Decision — a paid, Principal-level
 * IncidentRank scenario (Phase 6E.4, scenario 99). A major demand event
 * is approaching and the reservation deadline is closing — this is a
 * PROACTIVE decision under genuine forecast uncertainty, not a reactive
 * diagnosis of an existing failure. Nothing is broken at the start: the
 * entire judgment happens before any real exposure exists, and the
 * decision's consequences only become visible once the event itself
 * actually arrives.
 */
export const emergencyCapacityReservationDecision: ScenarioDefinition = {
  id: "emergency-capacity-reservation-decision",
  slug: "emergency-capacity-reservation-decision",
  version: 1,
  name: "Emergency Capacity Reservation Decision",
  description:
    "A major demand event is approaching, and the window to lock in reserved (committed, non-refundable) capacity at guaranteed pricing is closing. The demand forecast is genuinely uncertain — it comes as a band (p50/p90/p99), not a single number — and the business depends on deciding how much capacity to reserve, and where, before the deadline passes. Five business invariants govern every decision: (1) Critical-Tier workload must have enough protected capacity under the authored demand band; (2) Optional-Tier workload may use on-demand capacity or be degraded — it is never required to be fully protected; (3) every reservation has real, non-refundable cost whether or not the event's actual demand ever uses it; (4) reserved capacity must stay distributed across regions inside this business's resilience policy — concentrating it in one region creates a hidden risk even when the aggregate total looks adequate; (5) the forecast's own stated uncertainty must be treated explicitly in the plan, never collapsed to a single expected-case number. Decide how much capacity to reserve in each region, whether to enable a bounded on-demand fallback for anything reserved capacity doesn't cover, whether to deliberately shed Optional-Tier workload under pressure to protect Critical-Tier capacity, which percentile of the forecast band the plan is actually sized against, and — critically — whether locking in the maximum possible reservation everywhere is genuinely the safest choice, or a trap that pays for protection the forecast's own worst case will never need.",
  difficulty: "principal",
  estimatedMinutes: 25,
  isFree: false,
  structure: "linear",
  simulation: emergencyCapacityReservationDecisionSimulation,
  library: {
    category: "Infrastructure & Capacity",
    tags: [
      "Capacity Planning",
      "Proactive Decision",
      "Forecast Uncertainty",
      "Regional Resilience",
      "Cost Discipline",
      "Deadline Risk",
    ],
    skills: [
      "Deciding under genuine forecast uncertainty rather than waiting for certainty that will never arrive",
      "Recognizing that an aggregate-adequate reservation can still hide a single-region concentration risk",
      "Distinguishing a deliberate, bounded degraded mode from an accidental one",
      "Treating deadline risk and non-refundable cost as real constraints on a proactive decision",
    ],
    shortDescription:
      "A major demand event is approaching and the reservation deadline is closing — decide how much expensive, non-refundable capacity to lock in, and where, before real demand ever arrives.",
  },
};

export {
  emergencyCapacityReservationDecisionSimulation,
  emergencyCapacityReservationDecisionCandidateUI,
  EMERGENCY_CAPACITY_RESERVATION_DECISION_SCORING,
  CONTINGENCY_RESERVE_KEY,
  FORECAST_CONFIDENCE_THRESHOLD_KEY,
  ON_DEMAND_FALLBACK_POLICY_KEY,
  OPTIONAL_WORKLOAD_SHEDDING_KEY,
  RESERVATION_TIMING_KEY,
  RESERVED_CAPACITY_REGION_A_KEY,
  RESERVED_CAPACITY_REGION_B_KEY,
  RESERVED_CAPACITY_REGION_C_KEY,
};
