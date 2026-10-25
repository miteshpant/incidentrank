import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  BALANCING_STRATEGY_KEY,
  CONNECTION_DRAINING_ENABLED_KEY,
  HEALTH_CHECK_SENSITIVITY_KEY,
  INSTANCE_COUNT_KEY,
  STICKY_SESSIONS_ENABLED_KEY,
  TRAFFIC_WEIGHTS_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per phase6c.md section 14's mandatory
 * post-incident-feedback requirement. Ids are stable and intentionally
 * neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: BALANCING_STRATEGY_KEY,
    valueEquals: "leastConnections",
    whenTriggerEquals: { sessionSurge: true },
    outcome: "beneficial",
    feedback: {
      title: "Stopped routing by session pin",
      explanation:
        "Switching to least-connections routing meant the balancer stopped respecting the sticky hash when deciding where traffic goes, so load converged evenly across all four instances regardless of how many clients had already been pinned to A or B. This addresses the actual routing mechanism that caused the skew, not just its symptoms.",
    },
  },
  {
    id: "acr_2",
    controlKey: BALANCING_STRATEGY_KEY,
    valueEquals: "roundRobin",
    whenTriggerEquals: { sessionSurge: true },
    outcome: "beneficial",
    feedback: {
      title: "Spread traffic evenly by ignoring session pins",
      explanation:
        "Round-robin routing distributes connections without regard to any existing session pin, so Instance A and B's request rate and connection count returned to the same level as C and D. Like switching to least-connections, this fixes the routing mechanism itself rather than only adding capacity around it.",
    },
  },
  {
    id: "acr_3",
    controlKey: STICKY_SESSIONS_ENABLED_KEY,
    valueEquals: false,
    whenTriggerEquals: { sessionSurge: true },
    outcome: "beneficial",
    feedback: {
      title: "Turned off the pinning mechanism itself",
      explanation:
        "Disabling session affinity meant previously pinned clients were redistributed on their next request, independent of whichever balancing strategy was configured. This is a second, independent way to break the pin — it addresses the same root mechanism as changing the balancing strategy.",
    },
  },
  {
    id: "acr_4",
    controlKey: INSTANCE_COUNT_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { sessionSurge: true },
    outcome: "harmful",
    feedback: {
      title: "Added capacity that the skewed routing never reached",
      explanation:
        "The new instances were healthy and idle, but every client already pinned to Instance A kept being routed straight back to it by the unchanged sticky-hash strategy — new capacity only receives brand-new, never-pinned sessions. Instance A's request rate, latency, and connection count stayed effectively as high as the unmitigated baseline while infrastructure cost increased for no relief.",
    },
  },
  {
    id: "acr_5",
    controlKey: TRAFFIC_WEIGHTS_KEY,
    valueEquals: "favorLightInstances",
    whenTriggerEquals: { sessionSurge: true },
    outcome: "harmful",
    feedback: {
      title: "Reweighted traffic that was never going to move",
      explanation:
        "Lowering the traffic weight on Instance A and B only changes which instance a brand-new session lands on. Every client already pinned to those instances by their session cookie ignored the weight change entirely, so A's connection count barely moved and the skew persisted.",
    },
  },
  {
    id: "acr_6",
    controlKey: HEALTH_CHECK_SENSITIVITY_KEY,
    valueEquals: "sensitive",
    whenTriggerEquals: { sessionSurge: true },
    outcome: "neutral",
    feedback: {
      title: "Stopped sending new traffic to a struggling instance, but couldn't touch existing pins",
      explanation:
        "A faster, stricter health check correctly detected Instance A's rising latency and stopped routing brand-new sessions to it, which capped the skew from getting worse. But it has no way to move clients who were already pinned there — their connections and latency stayed elevated, so the incident was contained rather than resolved.",
    },
  },
  {
    id: "acr_7",
    controlKey: CONNECTION_DRAINING_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { sessionSurge: true },
    outcome: "neutral",
    feedback: {
      title: "Forced a reset instead of fixing the mechanism",
      explanation:
        "Draining connections off Instance A and B forced those clients to reconnect and get re-pinned elsewhere, clearing the skew without touching the balancing strategy or session stickiness at all. Every metric recovered, but whatever those clients were doing got forcibly interrupted, and the same sticky-hash mechanism that caused the original skew is still in place — it would skew again once new sessions accumulate.",
    },
  },
];
