import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: both degradations begin concurrently. Token
// Verification is never touched by either timed event — it stays
// healthy the entire incident, a real candidate-relevant signal that
// should not be mistaken for "everything is fine."
export const DEGRADATION_ONSET_MS = 30_000;

// If left unaddressed this long, session-store pressure has compounded
// (more concurrent re-auth attempts, more MFA retries hammering an
// already-degraded provider) into a materially worse band.
export const SUSTAINED_PRESSURE_MS = DEGRADATION_ONSET_MS + 4 * 60_000;

// The MFA Provider begins its own independent recovery on a fixed
// clock, regardless of anything the candidate does to login/session
// controls — but recovery is gradual (recovery-lag), not instant, and
// candidate choices during the window before full recovery still
// determine how much session-store pressure and historical security
// damage accrued.
export const MFA_PROVIDER_RECOVERING_MS = DEGRADATION_ONSET_MS + 8 * 60_000;
export const MFA_PROVIDER_RECOVERED_MS = MFA_PROVIDER_RECOVERING_MS + 3 * 60_000;

// Session-store pressure relief windows (recovery-lag binding,
// phase6d3.md section 14): once the candidate has engaged a genuine
// relief lever (sessionCacheMode = relief-eviction, or
// loginConcurrencyLimit = throttled), pressure does not drop to zero
// on the next tick — it decays across these three successive, real-
// elapsed-time windows. Anchored AFTER MFA_PROVIDER_RECOVERED_MS (not
// from absolute simulation-start 0, and not from DEGRADATION_ONSET_MS)
// so the "draining" family in rules.ts — which gates on
// mfaProviderRecovered === true together with these elapsed-relief
// triggers — is reachable at all: a candidate who engages relief
// exactly when the provider fully recovers (the earliest possible
// moment, right at MFA_PROVIDER_RECOVERED_MS) experiences these as "N
// minutes after I started relieving," which is what this scenario's
// recovery-lag narrative requires. rules.ts additionally gates on the
// relief controls actually being set — a candidate who never engages
// a relief lever never matches any relief-tier rule no matter how
// many of these triggers have fired.
export const RELIEF_WINDOW_1_MS = MFA_PROVIDER_RECOVERED_MS + 2 * 60_000;
export const RELIEF_WINDOW_2_MS = MFA_PROVIDER_RECOVERED_MS + 5 * 60_000;
export const RELIEF_WINDOW_FULLY_RELIEVED_MS = MFA_PROVIDER_RECOVERED_MS + 9 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "identity-degradation-onset",
    atMs: DEGRADATION_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "The MFA Provider has begun returning elevated latency and intermittent failures, while Session Store write/lookup pressure is independently rising. Token Verification remains fully healthy.",
    setTriggers: { mfaProviderDegraded: true, sessionStorePressureRising: true },
  },
  {
    id: "sustained-pressure",
    atMs: SUSTAINED_PRESSURE_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "Session Store pressure and MFA Provider load have compounded into a materially worse state.",
    setTriggers: {
      mfaProviderDegraded: true,
      sessionStorePressureRising: true,
      sustainedPressure: true,
    },
  },
  {
    id: "mfa-provider-recovering",
    atMs: MFA_PROVIDER_RECOVERING_MS,
    type: "TRIGGER_SET",
    message: "The MFA Provider has begun recovering, but is not yet fully healthy.",
    setTriggers: {
      mfaProviderDegraded: false,
      mfaProviderRecovering: true,
      sessionStorePressureRising: true,
      sustainedPressure: true,
    },
  },
  {
    id: "mfa-provider-recovered",
    atMs: MFA_PROVIDER_RECOVERED_MS,
    type: "TRIGGER_SET",
    message: "The MFA Provider has fully recovered.",
    setTriggers: {
      mfaProviderDegraded: false,
      mfaProviderRecovering: false,
      mfaProviderRecovered: true,
      sessionStorePressureRising: true,
      sustainedPressure: true,
    },
  },
  // NOTE: relief-window triggers below fire unconditionally on
  // wall-clock atMs, exactly like every other timed event in this
  // engine. rules.ts is what makes them meaningful only once the
  // candidate has actually engaged a genuine relief lever.
  {
    id: "relief-window-1-elapsed",
    atMs: RELIEF_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first session-store relief window has elapsed.",
    setTriggers: { reliefWindow1Elapsed: true },
  },
  {
    id: "relief-window-2-elapsed",
    atMs: RELIEF_WINDOW_2_MS,
    type: "TRIGGER_SET",
    message: "A second session-store relief window has elapsed.",
    setTriggers: { reliefWindow1Elapsed: true, reliefWindow2Elapsed: true },
  },
  {
    id: "relief-window-fully-relieved-elapsed",
    atMs: RELIEF_WINDOW_FULLY_RELIEVED_MS,
    type: "TRIGGER_SET",
    message: "Enough relief time has elapsed for a fully-engaged relief process to have drained session-store pressure to baseline.",
    setTriggers: {
      reliefWindow1Elapsed: true,
      reliefWindow2Elapsed: true,
      reliefWindowFullyRelievedElapsed: true,
    },
  },
];
