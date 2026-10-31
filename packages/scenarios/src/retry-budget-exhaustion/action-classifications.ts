import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CIRCUIT_BREAKER_ENABLED_KEY,
  INSPECT_RETRY_METRICS_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
  PRICING_SERVICE_REPLICA_COUNT_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // The investigation toggle is deliberately neutral — it never mutates
  // health/revenue/cost, so it must never count as a beneficial or
  // harmful configuration change either. It exists purely to drive the
  // authored diagnosisPath value in rules.ts.
  { controlKey: INSPECT_RETRY_METRICS_KEY, valueEquals: true, outcome: "neutral" },

  {
    controlKey: CIRCUIT_BREAKER_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { pricingDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix: enable the circuit breaker",
      explanation:
        "Recommendation Service has no circuit breaker — once Pricing Service starts failing, every retry keeps hammering it anyway. Enabling the breaker stops Recommendation Service from calling into a dependency that's already failing, which is what actually lets Pricing Service recover.",
    },
  },
  {
    controlKey: MAX_RETRY_ATTEMPTS_KEY,
    valueAtMost: 1,
    whenTriggerEquals: { pricingDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix: bound the retry budget",
      explanation:
        "Recommendation Service was retrying every failed call up to 3 times with no budget, multiplying effective load onto Pricing Service. Bounding retries to at most 1 attempt caps that multiplier.",
    },
  },
  {
    controlKey: PRICING_SERVICE_REPLICA_COUNT_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { pricingDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: scaling out Pricing Service",
      explanation:
        "Adding Pricing Service capacity is a reasonable first instinct, but Recommendation Service's unbounded retries are multiplying load faster than added replicas can absorb it. The retry policy itself has to change — more capacity alone never catches up.",
    },
  },
];
