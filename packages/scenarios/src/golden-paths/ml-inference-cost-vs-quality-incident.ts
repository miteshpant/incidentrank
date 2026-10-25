import type { ScenarioGoldenPath } from "./types";
import { ROUTING_POLICY_KEY } from "../ml-inference-cost-vs-quality-incident/definition";
import { SUSTAINED_MISROUTE_MS } from "../ml-inference-cost-vs-quality-incident/timed-events";

/**
 * Extracted from ml-inference-cost-vs-quality-incident.test.ts's "optimal
 * path (quality-tiering) scores near-maximum with full dataIntegrity
 * credit" case (alternate strong path B: explicit quality-tiering
 * policy, immediate — confirmed optimal via
 * evaluateCandidateDeclaredFinish(...).completionTier).
 */
export const mlInferenceCostVsQualityIncidentGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "ml-inference-cost-vs-quality-incident",
  actions: [
    { atMs: SUSTAINED_MISROUTE_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "quality-tiering" },
  ],
  finishAtMs: SUSTAINED_MISROUTE_MS + 35_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
