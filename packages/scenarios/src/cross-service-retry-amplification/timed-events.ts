import type { TimedEvent } from "@incidentrank/simulator";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const INCIDENT_START_MS = 60 * SECOND_MS;
// A second wave: left unmitigated, the amplification itself starts
// starving the provider's connection pool hard enough that its own
// latency gets materially worse (a real feedback loop — amplified
// volume degrades the provider further, which makes every layer's
// retries fire even more). This is a continuation of an already-visible
// trend (providerConnectionUtilizationPercent has been elevated since
// INCIDENT_START_MS), never a silent flip from a healthy-looking state.
export const SECOND_WAVE_MS = INCIDENT_START_MS + 4 * MINUTE_MS;
// Recovery-lag window (phase6dsupport.md section 14): even once retry
// ownership has been consolidated and amplification is bounded, the
// provider's connection pool was already carrying a backlog of
// already-queued/in-flight connections built up while amplification was
// unresolved. That backlog needs real elapsed scenario time to drain —
// it is not instantly empty the instant the candidate's control change
// takes effect. Rules below distinguish "ownership just consolidated,
// before this window" (zombie/in-flight still elevated from the
// backlog) from "ownership consolidated, backlog window has passed"
// (fully drained) using this trigger, mirroring the same scenario-clock
// delayed-consequence mechanism already used for the second wave above
// — the only mechanism this engine supports (rules match current
// triggers/controls, never "time since a specific candidate action").
export const STABILIZATION_WINDOW_MS = INCIDENT_START_MS + 20 * SECOND_MS;

export const timedEvents: TimedEvent[] = [
  {
    id: "provider-degraded",
    atMs: INCIDENT_START_MS,
    type: "TRIGGER_SET",
    message:
      "The External Provider is responding slowly and returning an elevated rate of transient errors — a moderate degradation, not an outage.",
    setTriggers: { providerDegraded: true },
  },
  {
    id: "connection-backlog-drain-window",
    atMs: STABILIZATION_WINDOW_MS,
    type: "TRIGGER_SET",
    message:
      "Enough time has passed for the provider's connection pool backlog to drain, for any chain that has already consolidated retry ownership.",
    setTriggers: { providerDegraded: true, backlogDrainWindowPassed: true },
  },
  {
    id: "amplification-second-wave",
    atMs: SECOND_WAVE_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained amplified volume has pushed the External Provider's connection pool further toward exhaustion — its own latency and error rate are climbing in response to the load being generated against it.",
    setTriggers: { providerDegraded: true, backlogDrainWindowPassed: true, secondWave: true },
  },
];
