import type { TimedEvent } from "@incidentrank/simulator";

// Timed events must be authored in strictly ascending `atMs` order — the
// engine advances nextTimedEventIndex sequentially (packages/simulator/
// src/tick.ts) rather than re-sorting, so the array order below IS the
// chronological order.

// A payload/data-shape change ships: the Aggregator now requests and
// holds the full nested object from each of Dependency A, B, and C per
// request, instead of the narrower previous shape. Memory pressure
// begins rising on the Aggregator and on all three dependencies at the
// same time — this is external incident progression, not a candidate
// action.
const SHAPE_CHANGE_SHIPPED_MS = 30_000;

// Dependency A has the smallest heap headroom in the fleet, so it is the
// first component to visibly GC-thrash under the new load — a genuinely
// misleading symptom, since Dependency A is not where the oversized
// aggregation actually happens. External incident progression, flowing
// directly from the same root cause as SHAPE_CHANGE_SHIPPED_MS.
const DEPENDENCY_A_GC_THRASHING_MS = SHAPE_CHANGE_SHIPPED_MS + 40_000;

// ── Recovery-lag windows (phase6d.4.md section 15, required) ──────────
// Elapsed-time markers only, counted from DEPENDENCY_A_GC_THRASHING_MS.
// rules.ts gates the actual decay trajectory on both "enough time has
// passed" AND "a real root-cause fix is currently active" — these
// triggers alone never cause recovery; they only make a real fix's decay
// observable over real elapsed time instead of instantaneous.
const DECAY_WINDOW_1_MS = DEPENDENCY_A_GC_THRASHING_MS + 20_000;
const DECAY_WINDOW_2_MS = DEPENDENCY_A_GC_THRASHING_MS + 50_000;
const DECAY_WINDOW_FULLY_RECOVERED_MS = DEPENDENCY_A_GC_THRASHING_MS + 90_000;

// If the root cause (the Aggregator's oversized per-request object) is
// never addressed, sustained pressure eventually also pushes Dependency
// B and C into visible degradation — proving the root cause was never
// Dependency-A-specific. External incident progression, reachable only
// once the root cause remains unaddressed long enough.
const UNMITIGATED_SPREAD_MS = DEPENDENCY_A_GC_THRASHING_MS + 110_000;

// A later checkpoint used to prove that scaling the decoy alone does not
// durably help: once Dependency A has been scaled, the unaddressed
// upstream amplification re-accumulates pressure on it over elapsed
// time, because nothing about the oversized aggregation object changed.
// External incident progression (continuation of the same unresolved
// root cause), not a new incident.
const DECOY_SCALING_REACCUMULATION_MS = DEPENDENCY_A_GC_THRASHING_MS + 140_000;

// If the root cause remains unaddressed long enough past the spread
// point, the fleet begins hitting real OOM/restart churn — the
// historical-damage trigger. External incident progression (continued
// escalation of the same unresolved root cause), not a candidate action.
const OOM_CHURN_ONSET_MS = DEPENDENCY_A_GC_THRASHING_MS + 170_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "shape-change-shipped",
    atMs: SHAPE_CHANGE_SHIPPED_MS,
    type: "TRIGGER_SET",
    message:
      "A payload/data-shape change has shipped: the Aggregator now requests and holds the full nested object from Dependency A, B, and C per request. Memory utilization is climbing across the Aggregator and all three dependencies.",
    setTriggers: { memoryPressureActive: true },
  },
  {
    id: "dependency-a-gc-thrashing",
    atMs: DEPENDENCY_A_GC_THRASHING_MS,
    type: "TRIGGER_SET",
    message:
      "Dependency A is now GC-thrashing — its p99 GC pause time has climbed sharply. Dependency A has the least heap headroom in the fleet, so it is the first component to fail visibly, continuing the same memory-pressure trend already visible on every component since the shape change shipped.",
    setTriggers: { memoryPressureActive: true, dependencyAGcThrashing: true },
  },
  {
    id: "decay-window-1-elapsed",
    atMs: DECAY_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message:
      "A short interval has elapsed since Dependency A began GC-thrashing. If the upstream amplification has genuinely been reduced by now, in-flight heap and GC pressure should be beginning to subside — elapsed-time recovery behavior, observable only once a real fix is active.",
    setTriggers: { memoryPressureActive: true, dependencyAGcThrashing: true, decayWindow1Elapsed: true },
  },
  {
    id: "decay-window-2-elapsed",
    atMs: DECAY_WINDOW_2_MS,
    type: "TRIGGER_SET",
    message:
      "A longer interval has elapsed since Dependency A began GC-thrashing. If the upstream amplification has genuinely been reduced by now, heap and GC pressure should be substantially lower across every component — elapsed-time recovery behavior, observable only once a real fix is active.",
    setTriggers: {
      memoryPressureActive: true,
      dependencyAGcThrashing: true,
      decayWindow1Elapsed: true,
      decayWindow2Elapsed: true,
    },
  },
  {
    id: "decay-window-fully-recovered-elapsed",
    atMs: DECAY_WINDOW_FULLY_RECOVERED_MS,
    type: "TRIGGER_SET",
    message:
      "The full GC/heap decay window has now elapsed since Dependency A began GC-thrashing. If the upstream amplification has genuinely been reduced by now, every component should be back to a stable baseline — elapsed-time recovery behavior, observable only once a real fix is active.",
    setTriggers: {
      memoryPressureActive: true,
      dependencyAGcThrashing: true,
      decayWindow1Elapsed: true,
      decayWindow2Elapsed: true,
      decayWindowFullyRecoveredElapsed: true,
    },
  },
  {
    id: "unmitigated-spread-to-b-and-c",
    atMs: UNMITIGATED_SPREAD_MS,
    type: "TRIGGER_SET",
    message:
      "With the upstream amplification still unaddressed, Dependency B and Dependency C are now also showing elevated memory utilization and rising GC pause times — confirming the problem was never specific to Dependency A.",
    setTriggers: {
      memoryPressureActive: true,
      dependencyAGcThrashing: true,
      decayWindow1Elapsed: true,
      decayWindow2Elapsed: true,
      decayWindowFullyRecoveredElapsed: true,
      unmitigatedSpread: true,
    },
  },
  {
    id: "decoy-scaling-reaccumulation-window-elapsed",
    atMs: DECOY_SCALING_REACCUMULATION_MS,
    type: "TRIGGER_SET",
    message:
      "Enough elapsed time has now passed since Dependency A was scaled for its memory pressure to re-accumulate, if the Aggregator's oversized per-request object was never addressed — elapsed-time continuation of the same unresolved root cause, not a new event.",
    setTriggers: {
      memoryPressureActive: true,
      dependencyAGcThrashing: true,
      decayWindow1Elapsed: true,
      decayWindow2Elapsed: true,
      decayWindowFullyRecoveredElapsed: true,
      unmitigatedSpread: true,
      decoyReaccumulationWindowElapsed: true,
    },
  },
  {
    id: "oom-churn-onset",
    atMs: OOM_CHURN_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "With the upstream amplification still unaddressed, the fleet has now begun restart/OOM churn — components are being killed and restarted by the orchestrator's memory limits. This damage does not undo itself once a fix is later applied.",
    setTriggers: {
      memoryPressureActive: true,
      dependencyAGcThrashing: true,
      decayWindow1Elapsed: true,
      decayWindow2Elapsed: true,
      decayWindowFullyRecoveredElapsed: true,
      unmitigatedSpread: true,
      decoyReaccumulationWindowElapsed: true,
      oomChurnOnset: true,
    },
  },
];

export {
  SHAPE_CHANGE_SHIPPED_MS,
  DEPENDENCY_A_GC_THRASHING_MS,
  DECAY_WINDOW_1_MS,
  DECAY_WINDOW_2_MS,
  DECAY_WINDOW_FULLY_RECOVERED_MS,
  UNMITIGATED_SPREAD_MS,
  DECOY_SCALING_REACCUMULATION_MS,
  OOM_CHURN_ONSET_MS,
};
