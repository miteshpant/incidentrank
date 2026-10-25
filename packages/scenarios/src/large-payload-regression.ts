import type { ScenarioDefinition } from "./types";
import {
  largePayloadRegressionSimulation,
  RESPONSE_PROJECTION_ENABLED_KEY,
  PAGE_SIZE_KEY,
  COMPRESSION_ENABLED_KEY,
  PAYLOAD_SIZE_LIMIT_KEY,
  API_INSTANCE_COUNT_KEY,
  RESPONSE_CACHE_ENABLED_KEY,
} from "./large-payload-regression/definition";
import { largePayloadRegressionCandidateUI } from "./large-payload-regression/candidate-ui";
import { LARGE_PAYLOAD_REGRESSION_SCORING } from "./large-payload-regression/scoring";

/**
 * Large Payload Regression — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 48). A deploy changed a
 * response shape to return full nested related records instead of
 * lightweight references. Response payload size, API-tier serialization
 * cost, memory pressure, and network bandwidth all climb together, and
 * tail latency follows. The candidate must recognize that the actual
 * cause is the shape of what is being returned per request, not the
 * number of requests or instances available to serve them — scaling the
 * API tier alone spreads the same oversized work across more processes
 * without shrinking it.
 */
export const largePayloadRegression: ScenarioDefinition = {
  id: "large-payload-regression",
  slug: "large-payload-regression",
  version: 1,
  name: "Large Payload Regression",
  description:
    "A deploy shipped a response change that now returns full nested related records instead of lightweight references on a widely used endpoint. Clients still need the data this endpoint provides, and the endpoint cannot simply be turned off — but every response is now carrying far more data than it used to, and callers that depend on specific fields in the response must keep receiving them correctly, not a silently incomplete version of them. Diagnose why response size, memory pressure, and tail latency are climbing together, and bring the API tier back to a durable, sustainable state.",
  difficulty: "senior",
  estimatedMinutes: 15,
  isFree: false,
  simulation: largePayloadRegressionSimulation,
  library: {
    category: "API & Traffic",
    tags: ["Payload Size", "Serialization", "Bandwidth", "Response Shape", "Capacity"],
    skills: [
      "Diagnosing response-shape regressions from capacity symptoms",
      "Distinguishing per-request cost from request volume",
      "Recognizing when horizontal scaling masks rather than fixes a payload problem",
      "Evaluating truncation and compression tradeoffs against a genuine shape fix",
    ],
    shortDescription:
      "A response shape change is returning full nested records instead of references, and scaling the API tier alone cannot shrink what each request now carries.",
  },
};

export {
  largePayloadRegressionSimulation,
  largePayloadRegressionCandidateUI,
  LARGE_PAYLOAD_REGRESSION_SCORING,
  RESPONSE_PROJECTION_ENABLED_KEY,
  PAGE_SIZE_KEY,
  COMPRESSION_ENABLED_KEY,
  PAYLOAD_SIZE_LIMIT_KEY,
  API_INSTANCE_COUNT_KEY,
  RESPONSE_CACHE_ENABLED_KEY,
};
