import { describe, expect, it } from "vitest";
import { replayAttempt, evaluateCandidateDeclaredFinish } from "@incidentrank/simulator";
import { BUILT_IN_SCENARIO_CATALOG } from "../library/catalog";
import { listBuiltInScenarioEntries } from "../library/types";
import { GOLDEN_PATHS } from "./registry";

/**
 * Phase 7.2, docs/implementation_plan/phase7.action.md section 14: proves
 * every built-in scenario has a deterministic successful golden path
 * through the real engine. No scenario-specific branching — scenario
 * knowledge lives only in the golden-path fixtures (registry.ts),
 * extracted from each scenario's own existing `.test.ts` good path.
 */
describe("catalog-wide golden-path solvability", () => {
  const entries = listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG);

  it("has a golden-path fixture for every built-in scenario", () => {
    const missing = entries
      .map((entry) => entry.definition.slug)
      .filter((slug) => !GOLDEN_PATHS[slug]);
    expect(missing).toEqual([]);
  });

  it.each(entries.map((entry) => [entry.definition.slug, entry] as const))(
    "%s: golden path resolves at the expected tier through the real engine",
    (slug, entry) => {
      const goldenPath = GOLDEN_PATHS[slug];
      expect(goldenPath, `missing golden path for ${slug}`).toBeDefined();

      const { state } = replayAttempt({
        scenario: entry.definition.simulation,
        elapsedMs: goldenPath!.finishAtMs,
        actionGroups: goldenPath!.actions.map((action) => ({
          elapsedMs: action.atMs,
          changes: [{ controlKey: action.controlKey, value: action.value }],
        })),
      });

      // The engine itself must never have auto-resolved (Phase 7.1 doctrine).
      expect(state.status).not.toBe("resolved");

      const finish = evaluateCandidateDeclaredFinish(entry.definition.simulation, state);
      expect(finish.outcome).toBe(goldenPath!.expectedOutcome);
      expect(finish.completionTier).toBe(goldenPath!.expectedCompletionTier);
    },
  );
});
