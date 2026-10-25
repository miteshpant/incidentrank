import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CACHE_AGGRESSIVENESS_KEY,
  CHALLENGE_POLICY_KEY,
  ENDPOINT_PROTECTION_SCOPE_KEY,
  RATE_LIMIT_TIER_KEY,
  TENANT_QUOTA_ENFORCEMENT_KEY,
  TRAFFIC_SAMPLING_ENABLED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "internet-traffic": "healthy",
  "edge-gateway": "healthy",
  api: "healthy",
  "core-services": "healthy",
};

const edgeDegradedHealth: Record<string, ComponentHealth> = {
  "internet-traffic": "healthy",
  "edge-gateway": "degraded",
  api: "degraded",
  "core-services": "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "internet-traffic": "healthy",
  "edge-gateway": "critical",
  api: "critical",
  "core-services": "degraded",
};

// Edge/API relieved by coarse blocking, but the collateral damage to
// real customers is the thing that is actually unsafe here.
const coarseBlockedHealth: Record<string, ComponentHealth> = {
  "internet-traffic": "healthy",
  "edge-gateway": "degraded",
  api: "healthy",
  "core-services": "healthy",
};

/**
 * Authored rule table for Bot Traffic Surge, ordered most-specific first.
 * Automated traffic rises sharply and closely resembles legitimate usage
 * (realistic user-agents, many source IPs, normal-looking request
 * shapes). The scenario's binding tradeoff: a coarse, blunt defense
 * (aggressive challenge policy and/or a strict global rate limit)
 * suppresses bot load effectively, but it applies identically to every
 * caller, so it measurably increases falsePositiveRatePct and depresses
 * customerSuccessRatePct — real customers get challenged/blocked too. A
 * targeted defense (traffic sampling informing endpoint-scoped
 * protection, plus per-identity tenant quotas) achieves comparable
 * backend protection with a far lower false-positive cost, because it
 * acts on who/what is actually suspicious rather than on all traffic
 * uniformly. Neither path is free: the targeted path requires sampling
 * to be enabled first (an honest precondition, not a trick), and cache
 * alone only ever provides partial relief since bot traffic generates
 * enough non-cacheable/unique-looking requests to keep hitting the
 * backend directly.
 */
export const botTrafficSurgeRules: Rule[] = [
  // ── Optimal recovery: targeted defense. Traffic sampling is enabled
  // (so classification has real signal), endpoint protection is scoped
  // to the specific abuse-prone endpoints, and tenant quota enforcement
  // catches bots that rotate IPs but still reuse/lack credentials.
  // Backend load and suspicious-traffic ratio both drop hard, while
  // falsePositiveRatePct stays near zero because no blunt, traffic-wide
  // friction was ever applied. Checked first so it wins over every other
  // control combination once the full targeted stack is live.
  {
    id: "targeted-defense-recovery",
    when: {
      triggerEquals: { botSurgeRising: true },
      controlEquals: {
        [TRAFFIC_SAMPLING_ENABLED_KEY]: true,
        [ENDPOINT_PROTECTION_SCOPE_KEY]: "targeted",
        [TENANT_QUOTA_ENFORCEMENT_KEY]: true,
      },
    },
    incidentState: "targeted-recovered",
    values: {
      requestVolumePerSec: 950,
      suspiciousTrafficRatioPct: 5,
      customerSuccessRatePct: 99.4,
      falsePositiveRatePct: 0.2,
      backendLoadPct: 24,
      rateLimitBlocksPerSec: 40,
      trafficStatus: "normal",
      defenseMode: "targeted",
    },
    componentHealth: healthyHealth,
  },

  // ── Harmful: aggressive coarse challenge policy AND a strict global
  // rate limit stacked together, with no targeting signal behind either.
  // Suspicious traffic and backend load drop hard — the platform looks
  // protected — but falsePositiveRatePct spikes and customerSuccessRatePct
  // falls, because the friction is applied identically to bots and real
  // customers alike. This is the scenario's binding design requirement:
  // the blunter the defense, the worse the collateral damage, even
  // though the surface metrics (backend load) look great.
  {
    id: "aggressive-coarse-blocking-harms-customers",
    when: {
      triggerEquals: { botSurgeRising: true },
      controlEquals: {
        [CHALLENGE_POLICY_KEY]: "aggressive",
        [RATE_LIMIT_TIER_KEY]: "strict",
      },
    },
    incidentState: "coarse-blocked-high-collateral",
    values: {
      requestVolumePerSec: 420,
      suspiciousTrafficRatioPct: 8,
      customerSuccessRatePct: 88.5,
      falsePositiveRatePct: 14.5,
      backendLoadPct: 19,
      rateLimitBlocksPerSec: 540,
      trafficStatus: "warning",
      defenseMode: "coarse-blocked",
    },
    componentHealth: coarseBlockedHealth,
  },

  // ── Acceptable, bounded tradeoff: aggressive challenge policy alone
  // (no strict global rate limit stacked on top). Backend load and
  // suspicious-traffic ratio both come down meaningfully, but
  // falsePositiveRatePct still rises to a real, visible cost because
  // "aggressive" friction is still applied to all traffic, not just
  // traffic with real signal behind it.
  {
    id: "aggressive-challenge-alone-bounded-tradeoff",
    when: {
      triggerEquals: { botSurgeRising: true },
      controlEquals: { [CHALLENGE_POLICY_KEY]: "aggressive", [RATE_LIMIT_TIER_KEY]: "normal" },
    },
    incidentState: "coarse-challenge-bounded",
    values: {
      requestVolumePerSec: 560,
      suspiciousTrafficRatioPct: 10,
      customerSuccessRatePct: 93.0,
      falsePositiveRatePct: 6.5,
      backendLoadPct: 28,
      rateLimitBlocksPerSec: 10,
      trafficStatus: "warning",
      defenseMode: "coarse-blocked",
    },
    componentHealth: edgeDegradedHealth,
  },

  // ── Harmful/incomplete: strict global rate limit alone. Overall
  // volume drops (bots included), but the limit applies uniformly, so
  // legitimate high-volume integrations and busy real customers get
  // throttled right alongside the bots; backend load barely improves
  // because the surviving (unthrottled-by-identity) bot traffic still
  // reaches the backend, and suspicious-traffic ratio barely moves
  // because nothing actually discriminated bot from human.
  {
    id: "strict-global-limit-alone-collateral-without-protection",
    when: {
      triggerEquals: { botSurgeRising: true },
      controlEquals: { [RATE_LIMIT_TIER_KEY]: "strict", [CHALLENGE_POLICY_KEY]: "off" },
    },
    incidentState: "strict-limit-collateral",
    values: {
      requestVolumePerSec: 500,
      suspiciousTrafficRatioPct: 34,
      customerSuccessRatePct: 90.5,
      falsePositiveRatePct: 9.0,
      backendLoadPct: 55,
      rateLimitBlocksPerSec: 480,
      trafficStatus: "warning",
      defenseMode: "coarse-blocked",
    },
    componentHealth: edgeDegradedHealth,
  },

  // ── Partial relief: elevated cache aggressiveness alone, no
  // classification lever touched at all. Absorbs a meaningful share of
  // repeated, cacheable-looking bot requests before they reach the
  // backend, giving genuine but incomplete relief — bot traffic still
  // generates plenty of unique/non-cacheable request shapes that keep
  // hitting the backend directly, so suspicious-traffic ratio barely
  // moves and the system stays degraded rather than critical.
  {
    id: "elevated-cache-partial-relief",
    when: {
      triggerEquals: { botSurgeRising: true },
      controlEquals: {
        [CACHE_AGGRESSIVENESS_KEY]: "elevated",
        [CHALLENGE_POLICY_KEY]: "off",
        [RATE_LIMIT_TIER_KEY]: "normal",
        [ENDPOINT_PROTECTION_SCOPE_KEY]: "none",
      },
    },
    incidentState: "cache-absorbing-partial",
    values: {
      requestVolumePerSec: 2_400,
      suspiciousTrafficRatioPct: 30,
      customerSuccessRatePct: 97.5,
      falsePositiveRatePct: 0,
      backendLoadPct: 52,
      rateLimitBlocksPerSec: 0,
      trafficStatus: "warning",
      defenseMode: "unresolved",
    },
    componentHealth: edgeDegradedHealth,
  },

  // ── Incomplete/misconfigured targeting: endpoint protection is set to
  // "targeted" but traffic sampling was never enabled, so the
  // "targeting" has no real signal behind it — it behaves like a blind
  // guess rather than a precise defense. Some endpoints get protected,
  // some bot traffic slips through, and false positives still occur on
  // the endpoints it guessed wrong about, without reaching the full
  // targeted-recovery outcome.
  {
    id: "targeted-scope-without-sampling-is-a-guess",
    when: {
      triggerEquals: { botSurgeRising: true },
      controlEquals: {
        [ENDPOINT_PROTECTION_SCOPE_KEY]: "targeted",
        [TRAFFIC_SAMPLING_ENABLED_KEY]: false,
      },
    },
    incidentState: "targeting-without-signal",
    values: {
      requestVolumePerSec: 1_900,
      suspiciousTrafficRatioPct: 22,
      customerSuccessRatePct: 95.0,
      falsePositiveRatePct: 3.2,
      backendLoadPct: 44,
      rateLimitBlocksPerSec: 60,
      trafficStatus: "warning",
      defenseMode: "unresolved",
    },
    componentHealth: edgeDegradedHealth,
  },

  // ── Acceptable, bounded tradeoff: tenant quota enforcement alone
  // (identity-scoped, not traffic-wide), without full endpoint targeting.
  // Catches a real share of bots that reuse/lack valid credentials across
  // their many source IPs, with no measurable false-positive cost — but
  // bot traffic that manages to acquire/rotate valid-looking credentials
  // still gets through, so protection is real but partial.
  {
    id: "tenant-quota-alone-identity-scoped-partial",
    when: {
      triggerEquals: { botSurgeRising: true },
      controlEquals: {
        [TENANT_QUOTA_ENFORCEMENT_KEY]: true,
        [CHALLENGE_POLICY_KEY]: "off",
        [RATE_LIMIT_TIER_KEY]: "normal",
      },
    },
    incidentState: "tenant-quota-partial",
    values: {
      requestVolumePerSec: 1_700,
      suspiciousTrafficRatioPct: 18,
      customerSuccessRatePct: 98.5,
      falsePositiveRatePct: 0.1,
      backendLoadPct: 38,
      rateLimitBlocksPerSec: 180,
      trafficStatus: "warning",
      defenseMode: "unresolved",
    },
    componentHealth: edgeDegradedHealth,
  },

  // ── Second wave, baseline: the bot operator escalates further once
  // no mitigation has been applied. Only reachable once nothing above
  // has matched.
  {
    id: "bot-surge-escalating-baseline",
    when: { triggerEquals: { botSurgeRising: true, botSurgeEscalating: true } },
    incidentState: "bot-surge-escalated",
    values: {
      requestVolumePerSec: 6_200,
      suspiciousTrafficRatioPct: 62,
      customerSuccessRatePct: 81.0,
      falsePositiveRatePct: 0,
      backendLoadPct: 96,
      rateLimitBlocksPerSec: 0,
      trafficStatus: "critical",
      defenseMode: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: bot traffic is rising and the candidate has
  // taken no meaningfully mitigating action yet.
  {
    id: "bot-surge-baseline",
    when: { triggerEquals: { botSurgeRising: true } },
    incidentState: "bot-surge-rising",
    values: {
      requestVolumePerSec: 3_400,
      suspiciousTrafficRatioPct: 46,
      customerSuccessRatePct: 90.0,
      falsePositiveRatePct: 0,
      backendLoadPct: 78,
      rateLimitBlocksPerSec: 0,
      trafficStatus: "critical",
      defenseMode: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestVolumePerSec: 900,
      suspiciousTrafficRatioPct: 6,
      customerSuccessRatePct: 99.5,
      falsePositiveRatePct: 0,
      backendLoadPct: 22,
      rateLimitBlocksPerSec: 0,
      trafficStatus: "normal",
      defenseMode: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
