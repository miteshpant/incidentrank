import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Demand forecast band (informational, static for the whole attempt
  // — the forecast itself never changes; only the candidate's reservation
  // decision does) ─────────────────────────────────────────────────────
  // Units are an abstract capacity unit (think "thousand concurrent
  // sessions" or equivalent) — never a currency amount. p50/p90/p99 give
  // the candidate an explicit, honest uncertainty band rather than a
  // single "expected demand" number, per this scenario's binding
  // "forecast uncertainty must be treated explicitly" invariant.
  demandForecastP50Units: 1_000,
  demandForecastP90Units: 1_500,
  demandForecastP99Units: 1_900,

  // ── Reservation decision state (derived from the three region
  // controls + contingency reserve; snapshot values authored per rule,
  // never computed from a formula) ─────────────────────────────────────
  reservedCapacityTotalUnits: 0,
  onDemandExposureUnits: 0,
  wastedReservedCapacityUnits: 0,
  // Cumulative, non-resetting measure of how much real exposure has
  // accrued specifically from reservationTiming sitting at "wait" AFTER
  // the authored deadline passed (timed-events.ts's
  // RESERVATION_DEADLINE_MS). Every tick spent in that state while the
  // event is live adds to this count — the engine's trackPeak mechanism
  // (definition.ts's numericWatchFields) is what makes it genuinely
  // permanent: even if the candidate later locks in late and the LIVE
  // state recovers, this field's tracked peak preserves the fact that
  // real deadline-risk exposure already happened during the miss
  // window. Zero is healthy (either the deadline was never missed, or
  // the event never arrived during a miss).
  cumulativeDeadlineMissExposureUnits: 0,

  // ── Candidate-facing status fields (authoritative for scoring +
  // success/acceptable conditions) ─────────────────────────────────────
  // Whether Critical-Tier workload has enough protected capacity under
  // the authored demand band once the event actually arrives.
  //   "not-yet-exposed" — the event has not arrived yet; no real
  //                        exposure has happened regardless of what is
  //                        currently reserved (the deadline/decision
  //                        phase).
  //   "protected"        — once the event arrives, reserved + (if
  //                        enabled) on-demand capacity covers Critical-
  //                        Tier demand under the authored band.
  //   "at-risk"           — once the event arrives, Critical-Tier
  //                        workload has thin but nonzero headroom (the
  //                        legitimate ACCEPTABLE tier — see rules.ts).
  //   "breached"          — once the event arrives, Critical-Tier
  //                        workload demand exceeds what reserved +
  //                        on-demand capacity (if any) can serve — a
  //                        real, live shortfall with real revenue loss.
  criticalWorkloadProtectionStatus: "not-yet-exposed",
  // Whether reserved capacity is distributed across regions in a way
  // that stays inside this business's stated resilience policy (no
  // single region holds a disproportionate share of total reserved
  // capacity), independent of whether the AGGREGATE total is adequate.
  //   "balanced" (healthy) / "concentrated" (a real, hidden risk even
  //   when aggregate headroom looks fine on paper).
  regionalConcentrationStatus: "balanced",
  // Whether the reservation decision was actually locked in before the
  // authored deadline closed.
  //   "undecided" (default, pre-deadline) / "locked-in-on-time" /
  //   "deadline-missed" (terminal — once the deadline passes with
  //   reservationTiming still at "wait", this cannot be retroactively
  //   fixed; the provider's guaranteed pricing/availability window has
  //   closed).
  reservationDecisionStatus: "undecided",
  // Whether the resulting reservation level represents genuine economic
  // waste — capacity committed, non-refundable, that no realistically-
  // reachable demand (even p99) would ever use.
  //   "efficient" (healthy) / "wasteful".
  reservationWasteStatus: "efficient",
  // Summary severity field (normal/warning/critical vocabulary), driving
  // reliability's criticalTimeRatio in scoring.ts — time spent with a
  // genuine Critical-Tier shortfall live during the event, never time
  // spent merely waiting out the pre-event decision window.
  capacitySeverity: "normal",
};
