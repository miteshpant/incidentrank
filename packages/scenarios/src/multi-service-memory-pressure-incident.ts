import type { ScenarioDefinition } from "./types";
import {
  multiServiceMemoryPressureIncidentSimulation,
  AGGREGATION_CONCURRENCY_KEY,
  API_CONCURRENCY_KEY,
  CACHE_POLICY_KEY,
  DEPENDENCY_A_INSTANCE_COUNT_KEY,
  MAX_RESPONSE_SIZE_KEY,
  PARTIAL_RESPONSE_MODE_KEY,
  RESPONSE_FIELD_SET_MODE_KEY,
  WORKER_COUNT_KEY,
} from "./multi-service-memory-pressure-incident/definition";
import { multiServiceMemoryPressureIncidentCandidateUI } from "./multi-service-memory-pressure-incident/candidate-ui";
import { MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING } from "./multi-service-memory-pressure-incident/scoring";

/**
 * Multi-Service Memory Pressure Incident — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6d.4.md, scenario 77). A payload/
 * data-shape change widened what the Aggregator pulls and holds from
 * Dependency A, B, and C on every request. Dependency A — the component
 * with the least heap headroom in the fleet — is the first to visibly
 * GC-thrash, but it is a misleading symptom: the true root cause is
 * upstream, at the Aggregator, which is now building an oversized
 * per-request aggregation object regardless of which downstream
 * dependency happens to be loudest. Scaling Dependency A gives real,
 * measurable, but temporary relief; left unaddressed, the same
 * amplification eventually pressures Dependency B and C too, and
 * Dependency A's own relief fades once enough time passes. The
 * candidate must diagnose the true root location and choose a fix that
 * actually shrinks what the Aggregator builds, then observe that GC/
 * heap decay takes real elapsed time even after the right fix is
 * applied.
 */
export const multiServiceMemoryPressureIncident: ScenarioDefinition = {
  id: "multi-service-memory-pressure-incident",
  slug: "multi-service-memory-pressure-incident",
  version: 1,
  name: "Multi-Service Memory Pressure Incident",
  description:
    "A recent payload/data-shape change now causes the Aggregator to request and hold the full nested object from Dependency A, Dependency B, and Dependency C on every inbound request. Dependency A — the component with the least heap headroom in the fleet — is the first to visibly GC-thrash, but it is not necessarily where the problem actually lives. Customer requests may return reduced enrichment if necessary, but the service fleet must not enter restart/OOM churn. Any payload truncation may only occur within explicit correctness bounds — a response that is missing fields it is contractually required to carry is a correctness failure, not an acceptable tradeoff. Scaling the one service that happens to be failing loudest is not a durable fix if the actual upstream amplification is never addressed: diagnose which component is genuinely causing the memory pressure, apply a fix that reduces what is actually built and held in memory, and allow real elapsed time for GC and in-flight heap pressure to decay before declaring the incident resolved.",
  difficulty: "senior_staff",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: multiServiceMemoryPressureIncidentSimulation,
  library: {
    category: "Infrastructure & Capacity",
    tags: ["Memory Pressure", "GC", "Aggregation", "Root Cause Analysis", "Recovery Lag", "Pressure Transfer"],
    skills: [
      "Distinguishing a misleading first-visible symptom from the true upstream root cause",
      "Recognizing when scaling a symptom service only buys temporary relief",
      "Choosing between structurally different root-cause fixes under a correctness bound",
      "Reasoning about GC/heap decay as a real, non-instant recovery process",
    ],
    shortDescription:
      "Dependency A is the first service to visibly GC-thrash, but the real memory-pressure source is upstream at the Aggregator — scaling the loud symptom only buys temporary, fading relief.",
  },
};

export {
  multiServiceMemoryPressureIncidentSimulation,
  multiServiceMemoryPressureIncidentCandidateUI,
  MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING,
  RESPONSE_FIELD_SET_MODE_KEY,
  AGGREGATION_CONCURRENCY_KEY,
  MAX_RESPONSE_SIZE_KEY,
  API_CONCURRENCY_KEY,
  DEPENDENCY_A_INSTANCE_COUNT_KEY,
  CACHE_POLICY_KEY,
  WORKER_COUNT_KEY,
  PARTIAL_RESPONSE_MODE_KEY,
};
