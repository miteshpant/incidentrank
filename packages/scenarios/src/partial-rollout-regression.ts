import type { ScenarioDefinition } from "./types";
import {
  partialRolloutRegressionSimulation,
  ROLLOUT_PERCENT_KEY,
  ROLLBACK_TO_OLD_VERSION_KEY,
  TRAFFIC_ROUTING_MODE_KEY,
  REGRESSED_FEATURE_ENABLED_KEY,
  NEW_VERSION_INSTANCE_COUNT_KEY,
  DEPENDENCY_PROTECTION_MODE_KEY,
} from "./partial-rollout-regression/definition";
import { partialRolloutRegressionCandidateUI } from "./partial-rollout-regression/candidate-ui";
import { PARTIAL_ROLLOUT_REGRESSION_SCORING } from "./partial-rollout-regression/scoring";

/**
 * Deployment Regression (slug: partial-rollout-regression) — a paid
 * IncidentRank scenario (docs/implementation_plan/phase6c.md, scenario
 * 60). Deliberately distinct from the existing, simpler
 * deployment-regression.ts (an intermediate, single-version, "roll back
 * quickly" scenario): here, traffic is deliberately split between an old
 * and a newly deployed version at a configurable rollout percentage, and
 * the regression affects only the portion of traffic currently routed to
 * the new version. The candidate must choose among several genuinely
 * defensible containment strategies — a full rollback, reducing the
 * rollout percentage, disabling the one regressed feature via flag, or
 * protecting the dependency the two versions share — rather than
 * treating "roll back immediately" as the only correct move.
 */
export const partialRolloutRegression: ScenarioDefinition = {
  id: "partial-rollout-regression",
  slug: "partial-rollout-regression",
  version: 1,
  name: "Deployment Regression",
  description:
    "A new version was deployed behind a partial rollout and is now showing elevated errors, latency, and memory usage — but only for the portion of traffic currently routed to it; the old version is unaffected so far. The new version also shipped other, non-regressed improvements that matter to the business, and it shares a downstream dependency's connection pool with the old version. Diagnose which part of the new version is actually responsible for the regression and bring customer impact back to a durable, sustainable state without assuming a full rollback is the only acceptable move.",
  difficulty: "senior",
  estimatedMinutes: 18,
  isFree: false,
  simulation: partialRolloutRegressionSimulation,
  library: {
    category: "Deployments & Reliability",
    tags: ["Canary Deployments", "Feature Flags", "Rollback", "Traffic Shifting", "Blast Radius"],
    skills: [
      "Distinguishing rollback from traffic isolation and feature disabling",
      "Recognizing when scaling absorbs a regression's cost without fixing it",
      "Reasoning about shared-dependency blast radius across versions",
      "Evaluating comparably safe alternatives to a full rollback",
    ],
    shortDescription:
      "A partial rollout's new version is regressing for the users routed to it, and a full rollback isn't the only defensible way to contain it.",
  },
};

export {
  partialRolloutRegressionSimulation,
  partialRolloutRegressionCandidateUI,
  PARTIAL_ROLLOUT_REGRESSION_SCORING,
  ROLLOUT_PERCENT_KEY,
  ROLLBACK_TO_OLD_VERSION_KEY,
  TRAFFIC_ROUTING_MODE_KEY,
  REGRESSED_FEATURE_ENABLED_KEY,
  NEW_VERSION_INSTANCE_COUNT_KEY,
  DEPENDENCY_PROTECTION_MODE_KEY,
};
