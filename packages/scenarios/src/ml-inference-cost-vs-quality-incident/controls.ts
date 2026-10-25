import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * How the Routing Layer decides, per request, whether to serve from the
 * Large Model or the Small Model. "classifier-only" (default) blindly
 * trusts the upstream complexity classifier's verdict with no override
 * — exactly what keeps inference cost bound to a degraded classifier
 * that is now routing far more traffic to the Large Model than genuinely
 * necessary (the scenario's root cause). "quality-tiering" replaces that
 * blind trust with an explicit, candidate-authored policy: route by each
 * request's own declared criticality tag, independent of whatever the
 * classifier currently says — ALTERNATE STRONG PATH B, a stopgap that
 * works immediately without waiting for the classifier itself to be
 * fixed. "blanket-small-model" routes every request to the Small Model
 * regardless of criticality or complexity — the scenario's required
 * unsafe tempting trap: inference cost drops to near-zero immediately,
 * with no outage anywhere, while silently downgrading quality-critical
 * decisions the business invariants say must never be blanket-
 * downgraded. "blanket-large-model" routes everything to the Large
 * Model — genuinely safe on quality (nothing is ever downgraded) but
 * contains none of the cost explosion at all, a second honest "quality
 * protected, cost unaddressed" baseline-adjacent choice.
 */
export const ROUTING_POLICY_KEY = "routingPolicy";

/**
 * Whether the candidate has dispatched a durable fix to the actual
 * broken complexity classifier, rather than overriding its decisions.
 * "off" (default) leaves the classifier exactly as degraded as the
 * incident began. "on" starts a real rollout that takes genuine elapsed
 * time to complete (see timed-events.ts's drain windows) — this is
 * ALTERNATE STRONG PATH A: fixing the root cause itself so routing
 * decisions become trustworthy again, rather than overriding them with
 * an explicit policy. Only matters while routingPolicy is
 * "classifier-only" — once a different routing policy is engaged, the
 * Routing Layer is no longer consulting the classifier's verdict at all,
 * so a classifier fix has nothing left to improve.
 */
export const CLASSIFIER_REMEDIATION_KEY = "classifierRemediation";

/**
 * An independent, explicit pin forcing every request tagged
 * quality-critical to the Large Model, regardless of what routingPolicy
 * or the classifier's health currently says. "unprotected" (default)
 * applies no such pin — critical-segment routing depends entirely on
 * whichever routingPolicy is active getting it right. "always-large-
 * model" is this scenario's direct, named implementation of the business
 * invariant "quality-critical request classes must not be silently
 * downgraded to the Small Model without an explicit, bounded policy
 * decision" — it is what actually keeps the blanket-small-model trap
 * from being even worse (critical traffic stays protected even under an
 * otherwise-unsafe blanket policy), and it is what makes quality-tiering
 * fully safe rather than merely "probably fine."
 */
export const CRITICAL_SEGMENT_POLICY_KEY = "criticalSegmentPolicy";

/**
 * The compute tier the Small Model itself runs at. "standard" (default)
 * is the Small Model's ordinary, cheapest configuration — materially
 * lower quality than the Large Model, which is exactly why blanket-
 * downgrading quality-critical traffic to it is unsafe. "enhanced" runs
 * the Small Model with more compute per request, closing part of the
 * quality gap to the Large Model while remaining materially cheaper per
 * request than the Large Model — a real, independent cost/quality lever
 * on whichever non-critical traffic is already being served by the
 * Small Model, orthogonal to which routing policy chose to send it
 * there.
 */
export const SMALL_MODEL_QUALITY_FLOOR_KEY = "smallModelQualityFloor";

/**
 * Whether the Routing Layer caches and reuses inference responses for
 * repeated, low-stakes non-critical requests instead of recomputing
 * them. "off" (default) recomputes every request from scratch, however
 * repetitive. "on" is a genuinely free-ish cost lever: it reduces
 * redundant inference calls to EITHER model without changing the
 * quality of any individual request that is actually served — orthogonal
 * to the routing-policy/critical-segment judgment entirely, and never a
 * substitute for it.
 */
export const NON_CRITICAL_CACHE_REUSE_KEY = "nonCriticalCacheReuse";

export const controls: ControlDefinition[] = [
  {
    key: ROUTING_POLICY_KEY,
    allowedValues: ["classifier-only", "quality-tiering", "blanket-small-model", "blanket-large-model"],
    initialValue: "classifier-only",
  },
  {
    key: CLASSIFIER_REMEDIATION_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: CRITICAL_SEGMENT_POLICY_KEY,
    allowedValues: ["unprotected", "always-large-model"],
    initialValue: "unprotected",
  },
  {
    key: SMALL_MODEL_QUALITY_FLOOR_KEY,
    allowedValues: ["standard", "enhanced"],
    initialValue: "standard",
  },
  {
    key: NON_CRITICAL_CACHE_REUSE_KEY,
    allowedValues: ["off", "on"],
    initialValue: "off",
  },
];
