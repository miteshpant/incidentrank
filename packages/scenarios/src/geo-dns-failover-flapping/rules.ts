import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  FORCE_PIN_REGION_KEY,
  HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY,
  HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY,
  INSPECT_DNS_FAILOVER_HISTORY_KEY,
  INSPECT_HEALTH_CHECK_LOGS_KEY,
  INSPECT_REGION_LATENCY_HISTORY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "global-clients": "healthy",
  "geo-dns": "healthy",
  "health-checker": "healthy",
  "region-east": "healthy",
  "region-west": "healthy",
};

const flappingHealth: Record<string, ComponentHealth> = {
  "global-clients": "degraded",
  "geo-dns": "critical",
  "health-checker": "degraded",
  "region-east": "healthy",
  "region-west": "healthy",
};

const pinnedHealth: Record<string, ComponentHealth> = {
  "global-clients": "healthy",
  "geo-dns": "degraded",
  "health-checker": "degraded",
  "region-east": "healthy",
  "region-west": "healthy",
};

const partiallyDampedHealth: Record<string, ComponentHealth> = {
  "global-clients": "degraded",
  "geo-dns": "degraded",
  "health-checker": "degraded",
  "region-east": "healthy",
  "region-west": "healthy",
};

/**
 * Authored rule table for GeoDNS Failover Flapping, ordered
 * most-specific-first per this codebase's existing convention. The real
 * root cause is health-check hysteresis: a single slow probe (one
 * failure) flips failover, and a single fast probe flips it right back,
 * so transient latency blips in either region — never a genuine
 * region-wide outage — keep re-triggering DNS failover in both
 * directions. Both regions individually stay "healthy" the entire
 * incident (the misleading signal): region p99 latency blips are real
 * but brief and self-resolving, never the actual problem a candidate
 * needs to fix. The actual fix is raising the required consecutive-
 * failure streak AND loosening the latency tolerance so a single blip
 * no longer counts as a health-check failure at all — i.e. flap-
 * damping/threshold tuning, never a capacity change.
 *
 * `forcePinRegion` is the plausible-but-inferior path: it does make the
 * flapping symptom disappear (DNS stops moving), but it does so by
 * disabling automated failover protection entirely, not by fixing the
 * oversensitive health check — a genuine region outage later would have
 * no automatic failover at all. Classified "neutral" in
 * action-classifications.ts, matching the authoring convention of
 * scoring the COST of a wrong turn in operationalEfficiency rather than
 * marking it "harmful" (it does not make the CURRENT incident worse).
 *
 * `diagnosisPath` captures what the candidate correlated by the time
 * they applied the fix (investigated health-check logs, region latency
 * history, and DNS failover history, vs. guessed the right thresholds
 * without investigating, vs. took the inferior pin-region shortcut),
 * read generically by scoring.ts via the existing finalStringEquals
 * measure — never a bespoke mechanism.
 */
export const flapDampingRules: Rule[] = [
  // ── Inferior path: force-pinned to one region. Stops the flap
  // symptom, but is not the real fix — classified neutral, scored via
  // its own diagnosisPath and a nonzero residual revenue-loss rate
  // (failover protection is gone, not "safe").
  {
    id: "forced-pin",
    when: {
      triggerEquals: { latencyBlipsActive: true },
      controlEquals: { [FORCE_PIN_REGION_KEY]: true },
    },
    incidentState: "flapping-pinned",
    values: {
      regionEastP99LatencyMs: 210,
      regionWestP99LatencyMs: 195,
      healthCheckFailureStreakCount: 1,
      dnsFailoverFlapCount: 1,
      clientConnectionResetRatePercent: 0.4,
      clientErrorRatePercent: 0.5,
      edgeCdnCacheHitRatePercent: 90,
      diagnosisPath: "forced-pin",
    },
    componentHealth: pinnedHealth,
  },

  // ── Best path: investigated health-check logs, region latency
  // history, and DNS failover history AND applied both halves of the
  // real fix (streak >= 3, tolerance >= 600ms). Flapping stops because
  // transient blips no longer register as health-check failures at all.
  {
    id: "correlated-then-fixed",
    when: {
      triggerEquals: { latencyBlipsActive: true },
      controlEquals: {
        [INSPECT_HEALTH_CHECK_LOGS_KEY]: true,
        [INSPECT_REGION_LATENCY_HISTORY_KEY]: true,
        [INSPECT_DNS_FAILOVER_HISTORY_KEY]: true,
      },
      controlAtLeast: {
        [HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY]: 3,
        [HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY]: 600,
      },
    },
    incidentState: "recovering",
    values: {
      regionEastP99LatencyMs: 200,
      regionWestP99LatencyMs: 195,
      healthCheckFailureStreakCount: 0,
      dnsFailoverFlapCount: 2,
      clientConnectionResetRatePercent: 0.3,
      clientErrorRatePercent: 0.3,
      edgeCdnCacheHitRatePercent: 92,
      diagnosisPath: "correlated-then-fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Correct fix, applied without investigating the correlation
  // first — the outage still resolves (the fix is the fix), but the
  // candidate never demonstrated they understood WHY, exactly what the
  // investigation-quality scoring dimension penalizes.
  {
    id: "guessed-fix",
    when: {
      triggerEquals: { latencyBlipsActive: true },
      controlAtLeast: {
        [HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY]: 3,
        [HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY]: 600,
      },
    },
    incidentState: "recovering",
    values: {
      regionEastP99LatencyMs: 200,
      regionWestP99LatencyMs: 195,
      healthCheckFailureStreakCount: 0,
      dnsFailoverFlapCount: 2,
      clientConnectionResetRatePercent: 0.3,
      clientErrorRatePercent: 0.3,
      edgeCdnCacheHitRatePercent: 92,
      diagnosisPath: "guessed-fix",
    },
    componentHealth: healthyHealth,
  },

  // ── Partial relief: only one half of the fix applied (e.g. streak
  // raised but tolerance left tight, or vice versa) — flapping slows
  // but does not stop, since a lone blip can still either trip a
  // too-tight tolerance or still accumulate a short streak.
  {
    id: "partially-damped",
    when: {
      triggerEquals: { latencyBlipsActive: true },
      controlAtLeast: { [HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY]: 3 },
      controlAtMost: { [HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY]: 300 },
    },
    incidentState: "partially-damped",
    values: {
      regionEastP99LatencyMs: 205,
      regionWestP99LatencyMs: 195,
      healthCheckFailureStreakCount: 1,
      dnsFailoverFlapCount: 9,
      clientConnectionResetRatePercent: 4,
      clientErrorRatePercent: 3.5,
      edgeCdnCacheHitRatePercent: 80,
      diagnosisPath: "partially-damped",
    },
    componentHealth: partiallyDampedHealth,
  },
  {
    id: "partially-damped-tolerance-only",
    when: {
      triggerEquals: { latencyBlipsActive: true },
      controlAtMost: { [HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY]: 2 },
      controlAtLeast: { [HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY]: 600 },
    },
    incidentState: "partially-damped",
    values: {
      regionEastP99LatencyMs: 205,
      regionWestP99LatencyMs: 195,
      healthCheckFailureStreakCount: 1,
      dnsFailoverFlapCount: 8,
      clientConnectionResetRatePercent: 3.5,
      clientErrorRatePercent: 3,
      edgeCdnCacheHitRatePercent: 81,
      diagnosisPath: "partially-damped",
    },
    componentHealth: partiallyDampedHealth,
  },

  // ── Baseline critical: transient blips active, no mitigation
  // applied yet. Region p99 latencies stay only mildly elevated (the
  // misleading-healthy-looking regions) — the actual damage is
  // entirely in DNS flap count and the resulting client-side connection
  // resets as every flap tears down in-flight connections.
  {
    id: "flapping-baseline",
    when: { triggerEquals: { latencyBlipsActive: true } },
    incidentState: "flapping",
    values: {
      regionEastP99LatencyMs: 240,
      regionWestP99LatencyMs: 195,
      healthCheckFailureStreakCount: 1,
      dnsFailoverFlapCount: 18,
      clientConnectionResetRatePercent: 9,
      clientErrorRatePercent: 7,
      edgeCdnCacheHitRatePercent: 68,
      diagnosisPath: "not-attempted",
    },
    componentHealth: flappingHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      regionEastP99LatencyMs: 180,
      regionWestP99LatencyMs: 190,
      healthCheckFailureStreakCount: 0,
      dnsFailoverFlapCount: 0,
      clientConnectionResetRatePercent: 0.2,
      clientErrorRatePercent: 0.3,
      edgeCdnCacheHitRatePercent: 92,
      diagnosisPath: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];
