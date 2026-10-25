import { describe, expect, it } from "vitest";
import { replayAttempt, evaluateCandidateDeclaredFinish, extractFinishScoringInputs } from "@incidentrank/simulator";
import { BUILT_IN_SCENARIO_CATALOG } from "../library/catalog";
import { listBuiltInScenarioEntries } from "../library/types";
import { scoreAuthoredAttempt } from "../authoring/score";
import { GOLDEN_PATHS } from "./registry";

/**
 * Phase 7.2, docs/implementation_plan/phase7.action.md section 17: runs
 * the full authoritative pipeline (replay -> completion evaluation ->
 * scoring inputs -> score) twice per golden path and asserts deep
 * deterministic equality — state, scoring inputs, total score, all six
 * dimensions, completion tier, outcome, and (via the full ScoringInputs
 * object) peak/historical/cumulative metrics. Not just the final score.
 */
function runPipeline(entry: ReturnType<typeof listBuiltInScenarioEntries>[number], goldenPath: (typeof GOLDEN_PATHS)[string]) {
  const { state } = replayAttempt({
    scenario: entry.definition.simulation,
    elapsedMs: goldenPath.finishAtMs,
    actionGroups: goldenPath.actions.map((action) => ({
      elapsedMs: action.atMs,
      changes: [{ controlKey: action.controlKey, value: action.value }],
    })),
  });
  const finish = evaluateCandidateDeclaredFinish(entry.definition.simulation, state);
  const scoringInputs = extractFinishScoringInputs(entry.definition.simulation, finish);
  const score = scoreAuthoredAttempt(entry.scoring, scoringInputs);
  return { state, finish, scoringInputs, score };
}

describe("catalog-wide deterministic replay proof", () => {
  const entries = listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG);

  it.each(entries.map((entry) => [entry.definition.slug, entry] as const))(
    "%s: replay -> completion -> scoring pipeline is deterministic across two independent runs",
    (slug, entry) => {
      const goldenPath = GOLDEN_PATHS[slug]!;

      const runA = runPipeline(entry, goldenPath);
      const runB = runPipeline(entry, goldenPath);

      expect(runA.state).toEqual(runB.state);
      expect(runA.finish).toEqual(runB.finish);
      expect(runA.scoringInputs).toEqual(runB.scoringInputs);
      expect(runA.score).toEqual(runB.score);

      // Sanity: the pipeline actually reached the expected outcome/tier
      // (not just "equal to itself" vacuously).
      expect(runA.finish.outcome).toBe(goldenPath.expectedOutcome);
      expect(runA.finish.completionTier).toBe(goldenPath.expectedCompletionTier);
    },
  );
});
