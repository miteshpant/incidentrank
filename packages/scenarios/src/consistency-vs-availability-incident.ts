import type { ScenarioDefinition } from "./types";
import {
  consistencyVsAvailabilityIncidentSimulation,
  BALANCE_CONSISTENCY_MODE_KEY,
  CATALOG_CONSISTENCY_MODE_KEY,
  CATALOG_RECONCILIATION_KEY,
  QUORUM_REQUIREMENT_KEY,
  UNCONFIRMED_WRITE_POLICY_KEY,
  WRITE_ROUTING_KEY,
} from "./consistency-vs-availability-incident/definition";
import { consistencyVsAvailabilityIncidentCandidateUI } from "./consistency-vs-availability-incident/candidate-ui";
import { CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING } from "./consistency-vs-availability-incident/scoring";

/**
 * Consistency vs Availability Incident — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 56). A cross-region
 * connectivity problem between Region A and Region B makes the
 * Distributed Data Service genuinely unable to guarantee both strong
 * cross-region consistency AND full write availability at the same
 * time — a real CAP-theorem-shaped tradeoff, not a trick. Account
 * balance writes must never be processed against stale or unconfirmed
 * data: a balance write accepted independently by one region, with no
 * cross-region confirmation, risks a second, conflicting write landing
 * on the other region for the same account with neither side aware of
 * the other. Catalog writes may tolerate a few seconds of staleness
 * with no customer harm. The candidate must decide, per operation
 * category, how to trade consistency against availability while the
 * connectivity problem persists — and recognize that relaxing
 * consistency on the balance category specifically is the one move
 * that turns healthy-looking availability into a silent correctness
 * incident.
 */
export const consistencyVsAvailabilityIncident: ScenarioDefinition = {
  id: "consistency-vs-availability-incident",
  slug: "consistency-vs-availability-incident",
  version: 1,
  name: "Consistency vs Availability Incident",
  description:
    "A cross-region connectivity problem between Region A and Region B has made it impossible for the Distributed Data Service to guarantee both strong consistency and full write availability at the same time. Account balance changes must never be processed against stale or unconfirmed data — a balance write accepted by one region without cross-region confirmation risks silently conflicting with an independent write accepted by the other region for the same account. Product catalog views and writes may lag by a few seconds without customer harm. Decide, per operation category, how to handle the tradeoff while the connectivity problem persists, and how any backlog gets reconciled once it resolves.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: consistencyVsAvailabilityIncidentSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["CAP Theorem", "Consistency", "Availability", "Multi-Region", "Quorum"],
    skills: [
      "Reasoning about a genuine consistency/availability tradeoff under partial connectivity",
      "Differentiating mitigation by actual business correctness requirements per operation category",
      "Recognizing when healthy availability metrics conceal a correctness violation",
      "Evaluating configuration drift that silently removes a guarantee a control still claims to provide",
    ],
    shortDescription:
      "A cross-region connectivity problem forces a real tradeoff between consistency and availability — and relaxing the wrong operation category turns healthy-looking availability into a silent correctness incident.",
  },
};

export {
  consistencyVsAvailabilityIncidentSimulation,
  consistencyVsAvailabilityIncidentCandidateUI,
  CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING,
  BALANCE_CONSISTENCY_MODE_KEY,
  CATALOG_CONSISTENCY_MODE_KEY,
  CATALOG_RECONCILIATION_KEY,
  QUORUM_REQUIREMENT_KEY,
  UNCONFIRMED_WRITE_POLICY_KEY,
  WRITE_ROUTING_KEY,
};
