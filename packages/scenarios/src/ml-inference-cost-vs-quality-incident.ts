import type { ScenarioDefinition } from "./types";
import {
  mlInferenceCostVsQualityIncidentSimulation,
  CLASSIFIER_REMEDIATION_KEY,
  CRITICAL_SEGMENT_POLICY_KEY,
  NON_CRITICAL_CACHE_REUSE_KEY,
  ROUTING_POLICY_KEY,
  SMALL_MODEL_QUALITY_FLOOR_KEY,
} from "./ml-inference-cost-vs-quality-incident/definition";
import { mlInferenceCostVsQualityIncidentCandidateUI } from "./ml-inference-cost-vs-quality-incident/candidate-ui";
import { ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING } from "./ml-inference-cost-vs-quality-incident/scoring";

/**
 * ML Inference Cost vs Quality Incident — a paid, Principal-level
 * IncidentRank scenario (Phase 6E.3). An upstream request-complexity
 * classifier has degraded, so the Routing Layer's default policy sends
 * far more traffic to the expensive Large Model than genuinely
 * necessary — inference cost has exploded. This is explicitly a
 * COST-primary scenario, but it stays genuinely about QUALITY
 * TRADEOFFS: the Large Model is real, measurably higher-quality than
 * the Small Model, so blindly routing everything to the Small Model is
 * a real quality regression, not a free win.
 */
export const mlInferenceCostVsQualityIncident: ScenarioDefinition = {
  id: "ml-inference-cost-vs-quality-incident",
  slug: "ml-inference-cost-vs-quality-incident",
  version: 1,
  name: "ML Inference Cost vs Quality Incident",
  description:
    "An upstream request-complexity classifier has degraded, so the Routing Layer's default policy sends far more traffic to the expensive Large Model than genuinely necessary — monthly inference spend has exploded, but routing-layer uptime and inference latency stay fully healthy throughout. This is a COST problem wearing a routing-decision disguise, not an availability problem. Four business invariants govern every decision here: (1) quality-critical request classes must not be silently downgraded to the Small Model without an explicit, bounded policy decision; (2) cost reduction must be achieved by smarter routing, not blanket quality sacrifice; (3) a quality regression affecting real user-facing decisions must be trackable, never silent; (4) model-serving availability is not the primary objective. Decide whether to repair the actual broken classifier (slower, durable) or apply an explicit quality-tiering policy on top of it as an immediate stopgap, whether to pin quality-critical traffic to the Large Model as defense-in-depth, and whether the Small Model's quality tier and response caching are worth their own real, ongoing cost.",
  difficulty: "principal",
  estimatedMinutes: 25,
  isFree: false,
  structure: "linear",
  simulation: mlInferenceCostVsQualityIncidentSimulation,
  library: {
    category: "Data Pipelines",
    tags: [
      "ML Platform",
      "Inference Cost",
      "Decision Quality",
      "Routing Policy",
      "Cost Efficiency",
      "Historical Damage",
    ],
    skills: [
      "Distinguishing a cost/routing-policy problem from a serving-availability problem",
      "Recognizing that cheap and fast serving metrics can mask a silent quality regression",
      "Choosing between repairing a broken classifier and an explicit quality-tiering stopgap policy",
      "Weighing quality-critical traffic protection against the ongoing cost of model tier and routing choices",
    ],
    shortDescription:
      "Inference cost explodes as a degraded classifier misroutes traffic to the expensive model — routing everything to the cheap model looks free but silently sacrifices quality on traffic that must never be downgraded.",
  },
};

export {
  mlInferenceCostVsQualityIncidentSimulation,
  mlInferenceCostVsQualityIncidentCandidateUI,
  ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING,
  CLASSIFIER_REMEDIATION_KEY,
  CRITICAL_SEGMENT_POLICY_KEY,
  NON_CRITICAL_CACHE_REUSE_KEY,
  ROUTING_POLICY_KEY,
  SMALL_MODEL_QUALITY_FLOOR_KEY,
};
