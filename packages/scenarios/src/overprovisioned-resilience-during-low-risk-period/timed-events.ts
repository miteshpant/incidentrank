import type { TimedEvent } from "@incidentrank/simulator";

// The authored "incident" moment for this proactive scenario: the
// previously-declared high-risk period has ended. Nothing is broken —
// this is an economic/judgment trigger, not an outage. Everything that
// was correctly overprovisioned for the high-risk window is now pure
// cost waste unless and until it is deliberately reduced.
export const HIGH_RISK_WINDOW_ENDED_MS = 15_000;

// If left completely untouched this long, the expensive peak-event
// posture has simply kept running at full cost with no decision made at
// all — real, compounding, needless cost, even though nothing is unsafe
// about it.
export const SUSTAINED_UNREVIEWED_MS = HIGH_RISK_WINDOW_ENDED_MS + 3 * 60_000;

// FIRST periodic single-AZ failure drill: infrastructure runs a routine,
// low-probability simulated single-zone failure test. This is the
// concrete, authored event the mandatory resilience floor exists to
// protect against — not a hypothetical policy requirement. If the floor
// is intact, the drill is absorbed cleanly. If the floor has been
// reduced below the mandatory minimum, the drill's simulated zone
// failure cannot be fully absorbed by the remaining capacity, and a
// real, visible consequence fires (see rules.ts's below-floor-drill
// family).
export const FIRST_AZ_FAILURE_DRILL_MS = HIGH_RISK_WINDOW_ENDED_MS + 6 * 60_000;

// SECOND periodic drill, further out — proves the exposure is real and
// recurring for as long as the floor stays violated, not a one-time
// fixed cost, exactly mirroring how other scenarios' historical-damage
// counters compound the longer an unsafe lever stays active.
export const SECOND_AZ_FAILURE_DRILL_MS = FIRST_AZ_FAILURE_DRILL_MS + 6 * 60_000;

// Elapsed time required for a genuine capacity reduction (reducing a
// peak-event control toward/at the stated operating baseline) to fully
// take effect operationally — real elapsed drain time, not an instant
// flip on the same tick a control is changed, mirroring every other
// built-in scenario's recovery-lag convention.
export const REDUCTION_SETTLE_WINDOW_MS = 45_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "high-risk-window-ended",
    atMs: HIGH_RISK_WINDOW_ENDED_MS,
    type: "TRIGGER_SET",
    message:
      "The previously-declared high-risk period has ended. Nothing is currently broken — every metric remains healthy — but the platform is still running the expensive resilience posture that was sized specifically for that now-concluded high-risk window.",
    setTriggers: { highRiskWindowEnded: true },
  },
  {
    id: "reduction-settle-window-elapsed",
    atMs: HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS,
    type: "TRIGGER_SET",
    message:
      "Enough elapsed time has passed for any capacity change made shortly after the high-risk window ended to have fully taken operational effect.",
    setTriggers: { highRiskWindowEnded: true, reductionSettleWindowElapsed: true },
  },
  {
    id: "sustained-unreviewed-posture",
    atMs: SUSTAINED_UNREVIEWED_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "No capacity decision has been made since the high-risk window ended — the full peak-event posture has simply kept running at full cost, with no safety benefit this platform currently needs.",
    setTriggers: {
      highRiskWindowEnded: true,
      reductionSettleWindowElapsed: true,
      sustainedUnreviewed: true,
    },
  },
  {
    id: "first-az-failure-drill",
    atMs: FIRST_AZ_FAILURE_DRILL_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "A routine, scheduled single-AZ failure drill has just run against the current infrastructure posture. This is a real, periodic exercise, not a live outage.",
    setTriggers: {
      highRiskWindowEnded: true,
      reductionSettleWindowElapsed: true,
      firstDrillFired: true,
    },
  },
  {
    id: "second-az-failure-drill",
    atMs: SECOND_AZ_FAILURE_DRILL_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "A second routine, scheduled single-AZ failure drill has just run against the current infrastructure posture.",
    setTriggers: {
      highRiskWindowEnded: true,
      reductionSettleWindowElapsed: true,
      firstDrillFired: true,
      secondDrillFired: true,
    },
  },
];
