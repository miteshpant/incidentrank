import type { ScenarioDefinition } from "./types";
import {
  analyticsWarehouseQueryContentionSimulation,
  AD_HOC_ACCESS_POLICY_KEY,
  AD_HOC_QUERY_CAP_KEY,
  ADMISSION_POLICY_KEY,
  DEADLINE_COMMUNICATION_KEY,
  LONG_RUNNING_QUERY_POLICY_KEY,
  WAREHOUSE_CAPACITY_TIER_KEY,
} from "./analytics-warehouse-query-contention/definition";
import { analyticsWarehouseQueryContentionCandidateUI } from "./analytics-warehouse-query-contention/candidate-ui";
import { ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING } from "./analytics-warehouse-query-contention/scoring";

/**
 * Analytics Warehouse Query Contention — a paid, Senior/Staff-level
 * IncidentRank scenario (Phase 6E.3). Ad-hoc analytical workloads (BI
 * Users running exploratory queries, Data Science running heavy/
 * long-running jobs) are contending with a critical Scheduled Reports
 * job that has a real business deadline (e.g. month-end close,
 * SLA-bound external reporting) for the same finite Query Gateway
 * admission slots and shared Warehouse compute. The candidate must
 * decide how to prioritize the critical job over ad-hoc load, whether
 * and how to throttle/queue/stop long-running ad-hoc queries, and how
 * to communicate the tradeoff — not simply add more warehouse capacity
 * or revoke ad-hoc access outright.
 */
export const analyticsWarehouseQueryContention: ScenarioDefinition = {
  id: "analytics-warehouse-query-contention",
  slug: "analytics-warehouse-query-contention",
  version: 1,
  name: "Analytics Warehouse Query Contention",
  description:
    "A critical Scheduled Reports job with a real business deadline (e.g. month-end close, SLA-bound external reporting) is contending with ad-hoc BI/Data Science query load for the same shared Warehouse. Four business invariants govern every decision here: (1) critical scheduled-report jobs with real deadlines must complete within their SLA; (2) ad-hoc query access for BI/Data Science must not be revoked entirely — throttling, queueing, or prioritizing is the correct response, not an overcorrection that cuts off access; (3) killing a long-running Data Science job without warning has a real lost-work cost that must be weighed, never treated as free; (4) warehouse capacity alone is not the primary fix — prioritization and bounded throttling are. Decide how to prioritize the critical job over ad-hoc load, whether and how to throttle or gracefully stop long-running ad-hoc queries, and whether to communicate the tradeoff to the stakeholders it affects rather than silently starving them.",
  difficulty: "senior_staff",
  estimatedMinutes: 18,
  isFree: false,
  simulation: analyticsWarehouseQueryContentionSimulation,
  library: {
    category: "Data Pipelines",
    tags: [
      "Query Contention",
      "Workload Prioritization",
      "Data Warehouse",
      "Stakeholder Tradeoff",
      "Admission Control",
      "Cost Efficiency",
    ],
    skills: [
      "Prioritizing SLA-bound critical workloads over ad-hoc analytical load",
      "Recognizing that warehouse capacity alone does not solve a contention problem",
      "Choosing between priority-based admission and bounded resource-pool isolation",
      "Weighing the real cost of killing long-running jobs against SLA protection",
    ],
    shortDescription:
      "Ad-hoc BI/Data Science queries are starving a critical, deadline-bound scheduled report — scaling the warehouse alone will not fix it.",
  },
};

export {
  analyticsWarehouseQueryContentionSimulation,
  analyticsWarehouseQueryContentionCandidateUI,
  ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING,
  AD_HOC_ACCESS_POLICY_KEY,
  AD_HOC_QUERY_CAP_KEY,
  ADMISSION_POLICY_KEY,
  DEADLINE_COMMUNICATION_KEY,
  LONG_RUNNING_QUERY_POLICY_KEY,
  WAREHOUSE_CAPACITY_TIER_KEY,
};
