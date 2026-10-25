import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CANCELLATION_PROPAGATION_KEY,
  CIRCUIT_BREAKER_KEY,
  GATEWAY_RETRIES_KEY,
  SERVICE_A_RETRIES_KEY,
  SERVICE_B_RETRIES_KEY,
  SERVICE_C_CONCURRENCY_KEY,
  SERVICE_C_RETRIES_KEY,
  SERVICE_C_TIMEOUT_SECONDS_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per phase6dsupport.md section 17. Ids are
 * stable and intentionally neutral, never self-descriptive of the
 * authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: GATEWAY_RETRIES_KEY,
    valueEquals: 0,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Stood the Gateway down as a retry owner",
      explanation:
        "Setting Gateway retries to zero removes one of the four layers independently re-issuing the same customer request. On its own this is a real, visible reduction in effective provider volume — but Service A, Service B, and Service C are still each retrying independently, so amplification persists through them rather than being eliminated.",
    },
  },
  {
    id: "acr_2",
    controlKey: SERVICE_A_RETRIES_KEY,
    valueEquals: 0,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Stood Service A down as a retry owner",
      explanation:
        "Setting Service A retries to zero removes another of the four independently-configured retry layers. Amplification from any still-active upstream or downstream layer continues to compound on whatever survives this one.",
    },
  },
  {
    id: "acr_3",
    controlKey: SERVICE_B_RETRIES_KEY,
    valueEquals: 0,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Stood Service B down as a retry owner",
      explanation:
        "Setting Service B retries to zero removes another independently-configured retry layer from the chain. The remaining active layers still multiply whatever volume passes through them.",
    },
  },
  {
    id: "acr_4",
    controlKey: CIRCUIT_BREAKER_KEY,
    valueEquals: "on",
    whenTriggerEquals: { providerDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Gave Service C a breaker at the provider boundary",
      explanation:
        "Turning on Service C's circuit breaker caps how much traffic actually reaches the degraded External Provider once it trips, protecting the provider's own connection pool directly. It does nothing by itself about retry volume generated upstream of Service C, and does not drain in-flight work already committed to running.",
    },
  },
  {
    id: "acr_5",
    controlKey: CANCELLATION_PROPAGATION_KEY,
    valueEquals: "on",
    whenTriggerEquals: { providerDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Propagated cancellation down the chain",
      explanation:
        "Turning on cancellation propagation means an abandoned or failed-fast request's downstream work is told to stop rather than running to completion for no one. Zombie request count dropped sharply as a direct result — this complements retry-ownership consolidation but does not reduce amplification by itself.",
    },
  },
  {
    id: "acr_6",
    controlKey: SERVICE_C_TIMEOUT_SECONDS_KEY,
    valueAtMost: 1,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Tightened the provider-facing timeout before choosing a retry owner",
      explanation:
        "Lowering Service C's timeout to 1 second while all four layers were still independently retrying made requests fail faster locally, but every one of those faster failures still gets retried by whichever upstream layer owns that attempt — effective amplification stayed unchanged and in-flight/zombie pressure increased, because tuning timeout never touches how many layers are multiplying the same request.",
    },
  },
  {
    id: "acr_7",
    controlKey: SERVICE_C_RETRIES_KEY,
    valueAtLeast: 3,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Raised retries at the layer closest to an already-struggling provider",
      explanation:
        "Increasing Service C's own retry count while the provider is degraded adds direct retry pressure at the layer immediately adjacent to it, on top of whatever upstream layers are already multiplying. This is the opposite of consolidating retry ownership to a single bounded layer.",
    },
  },
  {
    id: "acr_8",
    controlKey: SERVICE_C_CONCURRENCY_KEY,
    valueAtLeast: 400,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Widened the pipe feeding an already-amplified request volume",
      explanation:
        "Raising Service C's concurrency ceiling let more of the already-amplified retry volume reach the provider at once, rather than reducing how much volume is being generated in the first place. In-flight request pressure increased as a direct consequence.",
    },
  },
];
