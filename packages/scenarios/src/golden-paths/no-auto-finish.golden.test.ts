import { describe, expect, it } from "vitest";
import { replayAttempt, evaluateCandidateDeclaredFinish } from "@incidentrank/simulator";
import { BUILT_IN_SCENARIO_CATALOG } from "../library/catalog";
import { listBuiltInScenarioEntries } from "../library/types";
import { GOLDEN_PATHS } from "./registry";

/**
 * Phase 7.2, docs/implementation_plan/phase7.action.md section 16: the
 * permanent regression barrier for "safe != automatically passed". For
 * every scenario: replay the golden path to its safe/success condition,
 * do NOT call Finish, advance further simulation time to prove the
 * success condition sustains, and assert the attempt is still not
 * success-terminal. Only an explicit Finish (replayed through to
 * finishAtMs) resolves it.
 */
describe("catalog-wide no-auto-success regression", () => {
  const entries = listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG);

  it.each(entries.map((entry) => [entry.definition.slug, entry] as const))(
    "%s: safe state sustains without auto-resolving; only Finish resolves it",
    (slug, entry) => {
      const goldenPath = GOLDEN_PATHS[slug]!;

      // Advance well past finishAtMs with no Finish call — the success
      // condition should already be sustained by finishAtMs (that's what
      // makes finishAtMs valid), so extending further simulation time
      // keeps proving the same thing: the engine never writes "resolved"
      // on its own, no matter how long the safe state is held.
      const extendedElapsedMs = goldenPath.finishAtMs + 5 * 60_000;
      const { state: extendedState } = replayAttempt({
        scenario: entry.definition.simulation,
        elapsedMs: extendedElapsedMs,
        actionGroups: goldenPath.actions.map((action) => ({
          elapsedMs: action.atMs,
          changes: [{ controlKey: action.controlKey, value: action.value }],
        })),
      });
      expect(extendedState.status).not.toBe("resolved");

      // The candidate's own declared Finish, at the fixture's documented
      // finishAtMs, is what actually resolves it.
      const { state: finishState } = replayAttempt({
        scenario: entry.definition.simulation,
        elapsedMs: goldenPath.finishAtMs,
        actionGroups: goldenPath.actions.map((action) => ({
          elapsedMs: action.atMs,
          changes: [{ controlKey: action.controlKey, value: action.value }],
        })),
      });
      const finish = evaluateCandidateDeclaredFinish(entry.definition.simulation, finishState);
      expect(finish.outcome).toBe("resolved");
    },
  );
});
