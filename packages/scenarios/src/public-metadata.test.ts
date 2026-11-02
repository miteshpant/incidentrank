import { describe, expect, it } from "vitest";
import { BUILT_IN_SCENARIO_CATALOG } from "./library/catalog";
import { listBuiltInScenarioEntries } from "./library/types";
import { toPublicScenarioMetadata } from "./public-metadata";

// Private keys/markers that must never appear in the public projection —
// docs/implementation_plan/seopphase.md §15's literal regression-test list.
const PRIVATE_MARKERS = [
  "successCondition",
  "acceptableCondition",
  "feedbackRules",
  "scoring",
  "timedEvents",
  "rules",
  "goldenPath",
  "initialState",
  "failureCondition",
  "controls",
  "actionClassifications",
];

describe("toPublicScenarioMetadata", () => {
  const entries = listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG);

  it.each(entries.map((entry) => [entry.definition.slug, entry] as const))(
    "%s: public projection never contains a private scenario-internals key",
    (_slug, entry) => {
      const publicMeta = toPublicScenarioMetadata(entry.definition);
      // Match as a JSON *key* (`"rules":`), not a loose substring — safe
      // architecture topology labels (e.g. a node literally named "Rules
      // Engine") may legitimately contain these words in prose/labels
      // without leaking the private field of the same name.
      const serialized = JSON.stringify(publicMeta);
      for (const marker of PRIVATE_MARKERS) {
        expect(serialized.includes(`"${marker}":`)).toBe(false);
      }
    },
  );

  it("never includes the full simulation object, only its safe architecture topology", () => {
    for (const entry of entries) {
      const publicMeta = toPublicScenarioMetadata(entry.definition);
      expect(publicMeta).not.toHaveProperty("simulation");
      expect(publicMeta).not.toHaveProperty("structure");
      expect(publicMeta).not.toHaveProperty("version");
      expect(publicMeta.architecture).toEqual(entry.definition.simulation.architecture);
    }
  });

  it("derives a non-empty public description for every scenario", () => {
    for (const entry of entries) {
      const publicMeta = toPublicScenarioMetadata(entry.definition);
      expect(publicMeta.description.length).toBeGreaterThan(0);
    }
  });
});
