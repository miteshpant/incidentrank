import type { ScenarioDefinition } from "./types";
import {
  serviceDiscoveryFailureSimulation,
  DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY,
  ENDPOINT_CACHE_TTL_SECONDS_KEY,
  FALLBACK_ROUTING_KEY,
  HEALTH_CHECK_POLICY_KEY,
  RETRY_COUNT_KEY,
} from "./service-discovery-failure/definition";
import { serviceDiscoveryFailureCandidateUI } from "./service-discovery-failure/candidate-ui";
import { SERVICE_DISCOVERY_FAILURE_SCORING } from "./service-discovery-failure/scoring";

/**
 * Service Discovery Failure — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 34). Service A depends
 * on Service C, which is only reachable through the service registry's
 * current endpoint list. The registry begins handing out a mix of stale
 * and genuinely unhealthy endpoints for Service C. Because discovery
 * keeps returning the SAME bad endpoint list until it is actually
 * refreshed (or bypassed), simply retrying harder amplifies failed
 * connection attempts against instances that were never going to
 * succeed — the durable fixes are refreshing discovery data faster and/
 * or giving Service A a safe fallback path, not retry count alone.
 */
export const serviceDiscoveryFailure: ScenarioDefinition = {
  id: "service-discovery-failure",
  slug: "service-discovery-failure",
  version: 1,
  name: "Service Discovery Failure",
  description:
    "Service A depends on Service C, which it can only reach through endpoints the service registry currently reports as healthy. The registry has begun handing out a mix of stale and genuinely unhealthy endpoints for Service C, and connection failures against it are climbing. Service A's calls to Service C must stay reliable without Service A simply hammering the same failing instances harder. Diagnose why discovery keeps producing bad endpoints and restore a durable, trustworthy path to Service C.",
  difficulty: "senior",
  estimatedMinutes: 15,
  isFree: false,
  simulation: serviceDiscoveryFailureSimulation,
  library: {
    category: "Microservices & Dependencies",
    tags: ["Service Discovery", "Retries", "Fallback Routing", "Health Checks", "Reliability"],
    skills: [
      "Diagnosing stale service-discovery data",
      "Recognizing retry amplification against a fixed bad endpoint set",
      "Balancing discovery refresh speed against fallback routing",
      "Reasoning about health-check eviction policy tradeoffs",
    ],
    shortDescription:
      "The service registry starts handing out stale, unhealthy endpoints — and retrying harder only hits the same dead instances.",
  },
};

export {
  serviceDiscoveryFailureSimulation,
  serviceDiscoveryFailureCandidateUI,
  SERVICE_DISCOVERY_FAILURE_SCORING,
  DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY,
  ENDPOINT_CACHE_TTL_SECONDS_KEY,
  FALLBACK_ROUTING_KEY,
  HEALTH_CHECK_POLICY_KEY,
  RETRY_COUNT_KEY,
};
