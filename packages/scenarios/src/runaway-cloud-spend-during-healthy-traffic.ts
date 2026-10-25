import type { ScenarioDefinition } from "./types";
import {
  AUTOSCALER_TARGET_UTILIZATION_KEY,
  IDLE_CAPACITY_POLICY_KEY,
  MIN_REPLICA_COUNT_KEY,
  REQUEST_BATCHING_MODE_KEY,
  runawayCloudSpendDuringHealthyTrafficSimulation,
  WARM_POOL_SIZE_KEY,
  WORKER_INSTANCE_CLASS_KEY,
} from "./runaway-cloud-spend-during-healthy-traffic/definition";
import { runawayCloudSpendDuringHealthyTrafficCandidateUI } from "./runaway-cloud-spend-during-healthy-traffic/candidate-ui";
import { RUNAWAY_CLOUD_SPEND_DURING_HEALTHY_TRAFFIC_SCORING } from "./runaway-cloud-spend-during-healthy-traffic/scoring";

/**
 * Runaway Cloud Spend During Healthy Traffic — a paid, Senior/Staff-level
 * IncidentRank scenario (docs/implementation_plan/phase6e2.md, scenario
 * 86). There is NO outage: request latency, error rate, and throughput
 * are all healthy and stay healthy for the entire scenario. What is
 * wrong is purely economic — a recent deployment left three independent
 * leftover misconfigurations active at once (a conservative autoscaler
 * target utilization, a replica floor raised during an unrelated past
 * traffic-spike incident and never lowered back, and an idle-capacity
 * policy that never scales down) that together keep infrastructure
 * spend far higher than this traffic level requires.
 *
 * Five business invariants govern every decision here: (1) customer
 * SLOs must remain within the authored bound at all times; (2) critical
 * redundancy may not be removed below the stated safety floor, no
 * matter how healthy traffic currently looks; (3) rightsizing may occur
 * gradually — there is no requirement to reach the optimal fleet size
 * instantly; (4) a temporary small latency increase is acceptable if it
 * stays inside SLO; (5) cost reduction is this scenario's PRIMARY
 * objective, not a secondary bonus layered on top of an availability
 * fix. The central trap: dropping the replica floor (or the idle-
 * capacity policy) below the safety floor produces the cheapest raw
 * cost numbers anywhere in the scenario while every customer-facing
 * metric stays exactly as green as before — because traffic is
 * genuinely healthy and low right now. That apparent win is not real:
 * it destroys redundancy headroom and creates a permanent, non-
 * resetting historical record of how long the floor was breached,
 * which restoring the floor afterward does not erase. Decide how to
 * right-size spend — by correcting the Autoscaler's own thresholds, by
 * raising effective per-instance throughput through batching, or some
 * combination of both — without ever trading away the redundancy this
 * fleet is sized to provide.
 */
export const runawayCloudSpendDuringHealthyTraffic: ScenarioDefinition = {
  id: "runaway-cloud-spend-during-healthy-traffic",
  slug: "runaway-cloud-spend-during-healthy-traffic",
  version: 1,
  name: "Runaway Cloud Spend During Healthy Traffic",
  description:
    "A cost-anomaly alert has fired: infrastructure spend is materially elevated versus the trailing baseline, following a recent deployment. Request latency, error rate, and throughput are all healthy right now and stay healthy throughout — there is no outage and no traffic spike here, only an economic problem. Three independent leftover misconfigurations are each contributing real, separate waste: the Autoscaler's target utilization was left at a conservative setting, the minimum replica count was raised during an unrelated past traffic-spike incident and never lowered back, and the idle-capacity policy never lets the fleet scale down during quiet periods. Five business invariants govern every decision here: (1) customer SLOs must remain within the authored bound at all times; (2) critical redundancy may not be removed below the stated safety floor, no matter how healthy traffic currently looks; (3) rightsizing may occur gradually, not instantly; (4) a temporary small latency increase is acceptable if it stays inside SLO; (5) cost reduction is a PRIMARY objective here, not a secondary bonus. The central trap: dropping the replica floor (or the idle-capacity drain policy) below the safety floor produces the cheapest infrastructure cost anywhere in this scenario while every customer-facing metric stays exactly as healthy as before. That apparent win is not real — it destroys redundancy headroom and creates a permanent, non-resetting historical record of how long the floor was breached that restoring it afterward does not erase. Decide how to right-size spend without ever trading away the redundancy this fleet exists to provide.",
  difficulty: "senior_staff",
  estimatedMinutes: 18,
  isFree: false,
  simulation: runawayCloudSpendDuringHealthyTrafficSimulation,
  library: {
    category: "Infrastructure & Capacity",
    tags: [
      "Cost Optimization",
      "Autoscaling",
      "Capacity Planning",
      "Redundancy",
      "Proactive / No-Outage",
      "Historical Damage",
    ],
    skills: [
      "Diagnosing economic waste on an already-healthy system rather than an availability failure",
      "Distinguishing genuine rightsizing from a redundancy-floor breach that merely looks cheap",
      "Choosing between retuning autoscaler thresholds and raising per-instance throughput via batching",
      "Recognizing that a healthy customer-facing dashboard does not prove a cost-cutting change was safe",
    ],
    shortDescription:
      "The system is fully healthy, but infrastructure spend is far higher than it needs to be — cut cost without quietly breaching the redundancy floor.",
  },
};

export {
  runawayCloudSpendDuringHealthyTrafficSimulation,
  runawayCloudSpendDuringHealthyTrafficCandidateUI,
  RUNAWAY_CLOUD_SPEND_DURING_HEALTHY_TRAFFIC_SCORING,
  AUTOSCALER_TARGET_UTILIZATION_KEY,
  IDLE_CAPACITY_POLICY_KEY,
  MIN_REPLICA_COUNT_KEY,
  REQUEST_BATCHING_MODE_KEY,
  WARM_POOL_SIZE_KEY,
  WORKER_INSTANCE_CLASS_KEY,
};
