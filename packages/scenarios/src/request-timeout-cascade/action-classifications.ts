import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  A_TO_B_TIMEOUT_MS_KEY,
  B_TO_DEPENDENCY_TIMEOUT_MS_KEY,
  CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY,
  GATEWAY_RETRY_COUNT_KEY,
  GATEWAY_TO_A_TIMEOUT_MS_KEY,
  REQUEST_CANCELLATION_ENABLED_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every rule carries
 * `feedback` per the mandatory post-incident-feedback requirement. Ids
 * are stable and intentionally neutral, never self-descriptive of the
 * authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: REQUEST_CANCELLATION_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { dependencyBlip: true },
    outcome: "beneficial",
    feedback: {
      title: "Stopped abandoned work from piling up",
      explanation:
        "Enabling cancellation propagation meant a caller giving up on a call actually freed the thread/connection it was holding downstream, instead of letting an abandoned request run to completion for nobody. This alone did not fix how long each individual request took — that depends on the timeout budget itself — but it stopped retries from quietly multiplying in-flight work underneath whatever budget was in place.",
    },
  },
  {
    id: "acr_2",
    controlKey: B_TO_DEPENDENCY_TIMEOUT_MS_KEY,
    valueAtMost: 900,
    whenTriggerEquals: { dependencyBlip: true },
    outcome: "beneficial",
    feedback: {
      title: "Tightened the hop closest to the blip",
      explanation:
        "Shortening the Service B to Dependency timeout let Service B fail fast against the slower call instead of blocking for the Dependency's full response time. On its own this only relieves Service B's own pool — the hops above it still need their own budgets re-proportioned, and abandoned retries still need somewhere to go, for the fix to be complete.",
    },
  },
  {
    id: "acr_3",
    controlKey: GATEWAY_TO_A_TIMEOUT_MS_KEY,
    valueAtMost: 1_800,
    whenTriggerEquals: { dependencyBlip: true },
    outcome: "beneficial",
    feedback: {
      title: "Tightened the outermost budget",
      explanation:
        "Shortening the Gateway's own timeout keeps it from waiting far longer than the chain beneath it actually needs. This only pays off once the hops below it are proportioned consistently too — an outer timeout shortened in isolation, with the inner hops still long, mostly just changes where in the chain the customer-visible failure shows up.",
    },
  },
  {
    id: "acr_4",
    controlKey: GATEWAY_RETRY_COUNT_KEY,
    valueAtLeast: 4,
    whenTriggerEquals: { dependencyBlip: true },
    outcome: "harmful",
    feedback: {
      title: "Retried a slow chain into a multiplied one",
      explanation:
        "Raising Gateway-level retries meant every timeout started a brand-new call chain through Service A, Service B, and the Dependency on top of whichever earlier chains were still running (and, without cancellation, never actually went away). In-flight requests and connection utilization climbed sharply faster than doing nothing, because the chain was slow, not actually failing — retrying it just multiplied the work in flight.",
    },
  },
  {
    id: "acr_5",
    controlKey: B_TO_DEPENDENCY_TIMEOUT_MS_KEY,
    valueAtMost: 900,
    whenTriggerEquals: { dependencyBlip: true },
    outcome: "neutral",
    feedback: {
      title: "Fixed the closest hop, left the rest oversized",
      explanation:
        "Tightening only the Service B to Dependency timeout, while the Gateway and Service A kept their original long budgets, genuinely relieved Service B's own pool. But Service A and the Gateway were still sized around Service B taking far longer than it now actually needs — their own pools stayed saturated purely from their own oversized timeout budgets, and abandoned retries from those still-long outer hops kept accumulating underneath.",
    },
  },
  {
    id: "acr_6",
    controlKey: CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY,
    valueEquals: true,
    whenTriggerEquals: { dependencyBlip: true },
    outcome: "neutral",
    feedback: {
      title: "Fenced the Dependency off instead of fixing the budget",
      explanation:
        "Tripping the circuit breaker stopped Service B from calling the Dependency at all, so every pool upstream recovered immediately. But the capability the Dependency provides was unavailable for as long as the breaker stayed open — a real, bounded tradeoff, and a legitimate way to stabilize the platform, but not the same as re-proportioning the timeout budget.",
    },
  },
  {
    id: "acr_7",
    controlKey: A_TO_B_TIMEOUT_MS_KEY,
    valueAtLeast: 7_000,
    whenTriggerEquals: { dependencyBlip: true },
    outcome: "neutral",
    feedback: {
      title: "Left the middle hop's budget untouched",
      explanation:
        "Leaving Service A's timeout into Service B at its original long value, even after the inner hop was tightened, meant Service A's own pool stayed sized around a call to B that no longer needs to take that long. The middle of the chain is just as much a part of the budget as either end of it.",
    },
  },
];
