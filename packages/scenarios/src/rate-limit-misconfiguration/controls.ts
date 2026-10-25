import type { ControlDefinition } from "@incidentrank/simulator";

/** The gateway's overall rate-limit enforcement mode. "newly-deployed" is
 * the just-shipped policy causing the incident: a per-tenant quota that
 * is too tight for legitimate steady traffic, paired with a burst
 * allowance generous enough that one high-volume tenant can spike past
 * what's fair and consume the shared capacity pool. "retuned" is the
 * candidate's own re-tightened/widened policy (its real effect is driven
 * by the burst/quota/priority controls below, not by this flag alone).
 * "previous-policy" rolls back to the last known-good configuration —
 * safe, but reintroduces none of the new tenant protections the
 * deployment was trying to add. */
export const RATE_LIMIT_POLICY_KEY = "rateLimitPolicy";

/** How many requests a tenant may burst above their steady-state quota
 * in a short window before the limiter starts rejecting. The newly
 * deployed default (large) is generous enough that a single bursty
 * tenant can consume a disproportionate share of shared backend
 * capacity before the limiter ever engages — the second half of this
 * incident's root cause. Lowering it caps how much any one tenant can
 * spike, independent of the per-tenant quota's steady-state level. */
export const BURST_SIZE_KEY = "burstSize";

/** The steady-state requests-per-minute ceiling applied to every
 * individual tenant. The newly deployed value is too tight for
 * legitimate steady traffic from normal-volume tenants, producing the
 * 429s this incident opens with. Raising it relieves legitimate
 * tenants, but raising it without also capping burst size still leaves
 * the bursty tenant free to dominate within its own now-larger
 * allowance. */
export const PER_TENANT_QUOTA_KEY = "perTenantQuota";

/** The aggregate requests-per-minute ceiling shared across all tenants
 * at the gateway, independent of how it's divided per-tenant. Raising
 * this adds more total shared capacity but does nothing by itself to
 * stop one tenant from claiming a disproportionate share of it — it
 * only changes how much headroom exists in total. */
export const GLOBAL_QUOTA_KEY = "globalQuota";

/** Whether the limiter treats all tenants identically ("none") or gives
 * known-legitimate, steady-volume tenants priority admission ahead of
 * bursty/unclassified traffic once the global quota is under pressure
 * ("favor-steady"). Priority class changes who gets throttled first
 * when capacity is contended — it does not, by itself, cap how much any
 * one tenant can take. */
export const PRIORITY_CLASS_KEY = "priorityClass";

/** An emergency kill-switch that removes rate-limit enforcement at the
 * gateway entirely. With the bypass engaged, every request is admitted
 * regardless of tenant, burst, or quota — customer-facing 429s and
 * success rate can look fully healthy, but the fairness protection the
 * limiter exists to provide is gone: nothing stops the bursty tenant
 * from dominating shared capacity again. This is a real, immediate way
 * to stop 429s; it is not a fix for the underlying misconfigured
 * policy. */
export const EMERGENCY_BYPASS_KEY = "emergencyBypass";

export const controls: ControlDefinition[] = [
  {
    key: RATE_LIMIT_POLICY_KEY,
    allowedValues: ["newly-deployed", "retuned", "previous-policy"],
    initialValue: "newly-deployed",
  },
  {
    key: BURST_SIZE_KEY,
    allowedValues: [50, 200, 800, 2_000],
    initialValue: 2_000,
  },
  {
    key: PER_TENANT_QUOTA_KEY,
    allowedValues: [60, 150, 400, 800],
    initialValue: 60,
  },
  {
    key: GLOBAL_QUOTA_KEY,
    allowedValues: [5_000, 10_000, 20_000],
    initialValue: 10_000,
  },
  {
    key: PRIORITY_CLASS_KEY,
    allowedValues: ["none", "favor-steady"],
    initialValue: "none",
  },
  {
    key: EMERGENCY_BYPASS_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
