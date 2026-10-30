import type { ScenarioDefinition } from "./types";
import {
  cacheRevalidationHerdSimulation,
  TTL_JITTER_ENABLED_KEY,
  SINGLE_FLIGHT_COALESCING_KEY,
  STALE_WHILE_REVALIDATE_ENABLED_KEY,
  REFRESH_CONCURRENCY_LIMIT_KEY,
  API_INSTANCE_COUNT_KEY,
  REFRESH_RETRY_BACKOFF_KEY,
} from "./cache-revalidation-herd/definition";
import { cacheRevalidationHerdCandidateUI } from "./cache-revalidation-herd/candidate-ui";
import { CACHE_REVALIDATION_HERD_SCORING } from "./cache-revalidation-herd/scoring";

/**
 * Cache Revalidation Herd — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 46, corrected from the
 * original spec's near-duplicate "Thundering Herd" concept). A batch of
 * popular catalog objects was warmed at the same time and shares one
 * flat, unjittered TTL. When that shared expiry is crossed, every
 * instance in the API fleet independently notices the resulting cache
 * miss at nearly the same moment and independently issues its own
 * refresh request to origin — origin request volume spikes far above
 * steady-state, some refreshes fail under the saturation, and those
 * failures retry, compounding the load further. The candidate must
 * recognize that the traffic multiplication happens at the cache layer
 * (many instances all refilling the same keys), not the client layer,
 * and that adding fleet or refresh capacity alone only adds more
 * independent refreshers racing for the same expired keys.
 */
export const cacheRevalidationHerd: ScenarioDefinition = {
  id: "cache-revalidation-herd",
  slug: "cache-revalidation-herd",
  version: 1,
  name: "Cache Revalidation Herd",
  description:
    "A batch of your most-requested catalog objects was warmed into the shared cache at the same time and shares a single, unjittered expiry. That shared TTL has just been crossed: cache misses on these objects are appearing across the entire API fleet almost simultaneously, and origin is seeing a volume of refresh traffic far beyond anything its steady-state load would suggest. These are read-heavy, non-transactional objects — brief staleness after a refresh is tolerable, but origin has a hard operating ceiling and the catalog service behind it also serves other, latency-sensitive traffic you cannot afford to degrade. Diagnose why origin load has spiked so far past normal and bring it back to a state that will hold the next time this batch of objects expires, not just this one.",
  difficulty: "senior",
  estimatedMinutes: 15,
  isFree: false,
  structure: "linear",
  simulation: cacheRevalidationHerdSimulation,
  library: {
    category: "API & Traffic",
    tags: ["Caching", "Cache Invalidation", "Single-Flight", "TTL", "Stale-While-Revalidate", "Retry Storms"],
    skills: [
      "Diagnosing synchronized server-side cache expiry",
      "Request coalescing / single-flight refresh design",
      "TTL jitter as a preventative fix vs. a reactive one",
      "Recognizing when added capacity multiplies duplicate work instead of absorbing it",
    ],
    shortDescription:
      "A batch of popular cache entries shares one unjittered expiry, and every API instance races to refill the same keys from origin at once.",
  },
};

export {
  cacheRevalidationHerdSimulation,
  cacheRevalidationHerdCandidateUI,
  CACHE_REVALIDATION_HERD_SCORING,
  TTL_JITTER_ENABLED_KEY,
  SINGLE_FLIGHT_COALESCING_KEY,
  STALE_WHILE_REVALIDATE_ENABLED_KEY,
  REFRESH_CONCURRENCY_LIMIT_KEY,
  API_INSTANCE_COUNT_KEY,
  REFRESH_RETRY_BACKOFF_KEY,
};
