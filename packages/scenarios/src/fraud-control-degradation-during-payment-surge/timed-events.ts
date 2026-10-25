import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: a legitimate peak traffic event (e.g. a flash sale)
// begins, and the External Risk Provider's own latency/failure
// degradation begins at the same moment — two concurrent, independently
// caused conditions, not one. The peak event itself is NOT the problem
// (business invariant #1: legitimate peak availability is valuable);
// the problem is that fraud screening is degrading exactly when
// transaction volume is highest. The Ledger is never touched by either
// timed event — it stays healthy the entire incident, the scenario's
// decoy-healthy signal.
export const SURGE_ONSET_MS = 30_000;

// If left unaddressed this long, manual-review-queue backlog and
// provider load have compounded (more transactions held, more retries
// hammering an already-degraded provider) into a materially worse band.
export const SUSTAINED_SURGE_MS = SURGE_ONSET_MS + 4 * 60_000;

// The External Risk Provider begins its own independent recovery on a
// fixed clock, regardless of anything the candidate does to fraud
// controls — but recovery is gradual (recovery-lag), not instant, and
// candidate choices during the window before full recovery still
// determine how much queue backlog and historical risk exposure
// accrued.
export const RISK_PROVIDER_RECOVERING_MS = SURGE_ONSET_MS + 8 * 60_000;
export const RISK_PROVIDER_RECOVERED_MS = RISK_PROVIDER_RECOVERING_MS + 3 * 60_000;

// Manual-review-queue drain windows (recovery-lag binding,
// phase-6e-strategy-spec.md section 11/the identity-platform-
// degradation precedent): once the candidate has engaged a genuine
// queue-relief lever (manualReviewQueuePriority = risk-weighted, or the
// circuit breaker routing load away from the provider), queue depth
// does not drop to baseline on the next tick — it decays across these
// three successive, real-elapsed-time windows. Anchored AFTER
// RISK_PROVIDER_RECOVERED_MS so the "draining" family in rules.ts —
// which gates on riskProviderRecovered === true together with these
// elapsed-drain triggers — is reachable at all.
export const DRAIN_WINDOW_1_MS = RISK_PROVIDER_RECOVERED_MS + 2 * 60_000;
export const DRAIN_WINDOW_2_MS = RISK_PROVIDER_RECOVERED_MS + 5 * 60_000;
export const DRAIN_WINDOW_FULLY_DRAINED_MS = RISK_PROVIDER_RECOVERED_MS + 9 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "surge-onset",
    atMs: SURGE_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "A legitimate peak traffic event has begun driving checkout volume sharply higher, while the External Risk Provider has independently begun returning elevated latency and intermittent failures. Ledger write success remains fully healthy.",
    setTriggers: { riskProviderDegraded: true, queuePressureRising: true },
  },
  {
    id: "sustained-surge",
    atMs: SUSTAINED_SURGE_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "Manual-review-queue backlog and External Risk Provider load have compounded into a materially worse state.",
    setTriggers: {
      riskProviderDegraded: true,
      queuePressureRising: true,
      sustainedSurge: true,
    },
  },
  {
    id: "risk-provider-recovering",
    atMs: RISK_PROVIDER_RECOVERING_MS,
    type: "TRIGGER_SET",
    message: "The External Risk Provider has begun recovering, but is not yet fully healthy.",
    setTriggers: {
      riskProviderDegraded: false,
      riskProviderRecovering: true,
      queuePressureRising: true,
      sustainedSurge: true,
    },
  },
  {
    id: "risk-provider-recovered",
    atMs: RISK_PROVIDER_RECOVERED_MS,
    type: "TRIGGER_SET",
    message: "The External Risk Provider has fully recovered.",
    setTriggers: {
      riskProviderDegraded: false,
      riskProviderRecovering: false,
      riskProviderRecovered: true,
      queuePressureRising: true,
      sustainedSurge: true,
    },
  },
  // NOTE: drain-window triggers below fire unconditionally on
  // wall-clock atMs, exactly like every other timed event in this
  // engine. rules.ts is what makes them meaningful only once the
  // candidate has actually engaged a genuine queue-relief lever.
  {
    id: "drain-window-1-elapsed",
    atMs: DRAIN_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first manual-review-queue drain window has elapsed.",
    setTriggers: { drainWindow1Elapsed: true },
  },
  {
    id: "drain-window-2-elapsed",
    atMs: DRAIN_WINDOW_2_MS,
    type: "TRIGGER_SET",
    message: "A second manual-review-queue drain window has elapsed.",
    setTriggers: { drainWindow1Elapsed: true, drainWindow2Elapsed: true },
  },
  {
    id: "drain-window-fully-drained-elapsed",
    atMs: DRAIN_WINDOW_FULLY_DRAINED_MS,
    type: "TRIGGER_SET",
    message:
      "Enough drain time has elapsed for a fully-engaged review-queue triage process to have worked the backlog down to baseline.",
    setTriggers: {
      drainWindow1Elapsed: true,
      drainWindow2Elapsed: true,
      drainWindowFullyDrainedElapsed: true,
    },
  },
];
