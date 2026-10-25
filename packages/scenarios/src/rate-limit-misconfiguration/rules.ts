import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  BURST_SIZE_KEY,
  EMERGENCY_BYPASS_KEY,
  GLOBAL_QUOTA_KEY,
  PER_TENANT_QUOTA_KEY,
  PRIORITY_CLASS_KEY,
  RATE_LIMIT_POLICY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-gateway": "healthy",
  services: "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-gateway": "degraded",
  services: "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-gateway": "critical",
  services: "critical",
};

// Bypass engaged: the gateway itself looks healthy (nothing is being
// rejected), but the fairness protection is gone, so Services carries
// whatever load the dominant tenant chooses to send.
const bypassHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-gateway": "healthy",
  services: "degraded",
};

/**
 * Authored rule table for Rate-Limit Misconfiguration, ordered
 * most-specific first. The newly deployed policy has two independent
 * problems that must BOTH be addressed: a per-tenant quota too tight
 * for legitimate steady traffic (burstSize/perTenantQuota), and a burst
 * allowance generous enough that one high-volume tenant can dominate
 * shared capacity (burstSize). Four real levers interact:
 *
 *   - burstSize: caps how far any single tenant can spike above its own
 *     quota in a short window. This is the control that actually stops
 *     domination — raising perTenantQuota or globalQuota alone does not.
 *   - perTenantQuota: the steady-state ceiling. Too tight (the deployed
 *     default) throttles ordinary legitimate traffic; raising it relieves
 *     legitimate tenants but does nothing about burst domination by
 *     itself.
 *   - globalQuota: total shared capacity. Raising it alone adds headroom
 *     that the dominant tenant also claims more of — it does not change
 *     who gets a fair share.
 *   - priorityClass: changes who gets throttled first under contention
 *     but does not cap any one tenant's consumption by itself.
 *
 * The correctness trap: emergencyBypass removes enforcement entirely.
 * Customer-facing rejectionRate/customerSuccessRate/
 * legitimateTenantSuccessRate can all read fully healthy under bypass,
 * but rateLimitStatus flips to "unprotected" and bursterShareOfCapacity
 * stays elevated — the dominant tenant is still free to consume whatever
 * share it wants, the system just isn't rejecting anyone right now. This
 * state must never satisfy successCondition or acceptableCondition no
 * matter how healthy the customer-facing numbers look.
 *
 * The durable fix re-tunes the policy: a tightened burst size (so no
 * tenant can spike past a fair share) combined with a per-tenant quota
 * raised enough for legitimate steady traffic. Priority class is a
 * genuine, defensible alternate/complementary lever — favoring steady
 * tenants under contention recovers legitimate success without touching
 * burst size, though it does not by itself cap the burster's
 * consumption the way a tightened burst size does.
 */
export const rateLimitMisconfigurationRules: Rule[] = [
  // ── UNSAFE (correctness trap): emergency bypass engaged. Every
  // customer-facing metric looks fully healthy — nothing is being
  // rejected — but the fairness protection is gone. Checked first (once
  // policy effects are visible) so it wins over every other control
  // combination whenever the bypass is on, regardless of how the other
  // controls are set.
  {
    id: "emergency-bypass-unprotected",
    when: {
      triggerEquals: { policyEffectsVisible: true },
      controlEquals: { [EMERGENCY_BYPASS_KEY]: true },
    },
    incidentState: "bypass-unprotected",
    values: {
      limiterHealth: "critical",
      rejectionRate: 0,
      legitimateTenantSuccessRate: 100,
      bursterShareOfCapacity: 62,
      backendUtilization: 91,
      limiterBucketUtilization: 0,
      customerSuccessRate: 99,
      rateLimitStatus: "unprotected",
      burstFairnessState: "not-applicable",
    },
    componentHealth: bypassHealth,
  },

  // ── OPTIMAL: policy re-tuned — burst size tightened AND per-tenant
  // quota raised enough for legitimate steady traffic. This is the only
  // combination that fixes both halves of the root cause: no tenant can
  // spike past a fair share, and legitimate steady tenants stop being
  // throttled. Checked right after bypass so it wins over every weaker
  // combination below once both levers are actually set correctly.
  {
    id: "policy-retuned-both-fixed",
    when: {
      triggerEquals: { policyEffectsVisible: true },
      controlAtMost: { [BURST_SIZE_KEY]: 200 },
      controlAtLeast: { [PER_TENANT_QUOTA_KEY]: 400 },
      controlEquals: { [EMERGENCY_BYPASS_KEY]: false },
    },
    incidentState: "retuned-fair",
    values: {
      limiterHealth: "normal",
      rejectionRate: 1,
      legitimateTenantSuccessRate: 99,
      bursterShareOfCapacity: 11,
      backendUtilization: 38,
      limiterBucketUtilization: 24,
      customerSuccessRate: 99,
      rateLimitStatus: "protected",
      burstFairnessState: "capped",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE alternate path: priority class favors steady tenants
  // under contention, with per-tenant quota also raised. Legitimate
  // tenants recover (priority admission ahead of the burster) and
  // customer-facing numbers look healthy, but burst size is still wide
  // open — the dominant tenant is still structurally capable of
  // consuming a disproportionate share whenever priority doesn't fully
  // shield everyone else. A genuine, defensible tradeoff: protects the
  // paying/legitimate majority without touching the burst lever, at the
  // cost of leaving the burster's own ceiling uncapped.
  {
    id: "priority-favors-steady",
    when: {
      triggerEquals: { policyEffectsVisible: true },
      controlEquals: { [PRIORITY_CLASS_KEY]: "favor-steady" },
      controlAtLeast: { [PER_TENANT_QUOTA_KEY]: 400, [BURST_SIZE_KEY]: 800 },
    },
    incidentState: "priority-favored-steady",
    values: {
      limiterHealth: "normal",
      rejectionRate: 3,
      legitimateTenantSuccessRate: 97,
      bursterShareOfCapacity: 34,
      backendUtilization: 58,
      limiterBucketUtilization: 46,
      customerSuccessRate: 97,
      rateLimitStatus: "protected",
      burstFairnessState: "uncapped",
    },
    componentHealth: healthyHealth,
  },

  // ── HARMFUL: rolling back to the previous policy. Stops the new
  // too-tight quota from throttling legitimate tenants (previous policy
  // had a workable steady-state quota), but it also reverts burst size
  // to the previous, equally generous allowance — the dominant tenant's
  // ability to spike past a fair share is untouched, and
  // bursterShareOfCapacity stays elevated. This "fixes" the symptom the
  // incident opened with while leaving the actual misconfiguration (an
  // unbounded burst allowance) exactly where it was.
  {
    id: "rollback-leaves-burst-unfixed",
    when: {
      triggerEquals: { policyEffectsVisible: true },
      controlEquals: { [RATE_LIMIT_POLICY_KEY]: "previous-policy", [EMERGENCY_BYPASS_KEY]: false },
    },
    incidentState: "rolled-back-burst-open",
    values: {
      limiterHealth: "warning",
      rejectionRate: 2,
      legitimateTenantSuccessRate: 98,
      bursterShareOfCapacity: 55,
      backendUtilization: 79,
      limiterBucketUtilization: 68,
      customerSuccessRate: 96,
      rateLimitStatus: "protected",
      burstFairnessState: "not-applicable",
    },
    componentHealth: degradedHealth,
  },

  // ── HARMFUL: global quota raised alone, without tightening burst
  // size. More total shared capacity exists, but the dominant tenant
  // immediately claims a larger absolute share of the new headroom too
  // — bursterShareOfCapacity does not improve, backend utilization and
  // infrastructure cost both rise, and legitimate tenants are still
  // throttled by the untouched per-tenant quota. Capacity was added to
  // the wrong lever.
  {
    id: "global-quota-raised-alone",
    when: {
      triggerEquals: { policyEffectsVisible: true },
      controlAtLeast: { [GLOBAL_QUOTA_KEY]: 20_000, [BURST_SIZE_KEY]: 2_000 },
      controlAtMost: { [PER_TENANT_QUOTA_KEY]: 60 },
    },
    incidentState: "global-quota-raised-alone",
    values: {
      limiterHealth: "critical",
      rejectionRate: 9,
      legitimateTenantSuccessRate: 71,
      bursterShareOfCapacity: 64,
      backendUtilization: 88,
      limiterBucketUtilization: 81,
      customerSuccessRate: 83,
      rateLimitStatus: "protected",
      burstFairnessState: "not-applicable",
    },
    componentHealth: criticalHealth,
  },

  // ── Partial relief: per-tenant quota raised alone, burst size left
  // wide open. Legitimate steady tenants stop getting throttled (the
  // too-tight quota was their actual problem), but nothing caps the
  // dominant tenant's burst, so it keeps consuming a disproportionate
  // share and backend pressure stays elevated.
  {
    id: "quota-raised-burst-still-open",
    when: {
      triggerEquals: { policyEffectsVisible: true },
      controlAtLeast: { [PER_TENANT_QUOTA_KEY]: 400, [BURST_SIZE_KEY]: 800 },
      controlEquals: { [PRIORITY_CLASS_KEY]: "none" },
    },
    incidentState: "quota-raised-burst-open",
    values: {
      limiterHealth: "warning",
      rejectionRate: 4,
      legitimateTenantSuccessRate: 94,
      bursterShareOfCapacity: 51,
      backendUtilization: 70,
      limiterBucketUtilization: 60,
      customerSuccessRate: 90,
      rateLimitStatus: "protected",
      burstFairnessState: "not-applicable",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial relief: burst size tightened alone, per-tenant quota left
  // at the too-tight deployed default. The dominant tenant's spike is
  // capped (burster share drops), but ordinary legitimate tenants are
  // still being throttled by the untouched steady-state quota.
  {
    id: "burst-tightened-quota-still-tight",
    when: {
      triggerEquals: { policyEffectsVisible: true },
      controlAtMost: { [BURST_SIZE_KEY]: 200, [PER_TENANT_QUOTA_KEY]: 150 },
    },
    incidentState: "burst-tightened-quota-tight",
    values: {
      limiterHealth: "warning",
      rejectionRate: 22,
      legitimateTenantSuccessRate: 62,
      bursterShareOfCapacity: 16,
      backendUtilization: 41,
      limiterBucketUtilization: 30,
      customerSuccessRate: 71,
      rateLimitStatus: "protected",
      burstFairnessState: "not-applicable",
    },
    componentHealth: degradedHealth,
  },

  // ── Second wave, baseline deepening: nothing has been changed and
  // the dominant tenant's unchecked burst keeps growing, pushing more
  // legitimate tenants out of the too-tight quota entirely. Only
  // reachable once no mitigation above has matched.
  {
    id: "burst-domination-deepening-baseline",
    when: {
      triggerEquals: { policyEffectsVisible: true, burstDominationDeepening: true },
    },
    incidentState: "domination-deepening",
    values: {
      limiterHealth: "critical",
      rejectionRate: 34,
      legitimateTenantSuccessRate: 48,
      bursterShareOfCapacity: 79,
      backendUtilization: 93,
      limiterBucketUtilization: 90,
      customerSuccessRate: 58,
      rateLimitStatus: "protected",
      burstFairnessState: "not-applicable",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: the newly deployed policy's effects are
  // visible and the candidate has taken no meaningfully mitigating
  // action yet. Legitimate tenants are being throttled by the too-tight
  // quota; the dominant tenant is already taking a disproportionate
  // share under the wide-open burst allowance.
  {
    id: "newly-deployed-baseline",
    when: {
      triggerEquals: { policyEffectsVisible: true },
    },
    incidentState: "policy-misconfigured",
    values: {
      limiterHealth: "critical",
      rejectionRate: 24,
      legitimateTenantSuccessRate: 64,
      bursterShareOfCapacity: 58,
      backendUtilization: 81,
      limiterBucketUtilization: 76,
      customerSuccessRate: 70,
      rateLimitStatus: "protected",
      burstFairnessState: "not-applicable",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      limiterHealth: "normal",
      rejectionRate: 1,
      legitimateTenantSuccessRate: 99,
      bursterShareOfCapacity: 8,
      backendUtilization: 22,
      limiterBucketUtilization: 15,
      customerSuccessRate: 99,
      rateLimitStatus: "protected",
      burstFairnessState: "not-applicable",
    },
    componentHealth: healthyHealth,
  },
];
