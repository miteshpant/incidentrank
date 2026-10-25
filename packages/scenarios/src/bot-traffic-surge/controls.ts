import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Coarse, blunt friction applied to ALL traffic at the edge regardless of
 * how confident the classification is. "light" adds a cheap, low-friction
 * check; "aggressive" adds heavy friction (e.g. hard interactive
 * challenges) to a much wider slice of traffic to maximize bot rejection.
 * Per the scenario's binding design requirement, "aggressive" cuts
 * suspicious traffic and backend load hardest, but it also challenges/
 * blocks a meaningful share of genuine customers who simply look
 * unusual to a coarse heuristic (new device, corporate NAT, VPN,
 * automation-adjacent but legitimate integration traffic) — the real
 * false-positive cost this scenario exists to make visible.
 */
export const CHALLENGE_POLICY_KEY = "challengePolicy";

/**
 * A coarse, global request-rate ceiling applied uniformly at the edge.
 * "strict" cuts overall volume hard (including bot volume), but it
 * applies identically to every caller, so legitimate high-volume
 * integrations and busy real customers get throttled right alongside
 * the bots — another coarse, blunt lever with a real collateral cost.
 */
export const RATE_LIMIT_TIER_KEY = "rateLimitTier";

/**
 * Enables behavioral/fingerprint sampling across the request stream —
 * request timing shape, header/TLS fingerprint consistency, navigation
 * pattern — that endpoint protection and tenant quotas can use to target
 * their decisions instead of guessing. This control produces no
 * mitigation on its own; it is a precondition that makes the targeted
 * controls below meaningfully precise rather than blind.
 */
export const TRAFFIC_SAMPLING_ENABLED_KEY = "trafficSamplingEnabled";

/**
 * Scope of protection applied to the small set of expensive, abuse-prone
 * endpoints (search, account lookup, pricing) rather than the whole API
 * surface. "global" is really just the coarse challenge/rate-limit
 * levers applied everywhere; "targeted" restricts friction to the
 * specific endpoints bots are actually hitting hardest, and is only as
 * precise as the sampling data backing it — enabling it without traffic
 * sampling means the "targeting" is really still a guess.
 */
export const ENDPOINT_PROTECTION_SCOPE_KEY = "endpointProtectionScope";

/**
 * Per-identity (API key / authenticated account) request quota
 * enforcement. Catches bots that distribute across many source IPs but
 * still reuse, lack, or cycle through credentials/sessions, without
 * touching traffic from identities that are behaving normally — a
 * genuinely identity-scoped lever rather than a traffic-wide one.
 */
export const TENANT_QUOTA_ENFORCEMENT_KEY = "tenantQuotaEnforcement";

/**
 * Edge cache aggressiveness for cacheable, read-like requests. Absorbs a
 * meaningful share of repeated bot requests (and legitimate repeat
 * requests) before they ever reach the API/core services, lowering
 * backend load without making any classification decision at all — a
 * real, complementary, classification-free lever, not a substitute for
 * one.
 */
export const CACHE_AGGRESSIVENESS_KEY = "cacheAggressiveness";

export const controls: ControlDefinition[] = [
  {
    key: CHALLENGE_POLICY_KEY,
    allowedValues: ["off", "light", "aggressive"],
    initialValue: "off",
  },
  {
    key: RATE_LIMIT_TIER_KEY,
    allowedValues: ["normal", "strict"],
    initialValue: "normal",
  },
  {
    key: TRAFFIC_SAMPLING_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: ENDPOINT_PROTECTION_SCOPE_KEY,
    allowedValues: ["none", "global", "targeted"],
    initialValue: "none",
  },
  {
    key: TENANT_QUOTA_ENFORCEMENT_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: CACHE_AGGRESSIVENESS_KEY,
    allowedValues: ["normal", "elevated"],
    initialValue: "normal",
  },
];
