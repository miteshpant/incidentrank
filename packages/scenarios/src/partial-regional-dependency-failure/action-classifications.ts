import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  APAC_ROUTING_MODE_KEY,
  DEPENDENCY_FALLBACK_ENABLED_KEY,
  EU_ROUTING_MODE_KEY,
  GLOBAL_CIRCUIT_BREAKER_KEY,
  TIMEOUT_POLICY_MS_KEY,
  US_ROUTING_MODE_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per phase6c.md section 14. Ids are stable and
 * intentionally neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: EU_ROUTING_MODE_KEY,
    valueEquals: "isolate",
    whenTriggerEquals: { regionalDivergence: true },
    outcome: "beneficial",
    feedback: {
      title: "Isolated the region that was actually slow",
      explanation:
        "EU's calls to the shared dependency were genuinely running slow. Routing EU onto its fallback path relieved that region's latency without touching US or APAC's own routing — a targeted response scoped to the region that actually needed it.",
    },
  },
  {
    id: "acr_2",
    controlKey: APAC_ROUTING_MODE_KEY,
    valueEquals: "isolate",
    whenTriggerEquals: { regionalDivergence: true },
    outcome: "beneficial",
    feedback: {
      title: "Isolated the region that was actually failing",
      explanation:
        "APAC's calls to the shared dependency were intermittently failing outright. Routing APAC onto its fallback path stopped those failures without affecting US's or EU's own routing — a targeted response scoped to the region that actually needed it.",
    },
  },
  {
    id: "acr_3",
    controlKey: US_ROUTING_MODE_KEY,
    valueEquals: "isolate",
    whenTriggerEquals: { regionalDivergence: true },
    outcome: "harmful",
    feedback: {
      title: "Isolated a region that was never broken",
      explanation:
        "US's calls to the shared dependency were succeeding the entire time. Routing US onto its fallback path traded away live, fully-working service for a degraded fallback response with no corresponding benefit — there was no live failure in US to protect against.",
    },
  },
  {
    id: "acr_4",
    controlKey: GLOBAL_CIRCUIT_BREAKER_KEY,
    valueEquals: true,
    whenTriggerEquals: { regionalDivergence: true },
    outcome: "harmful",
    feedback: {
      title: "Applied a uniform fix to a non-uniform problem",
      explanation:
        "Tripping the global circuit breaker stopped every region's live dependency calls at once. That relieved EU's slowness and APAC's failures, but it also forced US — whose calls were succeeding the whole time — onto the same degraded fallback path. The blended outcome ends up measurably worse than isolating only the regions that were actually unhealthy, because a healthy region's working traffic was sacrificed for no reason.",
    },
  },
  {
    id: "acr_5",
    controlKey: DEPENDENCY_FALLBACK_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { regionalDivergence: true },
    outcome: "neutral",
    feedback: {
      title: "Prepared a landing place for isolated traffic",
      explanation:
        "Enabling the fallback path gives any region routed to \"isolate\" (or caught by the global breaker) a degraded-but-available response instead of an outright failure. On its own this changes nothing — it only matters once a region is actually isolated — but isolating a region without it leaves that region's traffic with nowhere safe to land.",
    },
  },
  {
    id: "acr_6",
    controlKey: TIMEOUT_POLICY_MS_KEY,
    valueAtMost: 600,
    whenTriggerEquals: { regionalDivergence: true },
    outcome: "harmful",
    feedback: {
      title: "Tightened a global knob for a regional, non-latency problem",
      explanation:
        "The timeout policy applies the same budget to every region's calls. A tight budget can cap how long EU's slow calls hang, but it does nothing for APAC's problem — those calls fail outright rather than running long, so a shorter timeout never catches them — and it also clips some of US's normal calls that would otherwise have succeeded, since US had no latency problem to budget against in the first place.",
    },
  },
];
