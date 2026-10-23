import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  BACKOFF_KEY,
  CIRCUIT_BREAKER_KEY,
  PAYMENT_INSTANCES_KEY,
  RETRIES_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping. Never used to decide resolution/failure. `feedback`
 * (Phase 6.1) is purely a post-incident educational explanation — never
 * read by simulate()/tick.ts, never affects scoring — revealed only
 * after a signed-in PRACTICE attempt is terminal (see
 * apps/web/src/lib/server/action-feedback.ts). `id` gives each rule a
 * stable identity so a later review pass can be traced back to exactly
 * which rule matched; per the binding leak-boundary decision, never
 * self-descriptive of the authored logic itself.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: RETRIES_KEY,
    valueAtMost: 1,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Reduced retry amplification",
      explanation:
        "Lowering retries reduced pressure on the degraded payment provider, giving it room to recover instead of being hit with repeated retry traffic.",
    },
  },
  {
    id: "acr_2",
    controlKey: RETRIES_KEY,
    valueAtLeast: 5,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Increased retry amplification",
      explanation:
        "Raising retries while the provider was already degraded multiplied the load it received, worsening the exact pressure causing the slowdown.",
    },
  },
  {
    id: "acr_3",
    controlKey: BACKOFF_KEY,
    valueEquals: "exponential",
    whenTriggerEquals: { providerDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Spaced out retry attempts",
      explanation:
        "Exponential backoff spreads retries out over time instead of firing them in a tight burst, reducing the chance of a synchronized retry storm against the degraded provider.",
    },
  },
  {
    id: "acr_4",
    controlKey: CIRCUIT_BREAKER_KEY,
    valueEquals: "on",
    whenTriggerEquals: { providerDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Stopped calls to a failing dependency",
      explanation:
        "Enabling the circuit breaker stopped sending requests to the degraded provider once failures crossed its threshold, protecting the rest of the system from cascading delays.",
    },
  },
  {
    id: "acr_5",
    controlKey: PAYMENT_INSTANCES_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled the wrong tier",
      explanation:
        "The bottleneck was the third-party payment provider's own degraded capacity, not the payment service's instance count — adding instances increased infrastructure cost without relieving the actual constraint.",
    },
  },
];
