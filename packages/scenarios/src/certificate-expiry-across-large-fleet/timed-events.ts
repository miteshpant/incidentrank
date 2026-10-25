import type { TimedEvent } from "@incidentrank/simulator";

// ── DETERMINISTIC CALENDAR PHASES (binding long-horizon/deadline
// design requirement) ────────────────────────────────────────────────
// These are ordinary timed-events checkpoints, authored exactly like
// every other built-in scenario's recovery-lag windows — just labeled
// to read as calendar time in the candidate-facing timeline. No new
// engine capability is used, and nothing here waits on real wall-clock
// time beyond the normal simulation tick cadence (tickMs in
// definition.ts). Each atMs below is simply "how many simulated
// milliseconds into this attempt," relabeled T-72h / T-24h / T-6h /
// T-1h / expiry for narrative purposes only.
export const T_MINUS_72H_MS = 20_000;
export const T_MINUS_24H_MS = T_MINUS_72H_MS + 2 * 60_000;
export const T_MINUS_6H_MS = T_MINUS_24H_MS + 2 * 60_000;
export const T_MINUS_1H_MS = T_MINUS_6H_MS + 2 * 60_000;
export const EXPIRY_DEADLINE_MS = T_MINUS_1H_MS + 2 * 60_000;

// If the Critical cohort is left un-rotated past the deadline itself,
// the outage has run long enough to represent a materially worse,
// sustained connection-rejection window — a direct, deterministic
// consequence of calendar time passing with no mitigation, never a new
// external cause.
export const SUSTAINED_POST_EXPIRY_MS = EXPIRY_DEADLINE_MS + 3 * 60_000;

// Recovery-lag windows (same binding historical-damage/recovery-lag
// doctrine as every other Phase 6E sibling): once the candidate has
// genuinely closed a premature-revocation gap (via the sanctioned fix —
// restoring trust / extending the bridge, never the validation-bypass
// trap), already-rejecting External Clients do not resume successful
// connections on the very next tick — each client population needs
// real elapsed time to retry and re-establish trust. Anchored AFTER
// SUSTAINED_POST_EXPIRY_MS so they remain reachable even in the
// worst-case timeline where a gap ran its full course before being
// fixed.
export const GAP_RECOVERY_WINDOW_1_MS = SUSTAINED_POST_EXPIRY_MS + 60_000;
export const GAP_RECOVERY_FULLY_DONE_MS = SUSTAINED_POST_EXPIRY_MS + 3 * 60_000;

// NOTE: tickOnce (packages/simulator/src/tick.ts) walks timedEvents via
// a monotonically-increasing index pointer, in ARRAY ORDER — it never
// sorts by atMs. Every entry below is therefore already in strictly
// ascending atMs order.
export const timedEvents: TimedEvent[] = [
  {
    id: "t-minus-72h",
    atMs: T_MINUS_72H_MS,
    type: "TRIGGER_SET",
    message:
      "DEADLINE PROGRESSION (T-72h): the Certificate Authority's fleet-wide expiry scan has confirmed Modern, Critical, and Legacy cohort certificates all expire at the same deadline, 72 hours out. No cohort has rotated yet; every Load Balancer connection is still succeeding normally.",
    setTriggers: { expiryWindowActive: true },
  },
  {
    id: "t-minus-24h",
    atMs: T_MINUS_24H_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "DEADLINE PROGRESSION (T-24h): 24 hours remain before fleet-wide certificate expiry. Any cohort not yet rotated now carries materially higher deadline risk than it did at T-72h.",
    setTriggers: { expiryWindowActive: true, tMinus24h: true },
  },
  {
    id: "t-minus-6h",
    atMs: T_MINUS_6H_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "DEADLINE PROGRESSION (T-6h): 6 hours remain before fleet-wide certificate expiry. This is the last practical window for a staged, verified rotation on any cohort that has not already completed one.",
    setTriggers: { expiryWindowActive: true, tMinus24h: true, tMinus6h: true },
  },
  {
    id: "t-minus-1h",
    atMs: T_MINUS_1H_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "DEADLINE PROGRESSION (T-1h): 1 hour remains before fleet-wide certificate expiry. Any cohort still un-rotated at this point is at imminent risk of a deterministic, calendar-driven connection-rejection outage.",
    setTriggers: { expiryWindowActive: true, tMinus24h: true, tMinus6h: true, tMinus1h: true },
  },
  {
    id: "expiry-deadline",
    atMs: EXPIRY_DEADLINE_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "DEADLINE PROGRESSION (expiry): the fleet-wide certificate expiry deadline has passed. Any cohort whose certificate was not rotated before this instant now deterministically fails certificate validation for every External Client connection — this is not a random failure, it is the calendar clock running out.",
    setTriggers: { expiryWindowActive: true, tMinus24h: true, tMinus6h: true, tMinus1h: true, expiryDeadlinePassed: true },
  },
  {
    id: "sustained-post-expiry",
    atMs: SUSTAINED_POST_EXPIRY_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "EXTERNAL PROGRESSION: an un-rotated certificate expiry, if still unaddressed, has now persisted long enough that the connection-rejection outage it causes has compounded into a materially larger, sustained window — a direct consequence of leaving a deterministic deadline miss unaddressed, never a new external cause.",
    setTriggers: {
      expiryWindowActive: true,
      tMinus24h: true,
      tMinus6h: true,
      tMinus1h: true,
      expiryDeadlinePassed: true,
      sustainedPostExpiry: true,
    },
  },
  // NOTE: recovery-lag triggers below fire unconditionally on
  // wall-clock atMs, exactly like every other timed event in this
  // engine. rules.ts is what makes them MEANINGFUL only once the
  // candidate has actually engaged a safe, correctly-sequenced fix.
  {
    id: "gap-recovery-window-1-elapsed",
    atMs: GAP_RECOVERY_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "ELAPSED RECOVERY: a first client-reconnection window has elapsed since a premature gap was closed the sanctioned way.",
    setTriggers: { gapRecoveryWindow1Elapsed: true },
  },
  {
    id: "gap-recovery-fully-done-elapsed",
    atMs: GAP_RECOVERY_FULLY_DONE_MS,
    type: "TRIGGER_SET",
    message:
      "ELAPSED RECOVERY: enough elapsed time has passed for every previously-rejecting External Client population to have retried and re-established a trusted connection.",
    setTriggers: { gapRecoveryWindow1Elapsed: true, gapRecoveryFullyDone: true },
  },
];
