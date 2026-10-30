import type { ScenarioDefinition } from "./types";
import {
  apiGatewaySaturationSimulation,
  AUTH_MIDDLEWARE_MODE_KEY,
  BACKEND_CAPACITY_KEY,
  CONNECTION_REUSE_ENABLED_KEY,
  GATEWAY_CAPACITY_KEY,
  RATE_LIMIT_AT_GATEWAY_KEY,
  ROUTE_COMPLEXITY_KEY,
} from "./api-gateway-saturation/definition";
import { apiGatewaySaturationCandidateUI } from "./api-gateway-saturation/candidate-ui";
import { API_GATEWAY_SATURATION_SCORING } from "./api-gateway-saturation/scoring";

/**
 * API Gateway Saturation — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 49). A recent gateway
 * deploy regressed two things at once: upstream connections to the
 * service fleet are now opened per request instead of reused, and
 * route-matching walks a newly deployed verbose rule table instead of a
 * precompiled one. As traffic grows, this per-request overhead burns
 * gateway CPU and backs up the gateway's own request queue, while the
 * service fleet behind it — which never does any of that work — stays
 * idle and fast whenever it is actually reached. The candidate must
 * recognize that the gateway itself, not the backend fleet, is the
 * actual constraint: scaling backend capacity adds idle capacity behind
 * an already-idle fleet and does nothing for gateway queue depth,
 * gateway CPU, or customer latency.
 */
export const apiGatewaySaturation: ScenarioDefinition = {
  id: "api-gateway-saturation",
  slug: "api-gateway-saturation",
  version: 1,
  name: "API Gateway Saturation",
  description:
    "A recent API gateway deploy is under growing live traffic, and the gateway's own request queue and CPU are climbing even though the service fleet behind it responds quickly whenever it is actually reached. The gateway enforces authentication and authorization on every request, and that enforcement must remain in place — the business cannot accept trading away request-level identity checks for throughput. Diagnose what is actually consuming the gateway's own capacity as traffic grows, and bring it back to a durable, sustainable state without weakening what the gateway is supposed to protect.",
  difficulty: "senior",
  estimatedMinutes: 16,
  isFree: false,
  structure: "linear",
  simulation: apiGatewaySaturationSimulation,
  library: {
    category: "API & Traffic",
    tags: ["API Gateway", "Connection Reuse", "Routing", "Capacity Planning", "Authentication"],
    skills: [
      "Diagnosing gateway-side bottlenecks distinct from backend capacity",
      "Recognizing when scaling the wrong tier leaves the real constraint untouched",
      "Evaluating security-tradeoff mitigations versus genuine root-cause fixes",
      "Reasoning about per-request overhead sources at an edge/gateway tier",
    ],
    shortDescription:
      "The service fleet stays healthy and idle while the gateway in front of it saturates on its own per-request overhead — and scaling the backend does nothing about it.",
  },
};

export {
  apiGatewaySaturationSimulation,
  apiGatewaySaturationCandidateUI,
  API_GATEWAY_SATURATION_SCORING,
  AUTH_MIDDLEWARE_MODE_KEY,
  BACKEND_CAPACITY_KEY,
  CONNECTION_REUSE_ENABLED_KEY,
  GATEWAY_CAPACITY_KEY,
  RATE_LIMIT_AT_GATEWAY_KEY,
  ROUTE_COMPLEXITY_KEY,
};
