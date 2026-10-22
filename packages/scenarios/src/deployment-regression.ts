import type { ScenarioDefinition } from "./types";
import {
  deploymentRegressionSimulation,
  ROLLBACK_TO_PREVIOUS_VERSION_KEY,
  CANARY_TRAFFIC_PERCENT_KEY,
  DEBUG_LOGGING_ENABLED_KEY,
} from "./deployment-regression/definition";
import { deploymentRegressionCandidateUI } from "./deployment-regression/candidate-ui";
import { DEPLOYMENT_REGRESSION_SCORING } from "./deployment-regression/scoring";

/**
 * Deployment Regression — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). A new
 * deploy has shipped a subtle regression that wasn't caught in testing:
 * error rates and latency are climbing on affected endpoints shortly
 * after rollout. The candidate must recognize the deploy correlation and
 * roll back quickly rather than "forward-fixing" or debugging live while
 * the regression keeps hurting users.
 */
export const deploymentRegression: ScenarioDefinition = {
  id: "deployment-regression",
  slug: "deployment-regression",
  version: 1,
  name: "Deployment Regression",
  description:
    "A deploy that went live a few minutes ago has introduced a subtle regression: error rates and latency are climbing on affected endpoints, and memory usage is trending upward. Diagnose whether this is deploy-correlated and restore healthy service before the impact compounds.",
  difficulty: "intermediate",
  estimatedMinutes: 12,
  isFree: false,
  simulation: deploymentRegressionSimulation,
  library: {
    category: "Deployments & Reliability",
    tags: ["Rollback", "Canary Deployments", "Regression", "Incident Response"],
    skills: [
      "Recognizing deploy-correlated regressions",
      "Rollback vs. forward-fix decision making",
      "Canary traffic management",
      "Recognizing plausible-but-harmful mitigations",
    ],
    shortDescription:
      "A new deploy ships a subtle regression; error rates and latency climb on affected endpoints shortly after rollout.",
  },
};

export {
  deploymentRegressionSimulation,
  deploymentRegressionCandidateUI,
  DEPLOYMENT_REGRESSION_SCORING,
  ROLLBACK_TO_PREVIOUS_VERSION_KEY,
  CANARY_TRAFFIC_PERCENT_KEY,
  DEBUG_LOGGING_ENABLED_KEY,
};
