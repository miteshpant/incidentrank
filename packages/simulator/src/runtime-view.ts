import type {
  ArchitectureDefinition,
  ControlDefinition,
  IncidentStatus,
  ScenarioSimulationDefinition,
  SimulationEvent,
  SimulationState,
} from "./types";

/**
 * Phase 5.1 (server-authoritative assessment runtime): the candidate-safe
 * projection of engine state. Contains everything a candidate console
 * needs to render — architecture, controls, current values/health,
 * elapsed time, status, and only the events that have already occurred —
 * and nothing a candidate should not see. By construction it can never
 * carry `rules`, `timedEvents`, `successCondition`, `failureCondition`,
 * `scoring`, `actionClassifications`, or `revenueLossRatePerMinute`: this
 * type has no field for any of them, so a server handler that returns a
 * `RuntimeView` cannot accidentally leak them the way returning the full
 * `ScenarioSimulationDefinition` could.
 */
export interface RuntimeView {
  architecture: ArchitectureDefinition;
  controls: ControlDefinition[];
  state: SimulationState;
  /** Only events whose timestampMs has already elapsed — never a future
   * timed event's consequence, even if it is already determined
   * server-side by having advanced past it internally. */
  events: SimulationEvent[];
  status: IncidentStatus;
  /** When the incident begins, for the pre-incident countdown display
   * only — the same single scalar practice mode has always shown a
   * candidate before the incident starts (derived from the scenario's
   * first timed event, which is by construction always the incident-start
   * trigger). This is the only timing fact ever lifted out of
   * `timedEvents` — no other timed event's time or effects are exposed. */
  incidentStartMs: number | null;
}

/**
 * Projects full engine state down to the candidate-safe `RuntimeView`.
 * Pure and total: never throws, never reads anything beyond `scenario`/
 * `state`/`events`. The caller (an API route) is responsible for ensuring
 * `events` itself contains only already-occurred events — this function
 * does not filter by time, since by the time a route calls it, replay has
 * already stopped advancing at exactly the authoritative elapsed time and
 * can never have generated an event timestamped later than that.
 */
export function toRuntimeView(
  scenario: ScenarioSimulationDefinition,
  state: SimulationState,
  events: SimulationEvent[],
): RuntimeView {
  return {
    architecture: scenario.architecture,
    controls: scenario.controls,
    state,
    events,
    status: state.status,
    incidentStartMs: scenario.timedEvents[0]?.atMs ?? null,
  };
}
