import type { ScenarioDefinition } from "./types";
import {
  BACKUP_FREQUENCY_KEY,
  DATABASE_REPLICA_CLASS_KEY,
  FAILOVER_RESERVE_KEY,
  MULTI_AZ_MODE_KEY,
  overprovisionedResilienceDuringLowRiskPeriodSimulation,
  PREWARMED_CACHE_CAPACITY_KEY,
  REPLICA_COUNT_KEY,
  STANDBY_FLEET_KEY,
  WARM_CAPACITY_KEY,
} from "./overprovisioned-resilience-during-low-risk-period/definition";
import { overprovisionedResilienceDuringLowRiskPeriodCandidateUI } from "./overprovisioned-resilience-during-low-risk-period/candidate-ui";
import { OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING } from "./overprovisioned-resilience-during-low-risk-period/scoring";

/**
 * Overprovisioned Resilience During Low-Risk Period — a paid,
 * Staff-level IncidentRank scenario (Phase 6E.2, scenario 88). Nothing
 * is broken. The platform is still running the expensive resilience
 * posture — full active-active multi-AZ capacity, peak-sized failover
 * reserve, high-frequency backups, peak-event compute and cache
 * headroom — that was correctly sized for a known high-risk period
 * which has now ended. The incident this scenario poses is the
 * overprovisioned cost itself, not an outage: decide what can safely be
 * reduced to the stated operating baseline, and recognize that some
 * reductions look identical to safe ones on every live dashboard metric
 * right now, while genuinely dropping below a mandatory resilience
 * floor that a real, periodic, scheduled single-AZ failure drill will
 * eventually test.
 */
export const overprovisionedResilienceDuringLowRiskPeriod: ScenarioDefinition = {
  id: "overprovisioned-resilience-during-low-risk-period",
  slug: "overprovisioned-resilience-during-low-risk-period",
  version: 1,
  name: "Overprovisioned Resilience During Low-Risk Period",
  description:
    "The previously-declared high-risk period has ended. Nothing is currently broken — every availability and latency metric is healthy — but the platform is still running the expensive resilience posture sized specifically for that now-concluded window: full active-active multi-AZ capacity, peak-sized failover reserve, high-frequency backups, and peak-event compute, standby, and cache headroom. Five business invariants govern every decision here: (1) the minimum redundancy floor must be preserved; (2) single-zone failure tolerance may not be removed if policy requires it; (3) peak-event-only capacity may be reduced after the event; (4) risk posture may be lowered only to the stated operating baseline; (5) cost savings are valuable, but never at the expense of mandatory resilience. The central judgment this scenario forces: a configuration can look perfectly healthy right now while genuinely sitting below the mandatory resilience floor, because the exposure that floor protects against is a real but infrequent event — a periodic, scheduled single-AZ failure drill — not something today's dashboard will ever show on its own. Decide which capacity is genuinely peak-event-only waste versus which capacity is the mandatory floor itself, reduce the former to the stated baseline, and never let aggressive cost-cutting remove the latter merely because nothing has failed yet.",
  difficulty: "staff",
  estimatedMinutes: 15,
  isFree: false,
  structure: "linear",
  simulation: overprovisionedResilienceDuringLowRiskPeriodSimulation,
  library: {
    category: "Infrastructure & Capacity",
    tags: [
      "Cost Efficiency",
      "Capacity Planning",
      "Resilience Floor",
      "Proactive Review",
      "Multi-AZ",
      "Internal Cost Review",
    ],
    skills: [
      "Distinguishing peak-event-only overprovisioning from a mandatory resilience floor",
      "Recognizing that a healthy dashboard is not proof of a safe operating posture",
      "Reducing cost to a stated operating baseline without crossing a policy-mandated minimum",
      "Choosing between a compute-first and a data-plane-first cost-reduction strategy",
    ],
    shortDescription:
      "The high-risk period has ended and the platform is still paying for peak-event resilience it no longer needs — reduce cost to the stated baseline without quietly dropping below the mandatory resilience floor.",
  },
};

export {
  overprovisionedResilienceDuringLowRiskPeriodSimulation,
  overprovisionedResilienceDuringLowRiskPeriodCandidateUI,
  OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING,
  BACKUP_FREQUENCY_KEY,
  DATABASE_REPLICA_CLASS_KEY,
  FAILOVER_RESERVE_KEY,
  MULTI_AZ_MODE_KEY,
  PREWARMED_CACHE_CAPACITY_KEY,
  REPLICA_COUNT_KEY,
  STANDBY_FLEET_KEY,
  WARM_CAPACITY_KEY,
};
