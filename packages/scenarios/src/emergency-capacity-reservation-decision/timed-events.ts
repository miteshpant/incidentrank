import type { TimedEvent } from "@incidentrank/simulator";

// ── Deterministic deadline/event phases (batch-defining requirement 4:
// long-horizon / deadline design). Every phase below is an authored
// elapsed-millisecond checkpoint via the existing timed-events mechanism
// — exactly like every other built-in scenario's recovery-lag windows —
// labeled to read as calendar/deadline phases in the candidate-facing
// timeline strings. No new engine capability is added; no wall-clock
// dependency beyond the normal simulation tick cadence is introduced.

// T-0 (attempt start): the forecast is already published and the
// decision window is already open — this scenario starts with the
// PROACTIVE decision already live, not with a failure.
export const DECISION_WINDOW_OPENED_MS = 5_000;

// T-72h (represented): the reservation deadline is approaching but still
// comfortably far away — informational checkpoint, no state change.
export const DEADLINE_T_MINUS_72H_MS = DECISION_WINDOW_OPENED_MS + 60_000;

// T-24h (represented): the deadline is now close. Reservation pricing
// and availability at the provider are still guaranteed, but the window
// is closing.
export const DEADLINE_T_MINUS_24H_MS = DEADLINE_T_MINUS_72H_MS + 60_000;

// T-6h (represented): final warning before the deadline closes.
export const DEADLINE_T_MINUS_6H_MS = DEADLINE_T_MINUS_24H_MS + 45_000;

// DEADLINE (represented): the provider's guaranteed reservation window
// closes. If reservationTiming is still "wait" at this exact moment, the
// decision is permanently recorded as a missed deadline — see rules.ts's
// deadline-missed-trap, reachable ONLY via this exact timed checkpoint,
// never by any later elapsed time "fixing" it retroactively.
export const RESERVATION_DEADLINE_MS = DEADLINE_T_MINUS_6H_MS + 30_000;

// EVENT ARRIVES: the major demand event itself begins. Everything before
// this point was pure decision-making with no live exposure at all — a
// green system before this point never equals a safe handback, because
// the real test (did the reservation decision hold up against actual
// demand) has not happened yet.
export const EVENT_ARRIVAL_MS = RESERVATION_DEADLINE_MS + 60_000;

// EVENT SUSTAINED: demand has been sustained at its peak long enough
// that a thin-but-nonzero headroom situation would have fully revealed
// itself (not just a brief, forgivable blip).
export const EVENT_SUSTAINED_MS = EVENT_ARRIVAL_MS + 2 * 60_000;

// REGIONAL DISRUPTION (independent of the candidate's choices): partway
// through the sustained event, Region A specifically experiences a
// local capacity problem of its own — unrelated to anything the
// candidate did, and not preventable by any control in this scenario.
// This is the mechanism that makes regional CONCENTRATION a real,
// non-cosmetic trap: a candidate who concentrated reserved capacity in
// Region A loses exactly the capacity this disruption removes, no
// matter how adequate the aggregate total looked on paper before this
// moment.
export const REGIONAL_DISRUPTION_MS = EVENT_SUSTAINED_MS + 60_000;

// NOTE: tickOnce (packages/simulator/src/tick.ts) walks timedEvents via a
// monotonically-increasing index pointer, in ARRAY ORDER — it never
// sorts by atMs. Every entry below is therefore already in strictly
// ascending atMs order.
export const timedEvents: TimedEvent[] = [
  {
    id: "decision-window-opened",
    atMs: DECISION_WINDOW_OPENED_MS,
    type: "TRIGGER_SET",
    message:
      "DEADLINE PROGRESSION: the reservation decision window is open. Demand Forecasting has published an uncertain (p50/p90/p99) demand band for the approaching major event. No capacity has been reserved yet, and the event itself has not started — this is a pure, proactive planning decision.",
    setTriggers: { decisionWindowOpen: true },
  },
  {
    id: "deadline-t-minus-72h",
    atMs: DEADLINE_T_MINUS_72H_MS,
    type: "TRIGGER_SET",
    message: "DEADLINE PROGRESSION: T-72h (represented). The reservation deadline is approaching but still comfortably far away.",
    setTriggers: { decisionWindowOpen: true },
  },
  {
    id: "deadline-t-minus-24h",
    atMs: DEADLINE_T_MINUS_24H_MS,
    type: "TRIGGER_SET",
    message: "DEADLINE PROGRESSION: T-24h (represented). The deadline is close. Reservation pricing and availability are still guaranteed, but the window is closing.",
    setTriggers: { decisionWindowOpen: true },
  },
  {
    id: "deadline-t-minus-6h",
    atMs: DEADLINE_T_MINUS_6H_MS,
    type: "TRIGGER_SET",
    message: "DEADLINE PROGRESSION: T-6h (represented). Final warning before the reservation deadline closes.",
    setTriggers: { decisionWindowOpen: true },
  },
  {
    id: "reservation-deadline",
    atMs: RESERVATION_DEADLINE_MS,
    type: "TRIGGER_SET",
    message:
      "DEADLINE PROGRESSION: the provider's guaranteed reservation window has now closed. Any reservation decision not locked in before this exact moment is permanently recorded as missed — this cannot be corrected retroactively, regardless of what is decided afterward.",
    setTriggers: { decisionWindowOpen: true, reservationDeadlinePassed: true },
  },
  {
    id: "event-arrival",
    atMs: EVENT_ARRIVAL_MS,
    type: "TRIGGER_SET",
    message:
      "EXTERNAL PROGRESSION: the major demand event has arrived. Actual demand is now live against whatever reservation decision was made — this is the first moment any real exposure exists; everything before this point was decision-making with no live risk at all.",
    setTriggers: { decisionWindowOpen: true, reservationDeadlinePassed: true, eventArrived: true },
  },
  {
    id: "event-sustained",
    atMs: EVENT_SUSTAINED_MS,
    type: "TRIGGER_SET",
    message: "EXTERNAL PROGRESSION: demand has been sustained at the event's peak long enough that any thin-but-nonzero headroom situation has now fully revealed itself.",
    setTriggers: {
      decisionWindowOpen: true,
      reservationDeadlinePassed: true,
      eventArrived: true,
      eventSustained: true,
    },
  },
  {
    id: "regional-disruption",
    atMs: REGIONAL_DISRUPTION_MS,
    type: "TRIGGER_SET",
    message:
      "EXTERNAL PROGRESSION: Region A has experienced an independent, local capacity disruption of its own, unrelated to any candidate decision. Any reserved capacity concentrated in Region A specifically is no longer available for the remainder of this event, regardless of how adequate the aggregate reserved total looked before this moment.",
    setTriggers: {
      decisionWindowOpen: true,
      reservationDeadlinePassed: true,
      eventArrived: true,
      eventSustained: true,
      regionADisrupted: true,
    },
  },
];
