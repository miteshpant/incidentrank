import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: a corrupted training dataset has already produced a
// technically-valid artifact that has already been promoted and is
// already serving live traffic. Trainer and Deployment Pipeline are
// unaffected on throughput/uptime — this is detected downstream, after
// the fact, not as an infrastructure failure.
export const CORRUPTION_ONSET_MS = 20_000;

// If the corrupted artifact is left serving unaddressed this long, the
// cumulative business-decision exposure has compounded into a
// materially larger, more dangerous window — modeling a correctness
// problem whose risk compounds the longer it runs, not a fixed
// one-time blip.
export const SUSTAINED_EXPOSURE_MS = CORRUPTION_ONSET_MS + 3 * 60_000;

// Recovery-lag drain windows (phase6e3.md's binding historical-damage/
// recovery-lag doctrine, same pattern as Model Feature Freshness
// Degradation / Data Pipeline Freshness Collapse): rollbackTarget=
// "hold-for-retrain" is a genuinely SLOWER alternate strong path than
// "last-known-good" — producing and re-validating a fresh artifact from
// scratch takes real elapsed time, it does not snap to a trustworthy
// artifact the instant the control is set. Anchored AFTER
// SUSTAINED_EXPOSURE_MS so they are reachable even when the candidate
// let exposure compound first.
export const RETRAIN_WINDOW_1_MS = SUSTAINED_EXPOSURE_MS + 2 * 60_000;
export const RETRAIN_WINDOW_FULLY_VALIDATED_MS = SUSTAINED_EXPOSURE_MS + 5 * 60_000;

// NOTE: tickOnce (packages/simulator/src/tick.ts) walks timedEvents via a
// monotonically-increasing index pointer, in ARRAY ORDER — it never
// sorts by atMs. Every entry below is therefore already in strictly
// ascending atMs order.
export const timedEvents: TimedEvent[] = [
  {
    id: "corruption-onset",
    atMs: CORRUPTION_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "EXTERNAL PROGRESSION: a corrupted training dataset has already produced a technically-valid artifact that has already been promoted and is already serving live traffic. Trainer throughput and Deployment Pipeline uptime remain unaffected — this is a data-quality/correctness problem, not an infrastructure failure.",
    setTriggers: { artifactCorrupted: true },
  },
  {
    id: "sustained-exposure",
    atMs: SUSTAINED_EXPOSURE_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "EXTERNAL PROGRESSION: the corrupted artifact has remained in live serving long enough that cumulative business-decision exposure has compounded into a materially larger, more dangerous window.",
    setTriggers: { artifactCorrupted: true, sustainedExposure: true },
  },
  // NOTE: retrain-window triggers below fire unconditionally on
  // wall-clock atMs, exactly like every other timed event in this
  // engine. rules.ts is what makes them MEANINGFUL only once the
  // candidate has actually engaged rollbackTarget="hold-for-retrain".
  {
    id: "retrain-window-1-elapsed",
    atMs: RETRAIN_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "ELAPSED RECOVERY: a first retrain-and-partial-validation window has elapsed.",
    setTriggers: { retrainWindow1Elapsed: true },
  },
  {
    id: "retrain-window-fully-validated-elapsed",
    atMs: RETRAIN_WINDOW_FULLY_VALIDATED_MS,
    type: "TRIGGER_SET",
    message:
      "ELAPSED RECOVERY: enough retrain-and-validation time has elapsed for a freshly trained artifact to have been fully re-validated against the held-out trust gate.",
    setTriggers: { retrainWindow1Elapsed: true, retrainWindowFullyValidatedElapsed: true },
  },
];
