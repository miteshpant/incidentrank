import type { ScenarioDefinition } from "./types";
import {
  badConfigurationRolloutSimulation,
  API_SERVICE_INSTANCES_KEY,
  CONFIG_CHANGE_FREEZE_ENABLED_KEY,
  CONFIG_REVERT_ENABLED_KEY,
} from "./bad-configuration-rollout/definition";
import { badConfigurationRolloutCandidateUI } from "./bad-configuration-rollout/candidate-ui";
import { BAD_CONFIGURATION_ROLLOUT_SCORING } from "./bad-configuration-rollout/scoring";

/**
 * Bad Configuration Rollout — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). A
 * configuration change — not a code deploy — just pushed a request-rate
 * limit far below normal traffic levels, so the API service starts
 * rejecting a large share of legitimate requests immediately. Scaling up
 * API service instances looks responsive but does nothing, since the
 * rejections are coming from the rate-limit configuration itself, not
 * from resource exhaustion. The candidate must recognize the config
 * correlation and revert to the last-known-good configuration quickly,
 * rather than scaling capacity or merely freezing further config changes
 * without undoing the one that broke things.
 */
export const badConfigurationRollout: ScenarioDefinition = {
  id: "bad-configuration-rollout",
  slug: "bad-configuration-rollout",
  version: 1,
  name: "Bad Configuration Rollout",
  description:
    "A configuration change just went out that set the API service's request-rate limit far below normal traffic levels. Legitimate requests are being rejected immediately, and the rejection rate is climbing fast. Diagnose whether this is a capacity problem or a configuration problem, and restore healthy traffic before the impact compounds.",
  difficulty: "intermediate",
  estimatedMinutes: 10,
  isFree: false,
  simulation: badConfigurationRolloutSimulation,
  library: {
    category: "Deployments & Reliability",
    tags: ["Configuration Management", "Feature Flags", "Rollback", "Change Management"],
    skills: [
      "Distinguishing configuration issues from capacity issues",
      "Config revert and rollback decision making",
      "Change freeze tradeoffs during active incidents",
      "Recognizing plausible-but-harmful mitigations",
    ],
    shortDescription:
      "A bad configuration push sets the API rate limit far below normal traffic, rejecting legitimate requests immediately.",
  },
};

export {
  badConfigurationRolloutSimulation,
  badConfigurationRolloutCandidateUI,
  BAD_CONFIGURATION_ROLLOUT_SCORING,
  API_SERVICE_INSTANCES_KEY,
  CONFIG_CHANGE_FREEZE_ENABLED_KEY,
  CONFIG_REVERT_ENABLED_KEY,
};
