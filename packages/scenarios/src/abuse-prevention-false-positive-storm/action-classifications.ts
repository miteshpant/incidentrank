import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  ABUSE_TRAFFIC_BLOCK_KEY,
  DETECTION_RULE_VERSION_KEY,
  FALSE_POSITIVE_EXEMPTION_KEY,
  IDENTITY_TRUST_SCORING_KEY,
  RATE_LIMITER_MODE_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── detectionRuleVersion ─────────────────────────────────────────
  {
    id: "acr_1",
    controlKey: DETECTION_RULE_VERSION_KEY,
    valueEquals: "v1-stable",
    whenTriggerEquals: { falsePositivesActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Targeted rollback restored legitimate users without touching abuse protection",
      explanation:
        "Rolling back to the last known-good detection-rule version stops the false-positive blocking at its source while leaving real abuse-detection logic completely untouched. This is the preferred fix: a targeted rollback over a blanket bypass, restoring the affected population without exposing the platform to the abusive traffic that is concurrently present.",
    },
  },
  {
    id: "acr_2",
    controlKey: DETECTION_RULE_VERSION_KEY,
    valueEquals: "v3-patched",
    whenTriggerEquals: { falsePositivesActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Deploying the patched rule version preserved detection while removing the defect",
      explanation:
        "Switching to the corrected rule version keeps detecting the real abuse pattern the original rule was chasing, without the over-match defect that caused false positives. A genuine alternate strong path to the same safe outcome as a rollback, available once investigation has actually produced a validated patch.",
    },
  },
  {
    id: "acr_3",
    controlKey: DETECTION_RULE_VERSION_KEY,
    valueEquals: "v2-bad",
    whenTriggerEquals: { falsePositivesActive: true },
    outcome: "neutral",
    feedback: {
      title: "Re-affirming the faulty rule version changes nothing",
      explanation:
        "The detection rule was already at v2-bad — setting it to the same faulty value does not address the false-positive blocking at its source.",
    },
  },

  // ── rateLimiterMode ──────────────────────────────────────────────
  {
    id: "acr_4",
    controlKey: RATE_LIMITER_MODE_KEY,
    valueEquals: "disabled",
    whenTriggerEquals: { falsePositivesActive: true },
    outcome: "harmful",
    feedback: {
      title: "Disabling abuse detection and rate limiting let real abuse through",
      explanation:
        "Turning off enforcement entirely made legitimate-user success rate look dramatically better — nobody is being blocked for any reason anymore — but that apparent fix is not real: it directly violates the invariant that abuse protection must not be globally disabled merely to relieve false-positive pressure. Real abusive traffic that was already present in the mix is now getting through at a high rate, and every tick this stayed active added to a permanent, non-resetting count of abuse requests allowed, which stays on the record even after enforcement is restored.",
    },
  },
  {
    id: "acr_5",
    controlKey: RATE_LIMITER_MODE_KEY,
    valueEquals: "relaxed",
    whenTriggerEquals: { falsePositivesActive: true },
    outcome: "harmful",
    feedback: {
      title: "Broadly relaxing enforcement let a smaller but still real amount of abuse through",
      explanation:
        "Loosening enforcement thresholds broadly — rather than targeting the specific false-positive population — only partially relieves legitimate users while still letting a measurable, counted share of real abusive traffic through. A smaller blast radius than full disablement, but the same kind of violation: this is not a targeted fix, and it still adds to the non-resetting abuse-exposure count.",
    },
  },
  {
    id: "acr_6",
    controlKey: RATE_LIMITER_MODE_KEY,
    valueEquals: "strict",
    whenTriggerEquals: { falsePositivesActive: true },
    outcome: "neutral",
    feedback: {
      title: "Keeping enforcement strict protects against abuse but does not fix false positives by itself",
      explanation:
        "Leaving the rate limiter at strict enforcement correctly avoids exposing the platform to the concurrently-present real abuse traffic, but by itself does nothing to relieve the legitimate users being blocked by the faulty detection rule — that requires a targeted fix on the rule itself or an exemption for the affected population.",
    },
  },

  // ── falsePositiveExemption ───────────────────────────────────────
  {
    id: "acr_7",
    controlKey: FALSE_POSITIVE_EXEMPTION_KEY,
    valueEquals: "exempt-flagged-legit",
    whenTriggerEquals: { falsePositivesActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Targeted exemption restored the flagged-legitimate population without a blanket bypass",
      explanation:
        "Granting a temporary exemption to the specific population identity-based trust scoring has identified as legitimate-but-flagged restores their access while investigation into the bad rule continues, without touching enforcement for anyone else. This only works safely with a live trust signal — pair this with identity trust scoring enabled, or there is no reliable way to tell a real false positive from a real abuser hiding in the same flagged population.",
    },
  },

  // ── identityTrustScoring ─────────────────────────────────────────
  {
    id: "acr_8",
    controlKey: IDENTITY_TRUST_SCORING_KEY,
    valueEquals: "disabled",
    whenTriggerEquals: { falsePositivesActive: true },
    outcome: "harmful",
    feedback: {
      title: "Disabling identity trust scoring removed the signal exemptions depend on",
      explanation:
        "With trust scoring disabled, there is no reliable live signal to distinguish a real false positive from a real abuser inside the flagged population. Any exemption granted without this signal cannot safely differentiate the two populations it needs to tell apart.",
    },
  },
  {
    id: "acr_9",
    controlKey: IDENTITY_TRUST_SCORING_KEY,
    valueEquals: "enabled",
    whenTriggerEquals: { falsePositivesActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Keeping identity trust scoring enabled kept targeted exemptions safe",
      explanation:
        "Leaving identity-based trust scoring active preserves the live signal needed to safely distinguish a real false positive from a real abuser within the same flagged population, making any targeted exemption granted alongside it a genuinely safe, differentiated response rather than a blind bypass.",
    },
  },

  // ── abuseTrafficBlock ────────────────────────────────────────────
  {
    id: "acr_10",
    controlKey: ABUSE_TRAFFIC_BLOCK_KEY,
    valueEquals: "inactive",
    whenTriggerEquals: { falsePositivesActive: true },
    outcome: "harmful",
    feedback: {
      title: "Disabling the independent abuse signal let real abuse through on a separate axis",
      explanation:
        "This abuse-specific detection signal is independent of the faulty rule version and of rate-limiter mode — it exists to keep catching real abuse (credential-stuffing velocity, known-bad-IP reputation) regardless of what happens elsewhere. Turning it off exposes the platform to real abusive traffic this signal alone would have caught, a distinct, additional exposure on top of anything rateLimiterMode allows, and adds to the same non-resetting abuse-exposure count.",
    },
  },
  {
    id: "acr_11",
    controlKey: ABUSE_TRAFFIC_BLOCK_KEY,
    valueEquals: "active",
    whenTriggerEquals: { falsePositivesActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Keeping the independent abuse signal active preserved real abuse containment",
      explanation:
        "Leaving this abuse-specific detection signal active keeps containing real abusive traffic regardless of what happens to the faulty detection rule or to rate-limiter mode — proving that fixing the false-positive problem and keeping abuse protection intact are two separate, independently controllable decisions, not one dial.",
    },
  },
];
