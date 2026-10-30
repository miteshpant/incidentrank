import type { ScenarioDefinition } from "./types";
import {
  ADMISSION_CONTROL_KEY,
  API_CONCURRENCY_KEY,
  ASYNC_DEFERRAL_KEY,
  CACHE_STRATEGY_KEY,
  capacityExhaustionDuringPeakEventSimulation,
  DB_CONNECTION_BUDGET_KEY,
  LOAD_SHEDDING_KEY,
  OPTIONAL_FEATURE_DISABLE_KEY,
  REGIONAL_ROUTING_KEY,
  TRAFFIC_CLASS_PRIORITY_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./capacity-exhaustion-during-peak-event/definition";
import { capacityExhaustionDuringPeakEventCandidateUI } from "./capacity-exhaustion-during-peak-event/candidate-ui";
import { CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING } from "./capacity-exhaustion-during-peak-event/scoring";

/**
 * Capacity Exhaustion During Peak Event — a paid, Principal-level,
 * flagship IncidentRank scenario (docs/implementation_plan/phase6d.4.md,
 * scenario 79). A scheduled peak sales event drives a sharp, legitimate,
 * fully-expected rise in traffic. Edge/API pressure rises, cache
 * effectiveness falls as the key-access pattern widens, the shared
 * database approaches real saturation risk, the async backlog grows,
 * and optional features degrade — a full-stack cascade across Edge/CDN,
 * API Fleet, Cache, Database, and Async Queue/Workers, plus two
 * business-criticality-tiered dependents (Payment/Transaction Service
 * on the critical path, Search/Personalization Service on the optional
 * path).
 */
export const capacityExhaustionDuringPeakEvent: ScenarioDefinition = {
  id: "capacity-exhaustion-during-peak-event",
  slug: "capacity-exhaustion-during-peak-event",
  version: 1,
  name: "Capacity Exhaustion During Peak Event",
  description:
    "A scheduled peak sales event has driven a sharp, legitimate, fully-expected rise in traffic — this is demand you want, not an attack or an anomaly, and it cannot simply be blocked or rate-limited away wholesale. As pressure builds, cache effectiveness falls, the shared database approaches real saturation risk, the async backlog grows, and optional features degrade. Six business invariants govern every decision here: (1) critical purchase/transaction traffic must remain available as long as safely possible; (2) optional personalization/search/enrichment may be degraded or disabled; (3) the database must not be pushed into collapse; (4) accepted async work must remain durable; (5) traffic shedding must be policy-based, never arbitrary or random; (6) a bounded queue backlog is acceptable if it is demonstrably draining. The central judgment this scenario forces: what do you intentionally sacrifice to protect the business-critical path? Maximizing total throughput or aggregate success rate across every feature, rather than deliberately protecting checkout at the cost of optional features, is the wrong objective and must score worse, not better. Decide which traffic to prioritize, how to shed the rest responsibly, how to keep the database out of collapse, how to keep the async backlog bounded and draining rather than ignored, and whether to chase full recovery or hand back a genuinely safe degraded state.",
  difficulty: "principal",
  estimatedMinutes: 30,
  isFree: false,
  structure: "linear",
  simulation: capacityExhaustionDuringPeakEventSimulation,
  library: {
    category: "Infrastructure & Capacity",
    tags: [
      "Peak Load",
      "Capacity Planning",
      "Traffic Triage",
      "Pressure Transfer",
      "Business-Critical Prioritization",
      "Degraded Mode",
    ],
    skills: [
      "Deliberately sacrificing optional capacity to protect a business-critical path",
      "Recognizing that raising a concurrency ceiling can transfer pressure downstream rather than remove it",
      "Distinguishing policy-based traffic shedding from blunt, proportional shedding",
      "Reading independent recovery-lag signals (cache warmup vs. DB connection pool recovery) rather than assuming one fix heals everything",
    ],
    shortDescription:
      "Legitimate peak-event traffic cascades from Edge/CDN through Cache, Database, and the Async Queue — protect checkout, sacrifice optional features deliberately, and never push the database into collapse.",
  },
};

export {
  capacityExhaustionDuringPeakEventSimulation,
  capacityExhaustionDuringPeakEventCandidateUI,
  CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING,
  ADMISSION_CONTROL_KEY,
  API_CONCURRENCY_KEY,
  ASYNC_DEFERRAL_KEY,
  CACHE_STRATEGY_KEY,
  DB_CONNECTION_BUDGET_KEY,
  LOAD_SHEDDING_KEY,
  OPTIONAL_FEATURE_DISABLE_KEY,
  REGIONAL_ROUTING_KEY,
  TRAFFIC_CLASS_PRIORITY_KEY,
  WORKER_CONCURRENCY_KEY,
};
