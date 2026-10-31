import type { ScenarioDefinition } from "./types";
import {
  regulatoryDataResidencyViolationDuringFailoverSimulation,
  INSPECT_FAILOVER_ROUTING_LOGS_KEY,
  INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY,
  INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY,
  FAIL_BACK_TO_EU_KEY,
  STAY_FAILED_OVER_KEY,
  VERIFY_EU_REGION_RECOVERED_KEY,
  ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
  FILE_BREACH_NOTIFICATION_KEY,
} from "./regulatory-data-residency-violation-during-failover/definition";
import { regulatoryDataResidencyViolationDuringFailoverCandidateUI } from "./regulatory-data-residency-violation-during-failover/candidate-ui";
import { REGULATORY_DATA_RESIDENCY_VIOLATION_DURING_FAILOVER_SCORING } from "./regulatory-data-residency-violation-during-failover/scoring";

/**
 * A principal-tier Security & Identity incident built around a
 * genuinely new tradeoff axis: compliance/legal risk vs. availability.
 * Every other Security & Identity scenario in this catalog is
 * availability-only (does the auth/identity system stay up) or
 * auth-only (is the right caller allowed to do the right thing). This
 * one has no clean answer: the Global Traffic Manager's automatic
 * cross-region failover policy was designed purely for availability, and
 * it did exactly its job — EU customer traffic silently shifted to
 * us-east-1 the moment eu-west-1 degraded, and every availability metric
 * reads perfectly healthy. The problem the dashboards never show is that
 * EU personal data is now being processed and stored outside the EU, a
 * live GDPR data-residency violation that accrues for every minute it
 * continues. The candidate must make an explicit, consequential decision
 * under real uncertainty: fail back to EU immediately (stops the
 * violation, but risks reopening the exact outage the failover was
 * protecting against if EU hasn't actually recovered yet), stay failed
 * over (keeps availability perfect, but the violation keeps accruing),
 * or wait for EU's own infrastructure to genuinely recover and then route
 * back through a residency-enforcing gateway (the clean resolution, at
 * the cost of the violation accruing for longer while waiting). There is
 * no button that is free of consequence.
 */
export const regulatoryDataResidencyViolationDuringFailover: ScenarioDefinition = {
  id: "regulatory-data-residency-violation-during-failover",
  slug: "regulatory-data-residency-violation-during-failover",
  version: 1,
  name: "Regulatory Data-Residency Violation During Cross-Region Failover",
  description:
    "eu-west-1 degraded, and the Global Traffic Manager's automatic failover policy did exactly what it was built to do: it silently shifted EU customer traffic to us-east-1 to protect availability. EU request availability and latency both look perfectly healthy. What the availability dashboard doesn't show is that EU personal data is now being processed and stored in a US region — a live GDPR data-residency violation that accrues for every minute it continues. Do you force an immediate fail-back and risk reopening the outage, stay failed over and let the violation keep accruing, or wait for EU's own infrastructure to genuinely recover before routing traffic back through a residency-enforcing gateway? There is no option here that costs nothing.",
  difficulty: "principal",
  estimatedMinutes: 22,
  isFree: false,
  structure: "branching",
  simulation: regulatoryDataResidencyViolationDuringFailoverSimulation,
  library: {
    category: "Security & Identity",
    tags: [
      "Data Residency",
      "GDPR",
      "Cross-Region Failover",
      "Compliance",
      "Availability Tradeoffs",
    ],
    primarySkill: "Weighing compliance/legal risk against availability with no clean answer",
    skills: [
      "Recognizing that an availability-only failover policy can create a silent compliance violation",
      "Distinguishing an availability dashboard reading healthy from an incident actually being resolved",
      "Deciding when to act under uncertainty about a dependent region's true recovery state",
      "Separating a compliance remediation (breach notification) from an availability remediation",
    ],
    shortDescription:
      "An automatic cross-region failover protects availability but silently routes EU customer data through a US region — fail back now, stay failed over, or wait for a clean resolution, each with real consequences.",
  },
};

export {
  regulatoryDataResidencyViolationDuringFailoverSimulation,
  regulatoryDataResidencyViolationDuringFailoverCandidateUI,
  REGULATORY_DATA_RESIDENCY_VIOLATION_DURING_FAILOVER_SCORING,
  INSPECT_FAILOVER_ROUTING_LOGS_KEY,
  INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY,
  INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY,
  FAIL_BACK_TO_EU_KEY,
  STAY_FAILED_OVER_KEY,
  VERIFY_EU_REGION_RECOVERED_KEY,
  ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
  FILE_BREACH_NOTIFICATION_KEY,
};
