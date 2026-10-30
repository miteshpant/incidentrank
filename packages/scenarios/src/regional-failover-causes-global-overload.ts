import type { ScenarioDefinition } from "./types";
import {
  regionalFailoverSimulation,
  CACHE_PROTECTION_KEY,
  DB_CONCURRENCY_KEY,
  FAILOVER_CAP_KEY,
  LOW_PRIORITY_TRAFFIC_KEY,
  REGION_A_RESTORATION_KEY,
  TRAFFIC_RESTORE_PACE_KEY,
} from "./regional-failover-causes-global-overload/definition";
import { regionalFailoverCandidateUI } from "./regional-failover-causes-global-overload/candidate-ui";
import { REGIONAL_FAILOVER_SCORING } from "./regional-failover-causes-global-overload/scoring";

/**
 * Regional Failover Causes Global Overload — a paid IncidentRank
 * scenario (docs/implementation_plan/phase6d.md, scenario 64). Region A
 * has failed, and the global router's automatic failover is shifting
 * Region A's traffic into Region B and Region C. Both regions are
 * healthy and still serving their own normal traffic, but neither has
 * enough reserve capacity to absorb all of Region A's load on top of
 * what they already carry. The candidate must prevent a single-region
 * incident from becoming a global one.
 */
export const regionalFailoverCausesGlobalOverload: ScenarioDefinition = {
  id: "regional-failover-causes-global-overload",
  slug: "regional-failover-causes-global-overload",
  version: 1,
  name: "Regional Failover Causes Global Overload",
  description:
    "Region A has failed and can no longer serve its own traffic. The global router's automatic failover is shifting Region A's traffic into Region B and Region C — both still healthy, both still serving their own normal customers, and NEITHER sized with enough reserve capacity to absorb all of Region A's load on top of that. Business rules for this incident: critical customer operations must remain available, no matter which region ends up serving them; optional, low-priority traffic may be shed rather than forwarded; healthy regions must not be driven into failure by the mitigation itself; and a partial, contained loss of service (Region A staying offline a while longer, or some optional traffic going unserved) is explicitly preferable to letting the incident spread into a global collapse. Decide how much of Region A's traffic the automatic failover should actually be allowed to redirect, what to do with the rest, and how to bring Region A back without re-triggering the same overload in Region B or Region C.",
  difficulty: "principal",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: regionalFailoverSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["Multi-Region", "Failover", "Capacity Planning", "Load Shedding", "Blast Radius"],
    skills: [
      "Recognizing that automatic failover can turn a contained regional incident into a global one",
      "Capping failover to a region's real reserve capacity rather than its availability",
      "Distinguishing business-critical traffic from traffic that may be shed",
      "Sequencing recovery so restoring traffic does not retrigger the original overload",
    ],
    shortDescription:
      "Region A has failed and automatic failover is shifting its traffic into Region B and Region C — which are healthy, but not sized to absorb all of it without becoming a second failure.",
  },
};

export {
  regionalFailoverSimulation,
  regionalFailoverCandidateUI,
  REGIONAL_FAILOVER_SCORING,
  CACHE_PROTECTION_KEY,
  DB_CONCURRENCY_KEY,
  FAILOVER_CAP_KEY,
  LOW_PRIORITY_TRAFFIC_KEY,
  REGION_A_RESTORATION_KEY,
  TRAFFIC_RESTORE_PACE_KEY,
};
