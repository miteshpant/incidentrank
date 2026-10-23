import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  A_TO_B_TIMEOUT_MS_KEY,
  API_TO_A_TIMEOUT_MS_KEY,
  B_TO_C_RETRY_COUNT_KEY,
  B_TO_C_TIMEOUT_MS_KEY,
  CIRCUIT_BREAKER_B_TO_C_KEY,
  SERVICE_A_CONCURRENCY_LIMIT_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every rule carries
 * `feedback` per Phase 6B's mandatory post-incident-feedback requirement
 * (docs/implementation_plan/phase6b.md section 13). Ids are stable and
 * intentionally neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: B_TO_C_TIMEOUT_MS_KEY,
    valueAtMost: 800,
    whenTriggerEquals: { serviceCDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Tightened the hop closest to the slow dependency",
      explanation:
        "Shortening Service B's timeout to Service C stops B's own threads from blocking for the full duration of C's slowness. On its own this relieves Service B specifically — but it does not, by itself, re-proportion the timeouts above it, and if retries against C are still elevated the freed-up calls can simply pile pressure onto Service C's own connection capacity instead.",
    },
  },
  {
    id: "acr_2",
    controlKey: A_TO_B_TIMEOUT_MS_KEY,
    valueAtMost: 1_000,
    whenTriggerEquals: { serviceCDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Shortened Service A's own waiting budget",
      explanation:
        "Tightening Service A's timeout to Service B stops A's threads from blocking as long as B's own (now-shorter) timeout to C. This hop only pays off fully once it is proportioned together with the hop below it — a short A-to-B timeout paired with a long, unfixed B-to-C timeout still lets A time out before B has even finished failing fast.",
    },
  },
  {
    id: "acr_3",
    controlKey: API_TO_A_TIMEOUT_MS_KEY,
    valueAtMost: 1_500,
    whenTriggerEquals: { serviceCDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Cut the top timeout in isolation",
      explanation:
        "Shortening the API's own timeout to Service A only pays off once the hops below it are proportioned together with it. On its own, while the hops below it still carry their original long timeouts, the customer sees a failure sooner but Service A, B, and C all keep processing that same already-abandoned request until their own timeouts expire — wasted downstream work and a lower customer success rate than doing nothing at all. The timeout budget has to be re-proportioned from the bottom of the chain up, not trimmed from the top down first.",
    },
  },
  {
    id: "acr_4",
    controlKey: B_TO_C_RETRY_COUNT_KEY,
    valueAtLeast: 3,
    whenTriggerEquals: { serviceCDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Retried a dependency that was uniformly slow, not flaky",
      explanation:
        "Service C's slowness was sustained, not an intermittent blip, so every added retry multiplied the request volume C had to serve without giving it any more capacity to serve it with. Latency and connection pressure increased at every hop above C, including when the B-to-C timeout itself had already been shortened.",
    },
  },
  {
    id: "acr_5",
    controlKey: CIRCUIT_BREAKER_B_TO_C_KEY,
    valueEquals: true,
    whenTriggerEquals: { serviceCDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Fenced off the slow dependency instead of re-tuning timeouts",
      explanation:
        "Tripping the circuit breaker stops Service B from ever calling the degraded Service C again, so no pool upstream of B ever blocks waiting on it. This is a legitimate way to stabilize the rest of the chain quickly, but the capability Service C provides is unavailable to customers for as long as the breaker stays open — it fences off the problem rather than fixing the underlying timeout budget.",
    },
  },
  {
    id: "acr_6",
    controlKey: SERVICE_A_CONCURRENCY_LIMIT_KEY,
    valueAtMost: 80,
    whenTriggerEquals: { serviceCDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Capped Service A's exposure without fixing the slow call",
      explanation:
        "Lowering Service A's own concurrency limit caps how many of its threads can ever be simultaneously blocked on the slow chain below it, protecting A's pool (and the API's pool calling A) independent of any timeout value. But Service B is still blocking on the degraded Service C, so the capped concurrency shows up as outright request rejections rather than resolving the actual slow call.",
    },
  },
];
