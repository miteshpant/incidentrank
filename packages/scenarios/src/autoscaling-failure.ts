import type { ScenarioDefinition } from "./types";
import {
  autoscalingFailureSimulation,
  MAX_INSTANCE_COUNT_KEY,
  SCALE_UP_COOLDOWN_SECONDS_KEY,
  SCALE_UP_THRESHOLD_PERCENT_KEY,
} from "./autoscaling-failure/definition";
import { autoscalingFailureCandidateUI } from "./autoscaling-failure/candidate-ui";
import { AUTOSCALING_FAILURE_SCORING } from "./autoscaling-failure/scoring";

/**
 * Autoscaling Failure — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). Traffic
 * has spiked, but the autoscaler can't add enough capacity to keep up —
 * either because its instance cap is left over from a previous
 * cost-cutting change, or because its scale-up threshold/cooldown are
 * tuned too conservatively to react in time. The candidate must diagnose
 * WHICH lever is actually the binding constraint: tuning reaction speed
 * does nothing if the instance cap itself is what's preventing the
 * autoscaler from adding capacity.
 */
export const autoscalingFailure: ScenarioDefinition = {
  id: "autoscaling-failure",
  slug: "autoscaling-failure",
  version: 1,
  name: "Autoscaling Failure",
  description:
    "Inbound traffic has spiked sharply and continues to climb, but your service isn't adding capacity fast enough to keep up. CPU utilization is pinned near its ceiling, the request queue is growing, and errors are starting to appear. The autoscaler may be reacting too slowly, or it may simply be unable to scale any further — diagnose which it is before the backend falls over.",
  difficulty: "senior",
  estimatedMinutes: 14,
  isFree: false,
  structure: "linear",
  simulation: autoscalingFailureSimulation,
  library: {
    category: "Infrastructure & Capacity",
    tags: ["Autoscaling", "Capacity Planning", "Traffic Spikes", "Cost Tradeoffs"],
    skills: [
      "Diagnosing autoscaling capacity constraints",
      "Distinguishing reaction-speed tuning from hard capacity limits",
      "Capacity vs. cost tradeoffs",
      "Recognizing plausible-but-ineffective mitigations",
    ],
    shortDescription:
      "A traffic spike overwhelms available capacity while the autoscaler either reacts too slowly or is structurally capped.",
  },
};

export {
  autoscalingFailureSimulation,
  autoscalingFailureCandidateUI,
  AUTOSCALING_FAILURE_SCORING,
  MAX_INSTANCE_COUNT_KEY,
  SCALE_UP_COOLDOWN_SECONDS_KEY,
  SCALE_UP_THRESHOLD_PERCENT_KEY,
};
