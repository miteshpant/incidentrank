import { describe, expect, it } from "vitest";
import {
  BUILT_IN_SCENARIO_CATALOG,
  getBuiltInScenarioEntry,
  type BuiltInScenarioEntry,
} from "./index";
import { canPublishScenario, validateBuiltInScenario } from "./validate-built-in";

/**
 * Phase 10G §5 — the validation contract for built-in scenarios. Covers
 * the doc's four required cases: missing golden path, invalid component
 * reference, invalid/non-standard score maxPoints, and a fully valid
 * scenario producing zero errors. Uses the real Phase 10F reference
 * incident (checkout-payment-inventory-redis-contention) as the known-
 * good subject, and structurally-mutated clones of it for the negative
 * cases — never a hand-rolled minimal fixture, so these tests exercise
 * the exact shape every other built-in scenario has.
 */
function referenceEntry(): BuiltInScenarioEntry {
  const entry = getBuiltInScenarioEntry(
    BUILT_IN_SCENARIO_CATALOG,
    "checkout-payment-inventory-redis-contention",
  );
  if (!entry) throw new Error("reference incident not found in catalog");
  return entry;
}

describe("validateBuiltInScenario", () => {
  it("a fully valid scenario (the reference incident) produces zero errors", () => {
    const errors = validateBuiltInScenario(referenceEntry());
    expect(errors).toEqual([]);
  });

  it("canPublishScenario reports publishable:true with zero errors for a valid scenario", () => {
    const result = canPublishScenario(referenceEntry());
    expect(result.publishable).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("flags a missing golden-path registration with a specific, clear error", () => {
    const entry = referenceEntry();
    const mutated: BuiltInScenarioEntry = {
      ...entry,
      definition: { ...entry.definition, slug: "not-a-real-registered-slug" },
    };

    const errors = validateBuiltInScenario(mutated);
    const goldenPathError = errors.find((e) => e.path === "goldenPath");
    expect(goldenPathError).toBeDefined();
    expect(goldenPathError?.message).toMatch(/missing golden path registration/i);
  });

  it("flags a control referencing an unknown architecture node", () => {
    const entry = referenceEntry();
    const mutated: BuiltInScenarioEntry = {
      ...entry,
      candidateUI: {
        ...entry.candidateUI,
        controls: entry.candidateUI.controls.map((control, i) =>
          i === 0 ? { ...control, componentId: "no-such-node" } : control,
        ),
      },
    };

    const errors = validateBuiltInScenario(mutated);
    const componentError = errors.find((e) => e.path.includes("componentId"));
    expect(componentError).toBeDefined();
    expect(componentError?.message).toMatch(/unknown architecture node/i);
  });

  it("flags an edge referencing an unknown architecture node", () => {
    const entry = referenceEntry();
    const mutated: BuiltInScenarioEntry = {
      ...entry,
      definition: {
        ...entry.definition,
        simulation: {
          ...entry.definition.simulation,
          architecture: {
            ...entry.definition.simulation.architecture,
            edges: [
              ...entry.definition.simulation.architecture.edges,
              { from: "no-such-node", to: "also-no-such-node" },
            ],
          },
        },
      },
    };

    const errors = validateBuiltInScenario(mutated);
    expect(errors.some((e) => e.path === "architecture.edges[" + (entry.definition.simulation.architecture.edges.length) + "].from")).toBe(true);
  });

  it("flags a non-standard scoring maxPoints split", () => {
    const entry = referenceEntry();
    const mutated: BuiltInScenarioEntry = {
      ...entry,
      scoring: {
        ...entry.scoring,
        dimensions: entry.scoring.dimensions.map((d) =>
          d.dimension === "operationalEfficiency" ? { ...d, maxPoints: 150 } : d,
        ),
      },
    };

    const errors = validateBuiltInScenario(mutated);
    const maxPointsError = errors.find((e) => e.path.includes("maxPoints"));
    expect(maxPointsError).toBeDefined();
    expect(maxPointsError?.message).toMatch(/must use maxPoints/i);
  });

  it("flags a scoring total that no longer sums to 1000", () => {
    const entry = referenceEntry();
    const mutated: BuiltInScenarioEntry = {
      ...entry,
      scoring: {
        ...entry.scoring,
        dimensions: entry.scoring.dimensions.filter((d) => d.dimension !== "operationalEfficiency"),
      },
    };

    const errors = validateBuiltInScenario(mutated);
    expect(errors.some((e) => e.message.includes('Missing required scoring dimension "operationalEfficiency"'))).toBe(true);
  });

  it("flags a metric referencing an unknown state key", () => {
    const entry = referenceEntry();
    const mutated: BuiltInScenarioEntry = {
      ...entry,
      candidateUI: {
        ...entry.candidateUI,
        metrics: entry.candidateUI.metrics.map((metric, i) =>
          i === 0 ? { ...metric, sourceStateKey: "no-such-state-key" } : metric,
        ),
      },
    };

    const errors = validateBuiltInScenario(mutated);
    const metricError = errors.find((e) => e.path.includes("sourceStateKey"));
    expect(metricError).toBeDefined();
    expect(metricError?.message).toMatch(/unknown state key/i);
  });

  it("flags a scenario missing release metadata (no structure)", () => {
    const entry = referenceEntry();
    const mutated: BuiltInScenarioEntry = {
      ...entry,
      definition: { ...entry.definition, structure: undefined as never },
    };

    const errors = validateBuiltInScenario(mutated);
    expect(errors.some((e) => e.path === "structure")).toBe(true);
  });

  it("every scenario in the real catalog passes validation (catalog-wide sanity check)", () => {
    const failures: { slug: string; errors: ReturnType<typeof validateBuiltInScenario> }[] = [];
    for (const slug of Object.keys(BUILT_IN_SCENARIO_CATALOG)) {
      const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, slug);
      if (!entry) continue;
      const errors = validateBuiltInScenario(entry);
      if (errors.length > 0) failures.push({ slug, errors });
    }
    expect(failures).toEqual([]);
  });
});
