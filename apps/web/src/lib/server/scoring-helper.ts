import "server-only";
import type { ScoringInputs } from "@incidentrank/simulator";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import { scoreAuthoredAttempt, type AuthoredScenario } from "@incidentrank/scenarios/authoring";
import { getDraftVersion, getLatestPublishedVersion } from "./scenario-access";

export interface AttemptScoreResult {
  total: number;
  breakdown: Record<string, number>;
  /** Phase 10G — see AuthoredScoreResult.maxPoints's doc comment (packages/scenarios/src/authoring/score.ts). */
  maxPoints: Record<string, number>;
}

/**
 * Scoring is always computed server-side from raw ScoringInputs (never
 * authored scoring bands), resolved generically through ONE engine
 * (scoreAuthoredAttempt) regardless of scenario ownership — see
 * docs/implementation_plan/phase6.md's scoring-convergence mandate. This
 * function must never contain scenario-slug knowledge: an
 * incidentrank-owned scenario's ScenarioScoringConfig comes from its
 * BUILT_IN_SCENARIO_CATALOG entry; an organization-owned scenario's comes
 * from its pinned scenario_versions row, never trusted from the client.
 * Adding built-in scenario #101 means adding a catalog entry — never
 * touching this function. A catalog entry missing a resolvable scoring
 * config fails loudly (throws) rather than silently falling back to any
 * other scenario's bands. This is the one place scoring bands are read
 * at all — they are never sent to the browser, per the Phase 5 privacy
 * directive. Shared by both the client-submitted completion route
 * (practice/legacy) and the Phase 5.1 server-authoritative assessment
 * runtime, so there is exactly one scoring code path regardless of which
 * runtime reached a terminal state.
 */
export async function scoreAttempt(
  attempt: {
    scenarioId: string;
    scenario: { slug: string; ownershipType: string };
    scenarioVersion: number;
  },
  inputs: ScoringInputs,
): Promise<AttemptScoreResult> {
  if (attempt.scenario.ownershipType === "incidentrank") {
    const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, attempt.scenario.slug);
    if (!entry) {
      throw new Error(
        `No built-in scenario catalog entry found for slug "${attempt.scenario.slug}"`,
      );
    }
    const result = scoreAuthoredAttempt(entry.scoring, inputs);
    return { total: result.total, breakdown: result.breakdown, maxPoints: result.maxPoints };
  }

  const published = await getLatestPublishedVersion(attempt.scenarioId);
  const draft = published ? null : await getDraftVersion(attempt.scenarioId);
  const versionRow = published ?? draft;
  if (!versionRow) {
    throw new Error(`No scenario_versions row found for scenario ${attempt.scenarioId}`);
  }

  const authored = versionRow.definitionJson as AuthoredScenario;
  const result = scoreAuthoredAttempt(authored.scoring, inputs);
  return { total: result.total, breakdown: result.breakdown, maxPoints: result.maxPoints };
}
