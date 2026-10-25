import type { TimedEvent } from "@incidentrank/simulator";

/** The newly deployed rate-limit policy has been live long enough for
 * its effects to show up in traffic: legitimate steady tenants start
 * hitting the too-tight per-tenant quota while one high-volume tenant's
 * burst allowance lets it keep climbing past its fair share. */
const POLICY_EFFECTS_VISIBLE_MS = 30_000;

/** Second wave: with nothing changed, the same bursty tenant's traffic
 * keeps growing and consumes an even larger share of the shared global
 * quota, pushing out more legitimate tenants in the process. This is
 * never a surprise flip — bursterShareOfCapacity and
 * limiterBucketUtilization have already been visibly elevated since
 * POLICY_EFFECTS_VISIBLE_MS, and both keep climbing in the same
 * direction; a candidate watching either has every reason to expect
 * this to keep getting worse if the burst allowance stays wide open. */
const BURST_DOMINATION_DEEPENS_MS = POLICY_EFFECTS_VISIBLE_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "policy-effects-visible",
    atMs: POLICY_EFFECTS_VISIBLE_MS,
    type: "TRIGGER_SET",
    message:
      "The newly deployed rate-limit policy is now in effect: legitimate tenants are seeing 429s against the new per-tenant quota, while one high-volume tenant's traffic is climbing well past what the other tenants are getting.",
    setTriggers: { policyEffectsVisible: true },
  },
  {
    id: "burst-domination-deepens",
    atMs: BURST_DOMINATION_DEEPENS_MS,
    type: "TRIGGER_SET",
    message:
      "The high-volume tenant's burst traffic keeps growing unchecked, now consuming most of the shared global quota and pushing more legitimate tenants out entirely.",
    setTriggers: { policyEffectsVisible: true, burstDominationDeepening: true },
  },
];

export { POLICY_EFFECTS_VISIBLE_MS, BURST_DOMINATION_DEEPENS_MS };
