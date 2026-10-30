import type { ScenarioDefinition } from "./types";
import {
  cacheInvalidationAcrossRegionsSimulation,
  EU_INVALIDATION_REPLAY_MODE_KEY,
  GLOBAL_CACHE_BYPASS_KEY,
  ORIGIN_CONCURRENCY_KEY,
  REFRESH_CONCURRENCY_KEY,
  REGIONAL_INVALIDATOR_ISOLATION_KEY,
  STALE_WHILE_REVALIDATE_KEY,
  US_CACHE_MODE_KEY,
  US_TTL_SECONDS_KEY,
} from "./cache-invalidation-across-regions/definition";
import { cacheInvalidationAcrossRegionsCandidateUI } from "./cache-invalidation-across-regions/candidate-ui";
import { CACHE_INVALIDATION_ACROSS_REGIONS_SCORING } from "./cache-invalidation-across-regions/scoring";

/**
 * Cache Invalidation Across Regions — a paid, Senior Staff-level
 * IncidentRank scenario (docs/implementation_plan/phase6d3.md, scenario
 * 72). The shared Invalidation Stream / Publisher that keeps US Cache,
 * EU Cache, and APAC Cache consistent with Origin Store is delivering
 * asymmetrically: US's invalidations are delayed (US keeps serving an
 * old cached value past the freshness bound while waiting for a
 * delayed invalidation to arrive), EU's invalidations are being
 * duplicated/replayed (EU's consumer re-evicts and re-fetches already-
 * healthy keys over and over), and APAC remains genuinely healthy
 * throughout. Global API itself never degrades — this is not a single
 * global outage, and no single global lever correctly treats a
 * regionally-asymmetric problem. Five business invariants govern every
 * decision here: (1) critical writes must become globally visible
 * within the authored freshness bound — a stale read past that bound
 * in any region is a real, counted violation, not a cosmetic one; (2)
 * a bounded stale-read window may be acceptable for selected data
 * classes — staleness is not automatically forbidden, only unbounded
 * staleness is; (3) Origin Store's capacity must be protected — no fix
 * may trade regional freshness for an Origin overload risk; (4)
 * regional isolation is preferable to global origin collapse — contain
 * a broken region's blast radius rather than disabling caching
 * everywhere or letting one region's problem degrade another region's
 * invalidation delivery; (5) invalidation replay must not create
 * unbounded revalidation pressure — repeatedly re-processing duplicate
 * invalidation messages for keys that are already healthy is itself a
 * violation, not a safety margin. Decide how to restore US's freshness
 * and stop EU's storm without disabling caching globally (which would
 * overload Origin far worse than either problem alone), how to isolate
 * the broken invalidator path so it cannot degrade the healthy
 * regions, and how much elapsed recovery time a delayed invalidation
 * stream and a thrashed regional cache genuinely need before handing
 * the incident back — bounded staleness in one region while the rest
 * recovers is a legitimate, defensible outcome, not a failure to
 * eliminate at any cost.
 */
export const cacheInvalidationAcrossRegions: ScenarioDefinition = {
  id: "cache-invalidation-across-regions",
  slug: "cache-invalidation-across-regions",
  version: 1,
  name: "Cache Invalidation Across Regions",
  description:
    "The shared Invalidation Stream / Publisher that keeps US Cache, EU Cache, and APAC Cache consistent with Origin Store is delivering asymmetrically: US's invalidations are delayed (US keeps serving an old cached value past the freshness bound while waiting for a delayed invalidation to arrive), EU's invalidations are being duplicated/replayed (EU's consumer re-evicts and re-fetches already-healthy keys over and over), and APAC remains genuinely healthy throughout. Global API itself never degrades — this is not a single global outage, and no single global lever correctly treats a regionally-asymmetric problem. Five business invariants govern every decision here: (1) critical writes must become globally visible within the authored freshness bound — a stale read past that bound in any region is a real, counted violation; (2) a bounded stale-read window may be acceptable for selected data classes — staleness is not automatically forbidden, only unbounded staleness is; (3) Origin Store's capacity must be protected — no fix may trade regional freshness for an Origin overload risk; (4) regional isolation is preferable to global origin collapse — contain a broken region's blast radius rather than disabling caching everywhere or letting one region's problem degrade another region's invalidation delivery; (5) invalidation replay must not create unbounded revalidation pressure — repeatedly re-processing duplicate invalidation messages for keys that are already healthy is itself a violation, not a safety margin. Decide how to restore US's freshness and stop EU's storm without disabling caching globally, how to isolate the broken invalidator path so it cannot degrade the healthy regions, and how much elapsed recovery time a delayed invalidation stream and a thrashed regional cache genuinely need before handing the incident back — bounded staleness in one region while the rest recovers is a legitimate, defensible outcome, not a failure to eliminate at any cost.",
  difficulty: "senior_staff",
  estimatedMinutes: 25,
  isFree: false,
  structure: "linear",
  simulation: cacheInvalidationAcrossRegionsSimulation,
  library: {
    category: "Caching",
    tags: [
      "Multi-Region",
      "Cache Invalidation",
      "Origin Protection",
      "Bounded Staleness",
      "Blast-Radius Isolation",
      "Recovery Lag",
    ],
    skills: [
      "Diagnosing per-region failure asymmetry instead of applying one global fix",
      "Weighing bounded staleness against unbounded origin risk",
      "Isolating a broken region's blast radius from healthy regions",
      "Recognizing that fixing an invalidation path does not instantly repopulate caches",
    ],
    shortDescription:
      "The same invalidation stream is delayed in one region, duplicated in another, and healthy in a third — a global cache-disable fix overloads shared Origin far worse than a differentiated per-region response.",
  },
};

export {
  cacheInvalidationAcrossRegionsSimulation,
  cacheInvalidationAcrossRegionsCandidateUI,
  CACHE_INVALIDATION_ACROSS_REGIONS_SCORING,
  EU_INVALIDATION_REPLAY_MODE_KEY,
  GLOBAL_CACHE_BYPASS_KEY,
  ORIGIN_CONCURRENCY_KEY,
  REFRESH_CONCURRENCY_KEY,
  REGIONAL_INVALIDATOR_ISOLATION_KEY,
  STALE_WHILE_REVALIDATE_KEY,
  US_CACHE_MODE_KEY,
  US_TTL_SECONDS_KEY,
};
