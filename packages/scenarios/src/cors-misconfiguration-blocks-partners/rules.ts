import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CORS_ALLOWED_ORIGINS_MODE_KEY,
  INSPECT_CORS_POLICY_DIFF_KEY,
  INSPECT_PARTNER_ERROR_LOGS_KEY,
  INSPECT_PREFLIGHT_RESPONSES_KEY,
  RESTART_PARTNER_INTEGRATION_SERVICE_KEY,
  ROTATE_PARTNER_API_KEYS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "internal-web-app": "healthy",
  "partner-api-gateway": "healthy",
  "cors-policy-enforcer": "healthy",
  "partner-integration-service": "healthy",
};

const blockedHealth: Record<string, ComponentHealth> = {
  "internal-web-app": "healthy",
  "partner-api-gateway": "degraded",
  "cors-policy-enforcer": "critical",
  "partner-integration-service": "critical",
};

const overcorrectedHealth: Record<string, ComponentHealth> = {
  "internal-web-app": "healthy",
  "partner-api-gateway": "healthy",
  "cors-policy-enforcer": "critical",
  "partner-integration-service": "healthy",
};

/**
 * Authored rule table for the CORS Misconfiguration Blocks Partner
 * Integrations incident. The "fix" that caused the incident (a security-
 * hardening change restricting CORS to internal origins only) IS the
 * regression — this is what distinguishes the lesson here from auth
 * degradation (a dependency failing), authz rollout failures (a policy
 * engine bug), cert expiry (an operational lapse), and privilege
 * escalation (a stale-cache security hole): nothing here is "broken" in
 * the usual sense. The system is doing exactly what the new policy says.
 * The candidate must recognize that a legitimate security change
 * produced an availability regression for a legitimate caller, and that
 * the two most tempting "fast" fixes — rotating partner API keys, or
 * restarting the integration service — do nothing, because neither the
 * keys nor the service process were ever the problem: it's a browser-
 * enforced CORS preflight rejection happening before any application
 * code (or API key) is ever evaluated.
 *
 * `internalWebAppErrorRatePercent` never moves during the incident — the
 * misleading-healthy signal: the internal web app calls the same
 * backend, but is a same-origin (or already-allowlisted) caller, so the
 * hardening change never touches it. A candidate checking only "is the
 * site up" sees nothing wrong.
 *
 * The `wildcard-open` control value is the central trap: setting
 * Access-Control-Allow-Origin to `*` (or reflecting any Origin) does
 * make `partnerApiErrorRatePercent` and `partnerCorsPreflightRejectionRatePercent`
 * drop to pre-incident levels — from a dashboard alone this looks like a
 * full recovery — but it reopens the API to every origin on the internet,
 * not just the known partners, which is a strictly worse security
 * posture than the original pre-hardening state. `corsPolicyStatus` goes
 * "critical" in this branch specifically so successCondition (which
 * checks it) can never be satisfied this way, mirroring how
 * authentication-service-degradation's signature-verification-bypass
 * path is scored.
 *
 * `diagnosisPath` captures what the candidate correlated by the time they
 * applied the fix — read generically by scoring.ts via the existing
 * finalStringEquals measure, and by the post-incident narrative via
 * roleInIncident-tagged metrics (candidate-ui.ts).
 */
export const corsMisconfigurationRules: Rule[] = [
  // ── Best path: investigated the policy diff, the partner error logs,
  // and the preflight responses, THEN allowlisted the partner origins
  // (the real fix — re-admit the specific legitimate callers without
  // reopening the API to the world).
  {
    id: "correlated-then-fixed",
    when: {
      triggerEquals: { corsHardeningLive: true },
      controlEquals: {
        [INSPECT_CORS_POLICY_DIFF_KEY]: true,
        [INSPECT_PARTNER_ERROR_LOGS_KEY]: true,
        [INSPECT_PREFLIGHT_RESPONSES_KEY]: true,
        [CORS_ALLOWED_ORIGINS_MODE_KEY]: "allowlist-partners",
      },
    },
    incidentState: "recovering",
    values: {
      internalWebAppErrorRatePercent: 0.2,
      partnerCorsPreflightRejectionRatePercent: 1,
      partnerApiErrorRatePercent: 1,
      partnerIntegrationRequestVolumePercent: 99,
      cdnCacheHitRatePercent: 90,
      corsPolicyStatus: "normal",
      diagnosisPath: "correlated-then-fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Correct fix, applied without demonstrating the investigation
  // (e.g. allowlisted on a guess, or after inspecting only one of the
  // three signal sources). The outage still resolves — the fix is the
  // fix — but the candidate never showed they understood why.
  {
    id: "guessed-fix",
    when: {
      triggerEquals: { corsHardeningLive: true },
      controlEquals: { [CORS_ALLOWED_ORIGINS_MODE_KEY]: "allowlist-partners" },
    },
    incidentState: "recovering",
    values: {
      internalWebAppErrorRatePercent: 0.2,
      partnerCorsPreflightRejectionRatePercent: 1,
      partnerApiErrorRatePercent: 1,
      partnerIntegrationRequestVolumePercent: 99,
      cdnCacheHitRatePercent: 90,
      corsPolicyStatus: "normal",
      diagnosisPath: "guessed-fix",
    },
    componentHealth: healthyHealth,
  },

  // ── The trap: wildcard-open "fixes" the error rate but is a security
  // regression — worse than the original pre-incident policy, since it
  // now admits every origin, not just the known partners.
  {
    id: "wildcard-overcorrection",
    when: {
      triggerEquals: { corsHardeningLive: true },
      controlEquals: { [CORS_ALLOWED_ORIGINS_MODE_KEY]: "wildcard-open" },
    },
    incidentState: "security-regressed",
    values: {
      internalWebAppErrorRatePercent: 0.2,
      partnerCorsPreflightRejectionRatePercent: 1,
      partnerApiErrorRatePercent: 1,
      partnerIntegrationRequestVolumePercent: 100,
      cdnCacheHitRatePercent: 90,
      corsPolicyStatus: "critical",
      diagnosisPath: "wildcard-overcorrection",
    },
    componentHealth: overcorrectedHealth,
  },

  // ── Inferior path A: rotated partner API keys only. Plausible — partner
  // auth issues often look like this — but the preflight rejection
  // happens in the browser before the API key is ever read by the
  // server, so nothing improves.
  {
    id: "rotated-keys-only",
    when: {
      triggerEquals: { corsHardeningLive: true },
      controlEquals: {
        [ROTATE_PARTNER_API_KEYS_KEY]: true,
        [CORS_ALLOWED_ORIGINS_MODE_KEY]: "strict-internal-only",
      },
    },
    incidentState: "blocked",
    values: {
      internalWebAppErrorRatePercent: 0.2,
      partnerCorsPreflightRejectionRatePercent: 96,
      partnerApiErrorRatePercent: 94,
      partnerIntegrationRequestVolumePercent: 6,
      cdnCacheHitRatePercent: 93,
      corsPolicyStatus: "critical",
      diagnosisPath: "rotated-keys-only",
    },
    componentHealth: blockedHealth,
  },

  // ── Inferior path B: restarted the partner integration service only.
  // Plausible — "has it just wedged" is a reasonable first guess — but
  // the service process was never unhealthy; the browser never even
  // reaches it.
  {
    id: "restarted-service-only",
    when: {
      triggerEquals: { corsHardeningLive: true },
      controlEquals: {
        [RESTART_PARTNER_INTEGRATION_SERVICE_KEY]: true,
        [CORS_ALLOWED_ORIGINS_MODE_KEY]: "strict-internal-only",
      },
    },
    incidentState: "blocked",
    values: {
      internalWebAppErrorRatePercent: 0.2,
      partnerCorsPreflightRejectionRatePercent: 97,
      partnerApiErrorRatePercent: 95,
      partnerIntegrationRequestVolumePercent: 5,
      cdnCacheHitRatePercent: 93,
      corsPolicyStatus: "critical",
      diagnosisPath: "restarted-service-only",
    },
    componentHealth: blockedHealth,
  },

  // ── Baseline critical: hardening is live, nothing has been attempted
  // yet. Internal web app is deliberately unaffected (same-origin /
  // already-allowlisted) — the misleading-healthy signal the candidate
  // must notice is NOT proof the system is fine.
  {
    id: "blocked-baseline",
    when: { triggerEquals: { corsHardeningLive: true } },
    incidentState: "blocked",
    values: {
      internalWebAppErrorRatePercent: 0.2,
      partnerCorsPreflightRejectionRatePercent: 98,
      partnerApiErrorRatePercent: 96,
      partnerIntegrationRequestVolumePercent: 4,
      cdnCacheHitRatePercent: 93,
      corsPolicyStatus: "critical",
      diagnosisPath: "not-attempted",
    },
    componentHealth: blockedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      internalWebAppErrorRatePercent: 0.2,
      partnerCorsPreflightRejectionRatePercent: 1,
      partnerApiErrorRatePercent: 1,
      partnerIntegrationRequestVolumePercent: 100,
      cdnCacheHitRatePercent: 92,
      corsPolicyStatus: "normal",
      diagnosisPath: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];
