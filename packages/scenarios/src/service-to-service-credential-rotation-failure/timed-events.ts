import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: a routine service-to-service credential rotation has
// been scheduled and begins now. Nothing is wrong yet — the Issuer has
// minted a new credential, but no workload has adopted it and the old
// credential is still valid. This is a genuinely proactive/operational
// trigger (the rotation itself, not an external degradation), exactly
// like the spec's framing: "a rotation begins while a subset of
// workloads are still using the old credential."
export const ROTATION_STARTED_MS = 20_000;

// If a premature revocation gap is left open this long without being
// closed (neither bypassed nor rolled back), the authentication failure
// has propagated further through Service A's own retry/queueing
// behavior — a materially worse, but still entirely candidate-caused,
// escalation of the SAME self-inflicted gap (never a new external
// cause).
export const SUSTAINED_GAP_MS = ROTATION_STARTED_MS + 3 * 60_000;

// Recovery-lag windows (phase-6e-strategy-spec.md's recovery-lag
// requirement): once the candidate has closed a premature-revocation
// gap via rollbackOldCredentialValidity, already-failing Service B
// instances do not resume successful calls on the very next tick — each
// instance must independently retry and re-establish its connection
// using the now-valid old credential. This propagates across these two
// real elapsed-time windows, never instantly. Anchored AFTER
// SUSTAINED_GAP_MS so the recovery windows remain reachable even in the
// worst-case timeline where the candidate let the gap run its full
// course before fixing it.
export const ROLLBACK_PROPAGATION_WINDOW_1_MS = SUSTAINED_GAP_MS + 60_000;
export const ROLLBACK_PROPAGATION_FULLY_DONE_MS = SUSTAINED_GAP_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "rotation-started",
    atMs: ROTATION_STARTED_MS,
    type: "TRIGGER_SET",
    message:
      "A scheduled service-to-service credential rotation has begun. The Certificate/Token Issuer has minted a new credential; no Service B workload has adopted it yet; the old credential remains valid for everyone. No authentication gap exists yet.",
    setTriggers: { rotationActive: true },
  },
  {
    id: "sustained-gap",
    atMs: SUSTAINED_GAP_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "A premature-revocation authentication gap, if still open, has now propagated further through Service A's own retry and queueing behavior — a direct consequence of leaving the self-inflicted gap unaddressed this long, not a new external cause.",
    setTriggers: { rotationActive: true, sustainedGapWindow: true },
  },
  {
    id: "rollback-propagation-window-1-elapsed",
    atMs: ROLLBACK_PROPAGATION_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message:
      "A first elapsed-time window has passed since the old credential's validity was restored — some, but not yet all, previously-failing Service B instances have reconnected.",
    setTriggers: { rollbackPropagationWindow1Elapsed: true },
  },
  {
    id: "rollback-propagation-fully-done",
    atMs: ROLLBACK_PROPAGATION_FULLY_DONE_MS,
    type: "TRIGGER_SET",
    message:
      "Enough elapsed time has passed since the old credential's validity was restored for every previously-failing Service B instance to have reconnected using the now-valid credential.",
    setTriggers: {
      rollbackPropagationWindow1Elapsed: true,
      rollbackPropagationFullyDone: true,
    },
  },
];
