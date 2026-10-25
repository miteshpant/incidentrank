import { describe, expect, it } from "vitest";
import { createInitialState, evaluateCandidateDeclaredFinish } from "@incidentrank/simulator";
import { BUILT_IN_SCENARIO_CATALOG } from "../library/catalog";
import { listBuiltInScenarioEntries } from "../library/types";

/**
 * Phase 7.2, docs/implementation_plan/phase7.action.md section 15:
 * zero candidate action + Finish Incident = declared_unstable, for every
 * built-in scenario. Documented-exceptions allowlist structure is kept
 * even though it is expected to stay empty — never silently exclude a
 * scenario from this invariant. If a legitimate exception is ever found,
 * document here: slug, reason, why zero-action success is legitimate,
 * and why it does not violate the product doctrine.
 */
const DOCUMENTED_EXCEPTIONS: ReadonlySet<string> = new Set([]);

describe("catalog-wide immediate-Finish invariant", () => {
  const entries = listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG).filter(
    (entry) => !DOCUMENTED_EXCEPTIONS.has(entry.definition.slug),
  );

  it("documented exceptions allowlist is empty today", () => {
    expect(Array.from(DOCUMENTED_EXCEPTIONS)).toEqual([]);
  });

  it.each(entries.map((entry) => [entry.definition.slug, entry] as const))(
    "%s: zero candidate action + immediate Finish -> declared_unstable",
    (_slug, entry) => {
      const state = createInitialState(entry.definition.simulation);
      const finish = evaluateCandidateDeclaredFinish(entry.definition.simulation, state);
      expect(finish.outcome).toBe("declared_unstable");
      expect(finish.completionTier).toBeNull();
    },
  );
});
