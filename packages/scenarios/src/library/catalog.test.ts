import { describe, expect, it } from "vitest";
import { BUILT_IN_SCENARIO_CATALOG } from "./catalog";
import { getBuiltInScenarioEntry, listBuiltInScenarioEntries } from "./types";
import { validateAuthoredScenario } from "../authoring/validate";
import { buildValidAuthoredScenario } from "../authoring/fixtures";

describe("BUILT_IN_SCENARIO_CATALOG", () => {
  it("keys every entry by its own definition slug", () => {
    for (const [slug, entry] of Object.entries(BUILT_IN_SCENARIO_CATALOG)) {
      expect(entry.definition.slug).toBe(slug);
    }
  });

  it("has no duplicate built-in slugs — the DB's partial unique index on (slug) WHERE ownership_type='incidentrank' depends on this invariant already holding in source", () => {
    const slugs = listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG).map(
      (entry) => entry.definition.slug,
    );
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every entry real library metadata with exactly one category", () => {
    for (const entry of listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG)) {
      expect(entry.definition.library, `${entry.definition.slug} is missing library metadata`).toBeDefined();
      expect(entry.definition.library?.tags.length).toBeGreaterThan(0);
      expect(entry.definition.library?.skills.length).toBeGreaterThan(0);
      expect(entry.definition.library?.shortDescription.length).toBeGreaterThan(0);
    }
  });

  it("gives every entry required difficulty/duration metadata", () => {
    const validDifficulties = new Set([
      "beginner",
      "intermediate",
      "senior",
      "staff",
      "senior_staff",
      "principal",
    ]);
    for (const entry of listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG)) {
      expect(
        validDifficulties.has(entry.definition.difficulty),
        `${entry.definition.slug} has an invalid difficulty "${entry.definition.difficulty}"`,
      ).toBe(true);
      expect(
        entry.definition.estimatedMinutes,
        `${entry.definition.slug} must have a positive estimatedMinutes`,
      ).toBeGreaterThan(0);
    }
  });

  it("marks exactly 3 IncidentRank-owned launch scenarios as free, explicitly in source — never inferred by order", () => {
    // Per docs/implementation_plan/phase6.md: "The 3 free scenarios should
    // be explicitly marked in source/config, not inferred by order" and
    // "Add a test asserting: exactly 3 IncidentRank-owned launch scenarios
    // are free." Prevents accidental entitlement drift as more paid
    // scenarios are added in later batches.
    const INTENDED_FREE_SLUGS = new Set([
      "payment-retry-storm",
      "database-connection-saturation",
      "kafka-consumer-lag",
    ]);

    const freeEntries = listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG).filter(
      (entry) => entry.definition.isFree,
    );

    expect(freeEntries.length).toBe(3);

    const freeSlugs = new Set(freeEntries.map((e) => e.definition.slug));
    expect(freeSlugs).toEqual(INTENDED_FREE_SLUGS);
  });

  it("defaults every non-free-launch scenario to paid", () => {
    const INTENDED_FREE_SLUGS = new Set([
      "payment-retry-storm",
      "database-connection-saturation",
      "kafka-consumer-lag",
    ]);

    for (const entry of listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG)) {
      if (INTENDED_FREE_SLUGS.has(entry.definition.slug)) continue;
      expect(
        entry.definition.isFree,
        `"${entry.definition.slug}" is not an intended free launch scenario but has isFree=true`,
      ).toBe(false);
    }
  });

  it("gives every entry a scoring config whose dimension weights total 1000", () => {
    for (const entry of listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG)) {
      const total = entry.scoring.dimensions.reduce((sum, d) => sum + d.maxPoints, 0);
      expect(total, `${entry.definition.slug} scoring weights must total 1000`).toBe(1000);
    }
  });

  it("gives every entry's scoring config exactly the six required dimensions", () => {
    const required = [
      "recovery",
      "customerImpact",
      "dataIntegrity",
      "reliability",
      "costEfficiency",
      "operationalEfficiency",
    ];
    for (const entry of listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG)) {
      const dims = entry.scoring.dimensions.map((d) => d.dimension);
      for (const dim of required) {
        expect(dims, `${entry.definition.slug} is missing dimension "${dim}"`).toContain(dim);
      }
    }
  });

  it("resolves a known slug and returns null for an unknown one", () => {
    expect(getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, "payment-retry-storm")).not.toBeNull();
    expect(getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, "does-not-exist")).toBeNull();
  });

  it("makes a synthetic catalog entry's scoring config resolvable with no code changes", () => {
    // Proves the catalog itself requires no dispatch-code changes to add
    // a scenario — only data. A real AuthoredScenario's compiled scoring
    // config stands in for a hypothetical scenario #101 here.
    const authored = buildValidAuthoredScenario();
    expect(validateAuthoredScenario(authored)).toEqual([]);

    const syntheticCatalog = {
      ...BUILT_IN_SCENARIO_CATALOG,
      "synthetic-test-scenario": {
        definition: {
          id: "synthetic-test-scenario",
          slug: "synthetic-test-scenario",
          version: 1,
          name: "Synthetic Test Scenario",
          description: "Test-only.",
          difficulty: "intermediate" as const,
          estimatedMinutes: 10,
          isFree: false,
          simulation: BUILT_IN_SCENARIO_CATALOG["payment-retry-storm"]!.definition.simulation,
        },
        candidateUI: { metrics: [], controls: [], components: [] },
        scoring: authored.scoring,
      },
    };

    const resolved = getBuiltInScenarioEntry(syntheticCatalog, "synthetic-test-scenario");
    expect(resolved).not.toBeNull();
    expect(resolved?.scoring).toBe(authored.scoring);
  });
});
