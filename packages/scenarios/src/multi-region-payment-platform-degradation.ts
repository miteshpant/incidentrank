import type { ScenarioDefinition } from "./types";
import {
  multiRegionPaymentPlatformDegradationSimulation,
  CROSS_REGION_REPLICATION_MODE_KEY,
  EU_TRAFFIC_PERCENTAGE_KEY,
  EVENT_PUBLISHER_PRIORITY_KEY,
  FRAUD_FALLBACK_MODE_KEY,
  HIGH_RISK_THROTTLE_KEY,
  LEDGER_WRITE_AUTHORITY_KEY,
  RISK_ENRICHMENT_MODE_KEY,
  SETTLEMENT_WORKER_PRIORITY_KEY,
} from "./multi-region-payment-platform-degradation/definition";
import { multiRegionPaymentPlatformDegradationCandidateUI } from "./multi-region-payment-platform-degradation/candidate-ui";
import { MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING } from "./multi-region-payment-platform-degradation/scoring";

/**
 * Multi-Region Payment Platform Degradation — a paid, Principal-level
 * IncidentRank scenario (docs/implementation_plan/phase6dsupport.md,
 * scenario 61). EU's regional path to the shared Fraud Provider has
 * degraded (US calls to the same provider remain healthy), and
 * independently, cross-region ledger replication from the US Ledger to
 * the EU Ledger Replica has begun lagging. Shifting EU traffic onto US
 * capacity relieves EU's availability problem but adds EU's volume on
 * top of US's own native ledger/settlement load — a second, distinct
 * failure domain the candidate must recognize and contain, not merely
 * "the same incident continuing."
 *
 * This platform operates under three explicit business invariants the
 * candidate must never violate while stabilizing it:
 *
 *   1. Payment authorization must not create divergent ledger
 *      authority — a payment must never be authorized against an
 *      account whose ledger write could land independently in both
 *      regions at once (e.g. via US capacity while that account's
 *      ledger is still only replicating locally in EU).
 *   2. Mandatory fraud controls may not be bypassed, under any
 *      capacity or latency pressure, for any transaction.
 *   3. Settlement delay may be tolerated within an authored bounded
 *      window — a growing-but-draining settlement backlog is an
 *      acceptable, bounded tradeoff; an unbounded, climbing backlog is
 *      not.
 */
export const multiRegionPaymentPlatformDegradation: ScenarioDefinition = {
  id: "multi-region-payment-platform-degradation",
  slug: "multi-region-payment-platform-degradation",
  version: 1,
  name: "Multi-Region Payment Platform Degradation",
  description:
    "EU's regional path to the shared Fraud Provider has degraded — EU risk checks are failing or timing out at an elevated rate, while US's own calls to the same provider remain healthy. Independently, cross-region ledger replication from the US Ledger to the EU Ledger Replica has begun lagging behind the write stream. Shifting EU traffic onto US capacity relieves EU's payment availability, but it adds EU's volume on top of US's own native ledger/settlement load, risking a second, distinct failure domain in US capacity that did not exist before the mitigation. Three business invariants govern every decision here: (1) payment authorization must not create divergent ledger authority — a payment must never be authorized in a way that lets its ledger write land independently in more than one region at the same time; (2) mandatory fraud controls may not be bypassed under any capacity or latency pressure, for any transaction; (3) settlement delay may be tolerated within an authored bounded window — a growing-but-draining settlement backlog is an acceptable, bounded tradeoff, but an unbounded, climbing backlog is not. Decide how much EU traffic to shift, how to protect ledger write authority and mandatory fraud checks while doing so, and how to protect US ledger/settlement capacity from the pressure that traffic shifting itself creates.",
  difficulty: "principal",
  estimatedMinutes: 25,
  isFree: false,
  simulation: multiRegionPaymentPlatformDegradationSimulation,
  library: {
    category: "Distributed Systems",
    tags: [
      "Multi-Region",
      "Payments",
      "Ledger Correctness",
      "Pressure Transfer",
      "Fraud Controls",
      "Settlement",
    ],
    skills: [
      "Recognizing a mitigation that creates a second, self-inflicted failure domain",
      "Protecting correctness invariants before shifting load across regions",
      "Distinguishing a bounded, draining backlog from an unbounded one",
      "Sequencing containment, correctness protection, and capacity protection correctly",
    ],
    shortDescription:
      "EU dependency degradation and cross-region ledger lag interact with traffic shifting — fixing EU availability can quietly overload US ledger/settlement capacity instead.",
  },
};

export {
  multiRegionPaymentPlatformDegradationSimulation,
  multiRegionPaymentPlatformDegradationCandidateUI,
  MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING,
  CROSS_REGION_REPLICATION_MODE_KEY,
  EU_TRAFFIC_PERCENTAGE_KEY,
  EVENT_PUBLISHER_PRIORITY_KEY,
  FRAUD_FALLBACK_MODE_KEY,
  HIGH_RISK_THROTTLE_KEY,
  LEDGER_WRITE_AUTHORITY_KEY,
  RISK_ENRICHMENT_MODE_KEY,
  SETTLEMENT_WORKER_PRIORITY_KEY,
};
