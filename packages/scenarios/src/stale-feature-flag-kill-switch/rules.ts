import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
  INSPECT_FLAG_AUDIT_LOG_KEY,
  INSPECT_LEGACY_ENGINE_LOGS_KEY,
  RESTART_CHECKOUT_SERVICE_KEY,
  REVERT_UNRELATED_FLAG_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "web-frontend": "healthy",
  "feature-flag-service": "healthy",
  "checkout-service": "healthy",
  "legacy-pricing-engine": "healthy",
  "pricing-cache": "healthy",
};

const wokenHealth: Record<string, ComponentHealth> = {
  "web-frontend": "healthy",
  "feature-flag-service": "healthy",
  "checkout-service": "critical",
  "legacy-pricing-engine": "critical",
  "pricing-cache": "degraded",
};

const stillLatchedHealth: Record<string, ComponentHealth> = {
  "web-frontend": "healthy",
  "feature-flag-service": "healthy",
  "checkout-service": "degraded",
  "legacy-pricing-engine": "critical",
  "pricing-cache": "degraded",
};

/**
 * Authored rule table for Stale Feature-Flag Kill Switch (intermediate,
 * linear). This is deliberately a FLAG-HYGIENE-DEBT incident, not a
 * bad-new-deploy regression: `legacyPricingEngineKillSwitchEnabled` was
 * left wired into a live code path months ago and was never actually
 * removed. The incident does not begin because anything new was shipped
 * — it begins because an engineer flips a completely unrelated,
 * seemingly-safe flag (`newCheckoutLayoutFlagEnabled`, a UI rollout flag)
 * for a routine reason, and the flag-evaluation order in the feature-flag
 * service happens to re-enable the dormant legacy pricing engine as a
 * side effect. The bug itself shipped safely a long time ago and sat
 * completely inert; only this unrelated change wakes it.
 *
 * THE KEY LESSON (and the trap most candidates fall into): once the
 * legacy engine has been woken and starts actively computing mismatched
 * prices, simply reverting the flag that triggered the wake-up
 * (`newCheckoutLayoutFlagEnabled` back to false) does NOT put the legacy
 * engine back to sleep. The legacy engine's own kill switch
 * (`legacyPricingEngineKillSwitchEnabled`) is a SEPARATE, independent
 * piece of state that the wake-up event flipped on directly — reverting
 * the unrelated flag only stops the ORIGINAL trigger from firing again,
 * it does not address the now-independently-latched stale state. The
 * only real fix is addressing the stale flag itself.
 *
 * Restarting the checkout service is the other classic plausible-but-
 * inferior reflex: it clears the in-memory pricing cache for a moment
 * (a brief, cosmetic dip), but the legacy engine is still active on the
 * next request and the cache fills right back up with mismatched prices.
 *
 * `diagnosisPath` captures what the candidate actually did by
 * completion — read generically by scoring.ts via the existing
 * finalStringEquals measure, never a bespoke mechanism.
 */
export const staleFeatureFlagKillSwitchRules: Rule[] = [
  // ── Best path: investigated the flag audit log AND the legacy engine's
  // own logs, then applied the real fix (disabled the stale kill switch).
  {
    id: "investigated-then-fixed",
    when: {
      triggerEquals: { legacyEngineWoken: true },
      controlEquals: {
        [INSPECT_FLAG_AUDIT_LOG_KEY]: true,
        [INSPECT_LEGACY_ENGINE_LOGS_KEY]: true,
        [DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY]: true,
      },
    },
    incidentState: "recovering",
    values: {
      checkoutErrorRate: 0.2,
      checkoutLatencyMs: 92,
      priceMismatchRatePercent: 0,
      legacyPricingEngineTrafficSharePercent: 0,
      pricingCacheStaleEntryCount: 0,
      supportTicketBacklogCount: 34,
      diagnosisPath: "investigated-then-fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Correct fix, applied without investigating first (guessed the
  // stale-flag root cause, or got there after flailing). The outage
  // still fully resolves, but the candidate never demonstrated they
  // understood the flag-hygiene-debt mechanism.
  {
    id: "guessed-fix",
    when: {
      triggerEquals: { legacyEngineWoken: true },
      controlEquals: { [DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY]: true },
    },
    incidentState: "recovering",
    values: {
      checkoutErrorRate: 0.2,
      checkoutLatencyMs: 92,
      priceMismatchRatePercent: 0,
      legacyPricingEngineTrafficSharePercent: 0,
      pricingCacheStaleEntryCount: 0,
      supportTicketBacklogCount: 34,
      diagnosisPath: "guessed-fix",
    },
    componentHealth: healthyHealth,
  },

  // ── Inferior path A: restarted the checkout service only. The restart
  // clears the in-memory pricing cache for a moment, but the legacy
  // engine itself is still active — the cache refills with mismatched
  // prices on the very next round of checkout traffic.
  {
    id: "restarted-service-only",
    when: {
      triggerEquals: { legacyEngineWoken: true },
      controlEquals: {
        [RESTART_CHECKOUT_SERVICE_KEY]: true,
        [DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY]: false,
      },
    },
    incidentState: "degraded",
    values: {
      checkoutErrorRate: 2.4,
      checkoutLatencyMs: 140,
      priceMismatchRatePercent: 9,
      legacyPricingEngineTrafficSharePercent: 100,
      pricingCacheStaleEntryCount: 180,
      supportTicketBacklogCount: 96,
      diagnosisPath: "restarted-service-only",
    },
    componentHealth: stillLatchedHealth,
  },

  // ── Inferior path B (the central trap): reverted the unrelated flag
  // that triggered the wake-up, but never touched the legacy engine's
  // own kill switch. The original trigger is gone, but the stale flag
  // latched independently when it woke — reverting the trigger does
  // NOT put it back to sleep. This is the scenario's required proof
  // that flag-hygiene debt, once woken, outlives the change that woke
  // it.
  {
    id: "reverted-unrelated-flag-only",
    when: {
      triggerEquals: { legacyEngineWoken: true },
      controlEquals: {
        [REVERT_UNRELATED_FLAG_KEY]: false,
        [DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY]: false,
      },
    },
    incidentState: "degraded",
    values: {
      checkoutErrorRate: 3.1,
      checkoutLatencyMs: 150,
      priceMismatchRatePercent: 11,
      legacyPricingEngineTrafficSharePercent: 100,
      pricingCacheStaleEntryCount: 210,
      supportTicketBacklogCount: 104,
      diagnosisPath: "reverted-unrelated-flag-only",
    },
    componentHealth: stillLatchedHealth,
  },

  // ── Baseline critical: legacy engine woken, nothing addressed yet.
  {
    id: "woken-baseline",
    when: { triggerEquals: { legacyEngineWoken: true } },
    incidentState: "woken",
    values: {
      checkoutErrorRate: 4.8,
      checkoutLatencyMs: 170,
      priceMismatchRatePercent: 14,
      legacyPricingEngineTrafficSharePercent: 100,
      pricingCacheStaleEntryCount: 260,
      supportTicketBacklogCount: 118,
      diagnosisPath: "not-attempted",
    },
    componentHealth: wokenHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      checkoutErrorRate: 0.2,
      checkoutLatencyMs: 90,
      priceMismatchRatePercent: 0,
      legacyPricingEngineTrafficSharePercent: 0,
      pricingCacheStaleEntryCount: 0,
      supportTicketBacklogCount: 12,
      diagnosisPath: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];
