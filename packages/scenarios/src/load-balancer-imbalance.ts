import type { ScenarioDefinition } from "./types";
import {
  loadBalancerImbalanceSimulation,
  BALANCING_STRATEGY_KEY,
  CONNECTION_DRAINING_ENABLED_KEY,
  HEALTH_CHECK_SENSITIVITY_KEY,
  INSTANCE_COUNT_KEY,
  STICKY_SESSIONS_ENABLED_KEY,
  TRAFFIC_WEIGHTS_KEY,
} from "./load-balancer-imbalance/definition";
import { loadBalancerImbalanceCandidateUI } from "./load-balancer-imbalance/candidate-ui";
import { LOAD_BALANCER_IMBALANCE_SCORING } from "./load-balancer-imbalance/scoring";

/**
 * Load Balancer Imbalance — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 45). A wave of
 * returning, already-authenticated users lands while the balancer is
 * still using sticky-session hashing: every one of those clients is
 * routed back to whichever instance first served their session, which
 * happens to concentrate heavily onto two of the four instances while
 * the others sit near idle. A stale health check is slow to notice and
 * keeps sending new traffic to the overloaded instances too. The
 * candidate must recognize that the imbalance is a routing/pinning
 * problem, not a capacity problem — adding instances or reweighting
 * traffic only changes where brand-new sessions land, leaving every
 * already-pinned client stuck on the same overloaded instances.
 */
export const loadBalancerImbalance: ScenarioDefinition = {
  id: "load-balancer-imbalance",
  slug: "load-balancer-imbalance",
  version: 1,
  name: "Load Balancer Imbalance",
  description:
    "A wave of returning, authenticated users is landing on the product, and the fleet behind the load balancer is healthy in aggregate — but two of the four instances are visibly carrying far more request volume, connections, and latency than the other two. Every customer-facing request must keep succeeding, and the business cannot tolerate forcibly dropping in-progress sessions as a routine response. Diagnose why load is concentrating on a subset of otherwise-healthy instances and bring the fleet back to a durable, evenly-shared state.",
  difficulty: "senior",
  estimatedMinutes: 16,
  isFree: false,
  structure: "linear",
  simulation: loadBalancerImbalanceSimulation,
  library: {
    category: "API & Traffic",
    tags: ["Load Balancing", "Sticky Sessions", "Health Checks", "Traffic Routing", "Capacity"],
    skills: [
      "Diagnosing session-affinity-driven traffic skew",
      "Distinguishing a routing/pinning problem from a capacity problem",
      "Recognizing when adding instances cannot relieve an existing pin",
      "Evaluating a forced-reset mitigation against a structural routing fix",
    ],
    shortDescription:
      "Two of four healthy instances are carrying most of the load because of sticky-session pinning, and adding more instances alone won't relieve them.",
  },
};

export {
  loadBalancerImbalanceSimulation,
  loadBalancerImbalanceCandidateUI,
  LOAD_BALANCER_IMBALANCE_SCORING,
  BALANCING_STRATEGY_KEY,
  CONNECTION_DRAINING_ENABLED_KEY,
  HEALTH_CHECK_SENSITIVITY_KEY,
  INSTANCE_COUNT_KEY,
  STICKY_SESSIONS_ENABLED_KEY,
  TRAFFIC_WEIGHTS_KEY,
};
