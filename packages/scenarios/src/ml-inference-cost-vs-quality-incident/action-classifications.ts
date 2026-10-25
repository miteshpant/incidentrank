import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CLASSIFIER_REMEDIATION_KEY,
  CRITICAL_SEGMENT_POLICY_KEY,
  NON_CRITICAL_CACHE_REUSE_KEY,
  ROUTING_POLICY_KEY,
  SMALL_MODEL_QUALITY_FLOOR_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── routingPolicy ────────────────────────────────────────────────────
  {
    id: "acc_1",
    controlKey: ROUTING_POLICY_KEY,
    valueEquals: "blanket-small-model",
    whenTriggerEquals: { misrouteActive: true },
    outcome: "harmful",
    feedback: {
      title: "Blanket-routing everything to the Small Model silently downgraded quality-critical traffic",
      explanation:
        "Routing every request to the Small Model eliminated the cost spike almost immediately, with routing-layer uptime and inference latency looking just as healthy as every safe path. That apparent calm is not real: without an explicit, bounded policy protecting quality-critical traffic, this silently serves EVERY request — including quality-critical ones — from the Small Model's materially lower-quality tier, with nothing downstream ever flagging it as a policy decision. Every tick this stayed active added to a permanent, non-resetting count of silently downgraded critical requests, which stays on the record even after you switch policies, and materially penalizes Data Integrity and Reliability regardless of how healthy or cheap serving looked.",
    },
  },
  {
    id: "acc_2",
    controlKey: ROUTING_POLICY_KEY,
    valueEquals: "quality-tiering",
    whenTriggerEquals: { misrouteActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Quality-tiering routed by declared criticality instead of blindly trusting the broken classifier",
      explanation:
        "Switching to an explicit, candidate-authored policy that routes each request by its own declared criticality tag — rather than the degraded complexity classifier's verdict — protects quality-critical traffic immediately and contains inference cost immediately, with no drain lag to wait out. This is one of this scenario's two legitimate alternate strong paths: it requires the candidate to actively maintain the policy rather than fixing the underlying classifier, a real, ongoing judgment call rather than a free lunch.",
    },
  },
  {
    id: "acc_3",
    controlKey: ROUTING_POLICY_KEY,
    valueEquals: "blanket-large-model",
    whenTriggerEquals: { misrouteActive: true },
    outcome: "neutral",
    feedback: {
      title: "Blanket-routing everything to the Large Model protects quality but addresses none of the cost explosion",
      explanation:
        "Routing every request to the Large Model is genuinely safe on quality — nothing is ever downgraded, critical or not — but it contains none of the cost explosion this incident is actually about. A legitimate, honestly-labeled 'quality protected, cost unaddressed' choice, not a correctness violation, but it leaves real, avoidable spend on the table that smarter routing could have captured without sacrificing anything.",
    },
  },
  {
    id: "acc_4",
    controlKey: ROUTING_POLICY_KEY,
    valueEquals: "classifier-only",
    whenTriggerEquals: { misrouteActive: true },
    outcome: "neutral",
    feedback: {
      title: "Staying on classifier-only keeps the cost explosion bound entirely to the classifier's own health",
      explanation:
        "Remaining on the default classifier-only policy is not itself unsafe — it is the right policy once the classifier is healthy — but during this incident it means both cost containment and quality protection depend entirely on classifierRemediation and criticalSegmentPolicy actually being engaged. Staying on classifier-only without also dispatching a fix or pinning the critical segment leaves the cost explosion, and potentially quality protection, fully unaddressed.",
    },
  },

  // ── classifierRemediation ───────────────────────────────────────────
  {
    id: "acc_5",
    controlKey: CLASSIFIER_REMEDIATION_KEY,
    valueEquals: true,
    whenTriggerEquals: { misrouteActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Dispatching a classifier fix repaired the root cause instead of overriding its decisions",
      explanation:
        "Dispatching a durable fix to the actual broken complexity classifier — rather than overriding its decisions with a policy layered on top — is this scenario's other legitimate alternate strong path. It is durable (once fully rolled out, every future routing decision is trustworthy again with no ongoing policy-maintenance cost) but genuinely slower: a real, honest rollout window during which exposure only gradually reduces, fully protected immediately only if criticalSegmentPolicy is also pinned as defense-in-depth.",
    },
  },
  {
    id: "acc_6",
    controlKey: CLASSIFIER_REMEDIATION_KEY,
    valueEquals: false,
    whenTriggerEquals: { misrouteActive: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the classifier unfixed relies entirely on routingPolicy/criticalSegmentPolicy instead",
      explanation:
        "With classifierRemediation off, the degraded classifier itself never improves — any safety or cost containment achieved this attempt must come entirely from routingPolicy and criticalSegmentPolicy. Not unsafe by itself, but it means the root cause remains broken for any future incident that relies on the classifier's verdict again.",
    },
  },

  // ── criticalSegmentPolicy ────────────────────────────────────────────
  {
    id: "acc_7",
    controlKey: CRITICAL_SEGMENT_POLICY_KEY,
    valueEquals: "always-large-model",
    whenTriggerEquals: { misrouteActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Pinning critical traffic to the Large Model protected it regardless of routing policy or classifier health",
      explanation:
        "Pinning every quality-critical request to the Large Model, independent of routingPolicy or the classifier's current health, is this scenario's direct implementation of the business invariant that quality-critical traffic must never be silently downgraded without an explicit, bounded decision. It is what keeps a classifier-remediation rollout safe from the first tick, and what keeps even the cruder blanket-small-model policy from downgrading the traffic that actually matters most.",
    },
  },
  {
    id: "acc_8",
    controlKey: CRITICAL_SEGMENT_POLICY_KEY,
    valueEquals: "unprotected",
    whenTriggerEquals: { misrouteActive: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the critical-segment pin off relies entirely on routingPolicy getting criticality right",
      explanation:
        "Without this explicit pin, whether quality-critical traffic is protected depends entirely on which routingPolicy is active actually getting criticality right on its own (true for quality-tiering by construction, true once a classifier fix is fully rolled out, but NOT true while the classifier is still degraded or under a blanket-small-model policy). Not unsafe in combination with a policy that already protects critical traffic structurally, but it removes a real, independent safety net during any transitional window.",
    },
  },

  // ── smallModelQualityFloor ───────────────────────────────────────────
  {
    id: "acc_9",
    controlKey: SMALL_MODEL_QUALITY_FLOOR_KEY,
    valueEquals: "enhanced",
    whenTriggerEquals: { misrouteActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Running the Small Model at its enhanced tier narrowed the quality gap on non-critical traffic",
      explanation:
        "Running the Small Model with more compute per request closes part of the quality gap to the Large Model for whichever non-critical traffic is already being served by it, at a real, higher ongoing compute cost than the standard tier — still materially cheaper than the Large Model, a genuine, non-dead cost/quality lever orthogonal to which routing policy sent traffic there.",
    },
  },
  {
    id: "acc_10",
    controlKey: SMALL_MODEL_QUALITY_FLOOR_KEY,
    valueEquals: "standard",
    whenTriggerEquals: { misrouteActive: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the Small Model at standard tier avoids the extra compute spend but keeps a larger quality gap",
      explanation:
        "Leaving smallModelQualityFloor at standard is fine as long as a real safe routing policy is already protecting quality-critical traffic — it simply means non-critical traffic served by the Small Model sees a larger quality gap to the Large Model than the enhanced tier would provide, without the extra ongoing compute cost.",
    },
  },

  // ── nonCriticalCacheReuse ────────────────────────────────────────────
  {
    id: "acc_11",
    controlKey: NON_CRITICAL_CACHE_REUSE_KEY,
    valueEquals: "on",
    whenTriggerEquals: { misrouteActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Caching repeated non-critical responses reduced redundant inference spend without touching quality",
      explanation:
        "Reusing cached responses for repeated, low-stakes non-critical requests reduces redundant inference calls to either model without changing the quality of any individual request that is actually served — a genuinely free-ish cost lever, orthogonal to the routing-policy/critical-segment judgment entirely, and never a substitute for it.",
    },
  },
  {
    id: "acc_12",
    controlKey: NON_CRITICAL_CACHE_REUSE_KEY,
    valueEquals: "off",
    whenTriggerEquals: { misrouteActive: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving cache reuse off avoids the small cache-infrastructure spend but recomputes every request",
      explanation:
        "Leaving nonCriticalCacheReuse off means every request is recomputed from scratch, however repetitive. This does not itself create any quality or safety risk, but it leaves a real, avoidable sliver of inference spend on the table that caching repeated non-critical responses could have captured for free.",
    },
  },
];
