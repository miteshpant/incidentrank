import type { ScenarioDefinition } from "./types";
import {
  ABUSE_TRAFFIC_BLOCK_KEY,
  abusePreventionFalsePositiveStormSimulation,
  DETECTION_RULE_VERSION_KEY,
  FALSE_POSITIVE_EXEMPTION_KEY,
  IDENTITY_TRUST_SCORING_KEY,
  RATE_LIMITER_MODE_KEY,
} from "./abuse-prevention-false-positive-storm/definition";
import { abusePreventionFalsePositiveStormCandidateUI } from "./abuse-prevention-false-positive-storm/candidate-ui";
import { ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING } from "./abuse-prevention-false-positive-storm/scoring";

/**
 * Abuse-Prevention False Positive Storm — a paid, Senior-Staff-level
 * IncidentRank scenario (docs/implementation_plan/phase-6e-strategy-
 * spec.md, scenario 84). A recently deployed detection-rule update
 * begins blocking a significant population of legitimate users as
 * false positives — WHILE actual abusive traffic is also genuinely
 * present in the mix, completely independent of the rule defect. These
 * are two separate populations sharing the same blocked-request metric
 * surface: a candidate who only watches legitimate-user success rate
 * and reaches for the single global "disable enforcement" lever fixes
 * one population by exposing the platform to the other.
 *
 * Four business invariants govern every decision here: (1) legitimate
 * users must not remain blocked longer than necessary once a detection
 * defect is identified; (2) abuse protection must not be globally
 * disabled merely to relieve false-positive pressure — doing so exposes
 * the platform to the real abusive traffic that is concurrently
 * present; (3) a targeted rollback or rule adjustment is preferred over
 * a blanket bypass; (4) abuse that was allowed through due to a broad
 * bypass must be recorded as a real, non-resetting consequence, distinct
 * from the false-positive-blocking problem itself. Security invariant:
 * disabling abuse detection broadly to fix a false-positive problem
 * must never be treated as a safe resolution — real abusive traffic
 * present at the same time will be let through, and this exposure does
 * not reset merely because the false-positive rate later improves.
 * Decide how to relieve the specific legitimate population affected by
 * the faulty rule — via a targeted rollback, a validated patch, or a
 * trust-scored exemption — without ever weakening the independent abuse
 * screening that is protecting the platform from traffic that has
 * nothing to do with the rule defect.
 */
export const abusePreventionFalsePositiveStorm: ScenarioDefinition = {
  id: "abuse-prevention-false-positive-storm",
  slug: "abuse-prevention-false-positive-storm",
  version: 1,
  name: "Abuse-Prevention False Positive Storm",
  description:
    "A recently deployed detection-rule update has begun blocking a significant population of legitimate users as false positives — while actual abusive traffic is also genuinely present in the mix, completely independent of the rule defect. These are two separate populations sharing the same blocked-request metric surface, not one problem: fixing the rule does not create abuse, and the abuse was never caused by the rule either. Four business invariants govern every decision here: (1) legitimate users must not remain blocked longer than necessary once a detection defect is identified; (2) abuse protection must not be globally disabled merely to relieve false-positive pressure — doing so exposes the platform to the real abusive traffic that is concurrently present; (3) a targeted rollback or rule adjustment is preferred over a blanket bypass; (4) abuse that was allowed through due to a broad bypass must be recorded as a real, non-resetting consequence, distinct from the false-positive-blocking problem itself. Security invariant: disabling abuse detection broadly to fix a false-positive problem must never be treated as a safe resolution — real abusive traffic present at the same time will be let through, and this exposure does not reset merely because the false-positive rate later improves. Decide how to relieve the specific legitimate population affected by the faulty rule — via a targeted rollback, a validated patch, or a trust-scored exemption for the affected cohort — without ever weakening the independent abuse screening that protects the platform from traffic that has nothing to do with the rule defect.",
  difficulty: "senior_staff",
  estimatedMinutes: 18,
  isFree: false,
  structure: "linear",
  simulation: abusePreventionFalsePositiveStormSimulation,
  library: {
    category: "Security & Identity",
    tags: [
      "Abuse Prevention",
      "Rate Limiting",
      "Fraud & Abuse Containment",
      "Historical Damage",
      "Fail-Open vs Fail-Closed",
    ],
    skills: [
      "Distinguishing two concurrently-present populations sharing one metric surface",
      "Choosing a targeted rollback or exemption over a blanket protection bypass",
      "Recognizing that an availability-improving abuse-protection bypass creates permanent damage",
      "Keeping an independent abuse-detection signal intact while fixing an unrelated rule defect",
    ],
    shortDescription:
      "A bad detection rule blocks real users while real abuse is also present — disabling protection fixes one problem by creating another.",
  },
};

export {
  abusePreventionFalsePositiveStormSimulation,
  abusePreventionFalsePositiveStormCandidateUI,
  ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING,
  ABUSE_TRAFFIC_BLOCK_KEY,
  DETECTION_RULE_VERSION_KEY,
  FALSE_POSITIVE_EXEMPTION_KEY,
  IDENTITY_TRUST_SCORING_KEY,
  RATE_LIMITER_MODE_KEY,
};
