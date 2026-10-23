import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { rebalanceRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  DEPLOY_STRATEGY_KEY,
  SESSION_TIMEOUT_MS_KEY,
  STATIC_GROUP_MEMBERSHIP_ENABLED_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const consumerRebalanceStormSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "groupStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The consumer group has entered a critical rebalance-storm state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The consumer group has stabilized.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "rebalanceCount",
      trackPeak: true,
      threshold: {
        value: 20,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Rebalance count has crossed 20 during this incident.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Rebalance count has stabilized below 20.",
      },
    },
    {
      key: "consumerLagMessages",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: rebalanceRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // Phase 6.1: candidate-declared completion WITH an acceptable tier.
  // Per the state audit, blue-green-deploy-strategy-only is a genuine,
  // bounded, non-trap tradeoff (see acceptableCondition's doc comment in
  // revenue-and-cost.ts) — this scenario's candidate-declared value is
  // exactly the two-tier judgment Phase 6.1's acceptableCondition model
  // exists for: the system can be operationally healthy while accepting
  // a known, named risk, not merely "fixed or not fixed."
  completion: { mode: "candidate_declared", acceptableCondition },
};
