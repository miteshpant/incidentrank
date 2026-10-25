import type { CompletionTier, ControlValue } from "@incidentrank/simulator";

/**
 * One canonical, known-good action extracted from the scenario's own
 * existing `.test.ts` "good path" — see docs/implementation_plan/
 * phase7.action.md section 13. `atMs` is elapsed simulation time, not
 * wall-clock time.
 */
export interface GoldenPathAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

/**
 * A scenario's single canonical golden path — extracted, never
 * hand-invented, from the scenario's own `.test.ts` file (phase7.action.md
 * section 13: "Do not invent 100 new solutions... The current scenario
 * tests are the source of truth"). Internal test-support only: this
 * directory is never re-exported from packages/scenarios/src/index.ts, so
 * golden paths never reach a candidate-facing bundle.
 */
export interface ScenarioGoldenPath {
  scenarioSlug: string;
  actions: GoldenPathAction[];
  /** Elapsed simulation time at which Finish Incident is declared. */
  finishAtMs: number;
  expectedOutcome: "resolved";
  expectedCompletionTier: CompletionTier;
}
