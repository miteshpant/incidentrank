import type { ScenarioDefinition } from "./types";
import {
  authenticationServiceDegradationSimulation,
  AUTH_SERVICE_INSTANCES_KEY,
  TOKEN_CACHE_TTL_SECONDS_KEY,
  SIGNATURE_VERIFICATION_BYPASS_ENABLED_KEY,
} from "./authentication-service-degradation/definition";
import { authenticationServiceDegradationCandidateUI } from "./authentication-service-degradation/candidate-ui";
import { AUTHENTICATION_SERVICE_DEGRADATION_SCORING } from "./authentication-service-degradation/scoring";

/**
 * Authentication Service Degradation — a paid IncidentRank launch
 * scenario (docs/implementation_plan/phase6.md's suggested launch
 * batch). The shared authentication service is degrading — every other
 * service depends on it to validate requests, so the blast radius is
 * system-wide. The candidate must restore healthy throughput without
 * weakening the system's security posture to do it.
 */
export const authenticationServiceDegradation: ScenarioDefinition = {
  id: "authentication-service-degradation",
  slug: "authentication-service-degradation",
  version: 1,
  name: "Authentication Service Degradation",
  description:
    "The identity database behind your authentication service is under heavy load, and token validation latency is climbing fast. Every service in your system depends on auth to validate incoming requests, so the blast radius here is effectively everything. Diagnose the bottleneck and restore healthy throughput — without compromising what the auth service is actually there to protect.",
  difficulty: "staff",
  estimatedMinutes: 18,
  isFree: false,
  structure: "linear",
  simulation: authenticationServiceDegradationSimulation,
  library: {
    category: "Security & Identity",
    tags: ["Authentication", "Token Validation", "Security", "Availability Tradeoffs", "Capacity Planning"],
    skills: [
      "Diagnosing shared-dependency degradation under load",
      "Capacity scaling for authentication infrastructure",
      "Recognizing security-correctness tradeoffs under pressure",
      "Distinguishing real recovery from metrics that merely look healthy",
    ],
    shortDescription:
      "The shared authentication service is degrading under load, and every dependent service feels the impact.",
  },
};

export {
  authenticationServiceDegradationSimulation,
  authenticationServiceDegradationCandidateUI,
  AUTHENTICATION_SERVICE_DEGRADATION_SCORING,
  AUTH_SERVICE_INSTANCES_KEY,
  TOKEN_CACHE_TTL_SECONDS_KEY,
  SIGNATURE_VERIFICATION_BYPASS_ENABLED_KEY,
};
