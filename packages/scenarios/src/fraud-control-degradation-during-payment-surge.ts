import type { ScenarioDefinition } from "./types";
import {
  EXTERNAL_RISK_PROVIDER_FALLBACK_KEY,
  FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY,
  MANUAL_REVIEW_QUEUE_PRIORITY_KEY,
  RISK_PROVIDER_CIRCUIT_BREAKER_KEY,
  RULES_ENGINE_MODE_KEY,
  TRANSACTION_VELOCITY_THRESHOLD_KEY,
  fraudControlDegradationSimulation,
} from "./fraud-control-degradation-during-payment-surge/definition";
import { fraudControlDegradationCandidateUI } from "./fraud-control-degradation-during-payment-surge/candidate-ui";
import { FRAUD_CONTROL_DEGRADATION_SCORING } from "./fraud-control-degradation-during-payment-surge/scoring";

/**
 * Fraud Control Degradation During Payment Surge — a paid,
 * Principal-level IncidentRank scenario (docs/implementation_plan/
 * phase-6e-strategy-spec.md, scenario 83). A legitimate peak traffic
 * event is driving checkout volume sharply higher at the same time the
 * External Risk Provider begins returning elevated latency and
 * intermittent failures — two independently-caused conditions, not one.
 * The Ledger stays fully healthy throughout, which must not be mistaken
 * for "everything is fine": a healthy ledger write rate says nothing
 * about whether what got written was adequately screened for fraud.
 *
 * Four business invariants govern every decision here: (1) checkout
 * availability during a legitimate peak event is valuable, but never at
 * the cost of disabling mandatory fraud controls entirely; (2) high-risk
 * transaction categories, above an authored value/velocity threshold,
 * must never bypass fraud review, regardless of throughput pressure;
 * (3) lower-risk transactions may use a bounded, authored fallback
 * risk-check mode during provider degradation; (4) a transaction that
 * bypassed mandatory fraud review must be recorded as a real,
 * non-resetting risk exposure, never silently cleared once the provider
 * recovers. A distinct security invariant governs the central trap:
 * mandatory fraud review for high-risk transactions may never be
 * bypassed to relieve checkout latency or throughput pressure, however
 * severe. Broadly bypassing fraud review — or defaulting every provider
 * timeout to an automatic approval — is this incident's central trap:
 * it makes checkout success rate and latency dashboards look
 * dramatically better while directly violating invariant (2), and it
 * creates a permanent, non-resetting historical count of fraud-review
 * bypasses on transactions that should have been reviewed, a count that
 * restoring policy afterward does not erase. Decide how to keep
 * low-risk traffic moving without weakening protection for high-risk
 * transactions, how to relieve External Risk Provider load and
 * manual-review-queue backlog without eroding mandatory review coverage,
 * and how much elapsed recovery time the provider and the review queue
 * each genuinely need before handing the incident back.
 */
export const fraudControlDegradationDuringPaymentSurge: ScenarioDefinition = {
  id: "fraud-control-degradation-during-payment-surge",
  slug: "fraud-control-degradation-during-payment-surge",
  version: 1,
  name: "Fraud Control Degradation During Payment Surge",
  description:
    "A legitimate peak traffic event is driving checkout volume sharply higher at the same time the External Risk Provider has begun returning elevated latency and intermittent failures — two concurrent, separately-caused conditions, not one. The Ledger remains fully healthy throughout, which must not be read as 'everything is fine': a healthy ledger write rate says nothing about whether what got written was adequately screened for fraud. Four business invariants govern every decision here: (1) checkout availability during a legitimate peak event is valuable, but never at the cost of disabling mandatory fraud controls entirely; (2) high-risk transaction categories — above an authored value/velocity threshold — must never bypass fraud review, regardless of throughput pressure; (3) lower-risk transactions may use a bounded, authored fallback risk-check mode during provider degradation; (4) a transaction that bypassed mandatory fraud review must be recorded as a real, non-resetting risk exposure, never silently cleared once the provider recovers. The security invariant at the center of this incident: mandatory fraud review for high-risk transactions may never be bypassed to relieve checkout latency or throughput pressure, however severe. Broadly bypassing fraud review for every transaction — or defaulting every External Risk Provider timeout to an automatic approval — is this incident's central trap: it makes checkout success rate and latency dashboards look dramatically better while directly violating invariant (2), and it creates a permanent, non-resetting historical count of fraud-review bypasses on transactions that should have been reviewed, a count that restoring policy afterward does not erase. Decide how to keep low-risk traffic moving without weakening protection for high-risk transactions, how to relieve External Risk Provider load and manual-review-queue backlog without eroding mandatory review coverage, and how much elapsed recovery time the provider and the review queue each genuinely need before handing the incident back.",
  difficulty: "principal",
  estimatedMinutes: 22,
  isFree: false,
  structure: "linear",
  simulation: fraudControlDegradationSimulation,
  library: {
    category: "Security & Identity",
    tags: [
      "Fraud Prevention",
      "Risk Policy",
      "Payments",
      "Peak Traffic",
      "Historical Damage",
      "Fail-Open vs Fail-Closed",
    ],
    skills: [
      "Distinguishing a healthy decoy signal from the real failure domain",
      "Choosing a risk-tiered degraded policy instead of a binary bypass/block-everything choice",
      "Recognizing that an availability-improving fraud-control bypass creates permanent risk exposure",
      "Separating manual-review-queue relief from external-provider recovery",
    ],
    shortDescription:
      "A legitimate peak traffic event meets a degraded fraud-risk provider — bypassing fraud review looks like it fixes checkout, but it doesn't.",
  },
};

export {
  fraudControlDegradationSimulation,
  fraudControlDegradationCandidateUI,
  FRAUD_CONTROL_DEGRADATION_SCORING,
  EXTERNAL_RISK_PROVIDER_FALLBACK_KEY,
  FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY,
  MANUAL_REVIEW_QUEUE_PRIORITY_KEY,
  RISK_PROVIDER_CIRCUIT_BREAKER_KEY,
  RULES_ENGINE_MODE_KEY,
  TRANSACTION_VELOCITY_THRESHOLD_KEY,
};
