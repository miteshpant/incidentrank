import type { CandidateUIDescriptor } from "../candidate-ui";
import type { ScenarioDefinition } from "../types";
import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * One catalog entry = everything the platform needs to run, display,
 * score, and list an IncidentRank-owned (built-in) scenario — the single
 * source of truth that replaces every hardcoded per-slug dispatch this
 * Phase 6 effort removes (scenario-registry.ts's PLAYABLE_BUILTIN_
 * SCENARIO_SLUGS/SIMULATION_DEFINITIONS_BY_SLUG_VERSION, scoring-helper.ts's
 * ownershipType==='incidentrank' branch, the assessment scenario route's
 * resolveCandidateUI slug check). Adding scenario #21 (or #101) means
 * adding one entry here — never touching any of those call sites.
 */
export interface BuiltInScenarioEntry {
  definition: ScenarioDefinition;
  candidateUI: CandidateUIDescriptor;
  scoring: AuthoredScoringConfig;
}

export type BuiltInScenarioCatalog = Record<string, BuiltInScenarioEntry>;

/** Looks up a catalog entry by slug, or null if no built-in scenario has that slug. */
export function getBuiltInScenarioEntry(
  catalog: BuiltInScenarioCatalog,
  slug: string,
): BuiltInScenarioEntry | null {
  return catalog[slug] ?? null;
}

/** Every entry in the catalog, in authored (insertion) order. */
export function listBuiltInScenarioEntries(catalog: BuiltInScenarioCatalog): BuiltInScenarioEntry[] {
  return Object.values(catalog);
}

/** Every entry whose library metadata marks it as part of the public library (excludes genericity-proof-only entries, if any remain). */
export function listPublicBuiltInScenarioEntries(
  catalog: BuiltInScenarioCatalog,
): BuiltInScenarioEntry[] {
  return listBuiltInScenarioEntries(catalog).filter((entry) => entry.definition.library);
}
