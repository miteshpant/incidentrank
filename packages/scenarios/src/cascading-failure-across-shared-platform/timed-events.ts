import type { TimedEvent } from "@incidentrank/simulator";

// ── Root cause onset ────────────────────────────────────────────────────
// Shared Identity's token-validation latency begins spiking. This is the
// TRUE ROOT — nothing else has moved yet at this point.
export const IDENTITY_DEGRADED_MS = 20_000;

// ── Amplification compounds (external consequence of the root, not a
// candidate action) ─────────────────────────────────────────────────────
// Product B's aggressive retry policy has had enough real elapsed time
// to compound into a genuine amplification multiplier against Shared
// Gateway/Messaging. This is why Product B's own dashboard looks like
// the loudest, reddest signal in the whole incident — it is a real,
// external consequence of the root degradation, not evidence that
// Product B itself is the root.
export const AMPLIFICATION_COMPOUNDED_MS = IDENTITY_DEGRADED_MS + 60_000;

// ── Starvation compounds (external consequence of the root, not a
// candidate action) ─────────────────────────────────────────────────────
// Product A's connections, held open longer while waiting on slow
// identity validation, have had enough real elapsed time to genuinely
// start exhausting Shared Database's connection pool. Deliberately
// later than amplification — this scenario's second, quieter failure
// domain reveals itself only after the loud one is already dominating
// attention, modeling exactly the judgment trap the spec requires.
export const STARVATION_COMPOUNDED_MS = AMPLIFICATION_COMPOUNDED_MS + 60_000;

// If the incident runs this long with identity still degrading and
// nothing contained, the platform has compounded into a materially more
// dangerous state (both amplification AND starvation fully engaged
// simultaneously) — modeling damage that compounds the longer
// containment is delayed, not a fixed one-time blip.
export const SUSTAINED_CASCADE_MS = STARVATION_COMPOUNDED_MS + 90_000;

// ── Recovery-lag subsystem #1: Shared Messaging backlog drain ──────────
// Fires unconditionally on wall-clock atMs, exactly like every other
// timed event in this engine — rules.ts is what makes these windows
// MEANINGFUL only once the candidate has actually engaged a genuine
// containment configuration (amplifier isolated/bounded AND root
// protected). A candidate who never contains anything never matches any
// messaging-draining rule no matter how many of these triggers fire.
export const MSG_DRAIN_WINDOW_1_MS = SUSTAINED_CASCADE_MS + 90_000;
export const MSG_DRAIN_WINDOW_2_MS = SUSTAINED_CASCADE_MS + 3 * 60_000;
export const MSG_FULLY_DRAINED_MS = SUSTAINED_CASCADE_MS + 6 * 60_000;

// ── Recovery-lag subsystem #2: Shared Database connection-pressure
// drain. Deliberately a DIFFERENT real-elapsed schedule than messaging
// — connection pressure clears faster once genuinely capped+contained,
// modeling two independently-paced subsystems rather than one dressed
// up as two. ──────────────────────────────────────────────────────────
export const DB_DRAIN_WINDOW_1_MS = SUSTAINED_CASCADE_MS + 60_000;
export const DB_FULLY_DRAINED_MS = SUSTAINED_CASCADE_MS + 150_000;

// ── Identity's own recovery window, once genuinely protected (circuit
// breaker open + either the amplifier contained or cache-assist engaged,
// reducing arriving volume below what it can absorb). ───────────────────
export const IDENTITY_RECOVERY_WINDOW_MS = SUSTAINED_CASCADE_MS + 2 * 60_000;

// NOTE: tickOnce (packages/simulator/src/tick.ts) walks timedEvents via a
// monotonically-increasing index pointer in ARRAY ORDER — every entry
// below is already in strictly ascending atMs order.
export const timedEvents: TimedEvent[] = [
  {
    id: "identity-degraded",
    atMs: IDENTITY_DEGRADED_MS,
    type: "TRIGGER_SET",
    message:
      "Shared Identity's token-validation latency has spiked. No product-level symptom is visible yet — this is the first and true root event of the incident.",
    setTriggers: { identityDegraded: true },
  },
  {
    id: "amplification-compounded",
    atMs: AMPLIFICATION_COMPOUNDED_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "Product B's retry-driven request volume against the shared platform has compounded into a sustained amplification multiplier — an external consequence of Shared Identity's ongoing degradation, not a new or separate root cause.",
    setTriggers: { identityDegraded: true, amplificationCompounded: true },
  },
  {
    id: "starvation-compounded",
    atMs: STARVATION_COMPOUNDED_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "Product A's connections, held open longer while waiting on slow identity validation, have compounded into genuine Shared Database connection-pool exhaustion pressure — a second, quieter external consequence of the same root degradation.",
    setTriggers: {
      identityDegraded: true,
      amplificationCompounded: true,
      starvationCompounded: true,
    },
  },
  {
    id: "sustained-cascade",
    atMs: SUSTAINED_CASCADE_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "The incident has persisted long enough, with nothing contained, that amplification and starvation pressure are now both fully compounded and acting on the platform simultaneously.",
    setTriggers: {
      identityDegraded: true,
      amplificationCompounded: true,
      starvationCompounded: true,
      sustainedCascade: true,
    },
  },
  {
    id: "db-drain-window-1-elapsed",
    atMs: DB_DRAIN_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first Shared Database connection-pressure drain window has elapsed.",
    setTriggers: { dbDrainWindow1Elapsed: true },
  },
  {
    id: "msg-drain-window-1-elapsed",
    atMs: MSG_DRAIN_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "A first Shared Messaging backlog drain window has elapsed.",
    setTriggers: {
      dbDrainWindow1Elapsed: true,
      msgDrainWindow1Elapsed: true,
    },
  },
  {
    id: "identity-recovery-window-elapsed",
    atMs: IDENTITY_RECOVERY_WINDOW_MS,
    type: "TRIGGER_SET",
    message: "Enough elapsed time has passed for a genuinely protected Shared Identity to recover.",
    setTriggers: {
      dbDrainWindow1Elapsed: true,
      msgDrainWindow1Elapsed: true,
      identityRecoveryWindowElapsed: true,
    },
  },
  {
    id: "db-fully-drained-elapsed",
    atMs: DB_FULLY_DRAINED_MS,
    type: "TRIGGER_SET",
    message:
      "Enough elapsed time has passed for Shared Database connection pressure to have fully drained under a genuinely capped, contained configuration.",
    setTriggers: {
      dbDrainWindow1Elapsed: true,
      msgDrainWindow1Elapsed: true,
      identityRecoveryWindowElapsed: true,
      dbFullyDrainedElapsed: true,
    },
  },
  {
    id: "msg-drain-window-2-elapsed",
    atMs: MSG_DRAIN_WINDOW_2_MS,
    type: "TRIGGER_SET",
    message: "A second Shared Messaging backlog drain window has elapsed.",
    setTriggers: {
      dbDrainWindow1Elapsed: true,
      identityRecoveryWindowElapsed: true,
      msgDrainWindow1Elapsed: true,
      dbFullyDrainedElapsed: true,
      msgDrainWindow2Elapsed: true,
    },
  },
  {
    id: "msg-fully-drained-elapsed",
    atMs: MSG_FULLY_DRAINED_MS,
    type: "TRIGGER_SET",
    message:
      "Enough elapsed time has passed for Shared Messaging's backlog to have fully drained under a genuinely contained, scaled-consumer configuration.",
    setTriggers: {
      dbDrainWindow1Elapsed: true,
      identityRecoveryWindowElapsed: true,
      msgDrainWindow1Elapsed: true,
      dbFullyDrainedElapsed: true,
      msgDrainWindow2Elapsed: true,
      msgFullyDrainedElapsed: true,
    },
  },
];
