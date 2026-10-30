"use client";

import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { extractScoringInputs } from "@incidentrank/simulator";
import type { CandidateUIDescriptor } from "@incidentrank/scenarios";
import { scoreAuthoredAttempt, type AuthoredScoringConfig } from "@incidentrank/scenarios/authoring";
import { ScenarioPreviewConsole } from "@/components/scenario-console/scenario-preview-console";

interface PreviewConsoleProps {
  scenarioSlug: string;
  scenarioName: string;
  simulation: ScenarioSimulationDefinition;
  candidateUI: CandidateUIDescriptor;
  authoredScoring: AuthoredScoringConfig;
}

/**
 * Author-only preview/test-run console (Phase 5 spec). Composes the
 * shared ScenarioPreviewConsole (the exact candidate-facing UI, zero
 * persistence) with an author-only debug panel below it — matched rule,
 * incident state, and a live scoring-breakdown preview once the scenario
 * reaches a terminal state. Never shown to candidates or to the Phase
 * 10-era assessment-creation scenario preview (see
 * organizations/[slug]/assessments/new/scenario-preview/, which uses
 * ScenarioPreviewConsole directly with no renderBelow).
 */
export function PreviewConsole({
  scenarioSlug,
  scenarioName,
  simulation,
  candidateUI,
  authoredScoring,
}: PreviewConsoleProps) {
  return (
    <ScenarioPreviewConsole
      scenarioSlug={scenarioSlug}
      scenarioName={scenarioName}
      simulation={simulation}
      candidateUI={candidateUI}
      bannerLabel="Author Preview — not scored, not persisted, not visible to candidates"
      renderBelow={(attempt) => {
        const isTerminal = attempt.state.status === "resolved" || attempt.state.status === "failed";
        const previewScore = isTerminal
          ? scoreAuthoredAttempt(authoredScoring, extractScoringInputs(simulation, attempt.state))
          : null;

        return (
          <div className="rounded-md border border-[#d97706]/40 bg-[#d97706]/5 p-4">
            <p className="font-mono text-[10px] uppercase tracking-wide text-[#d97706]">
              Author Debug — matched rule &amp; effects
            </p>
            <p className="mt-2 text-sm">
              Matched rule id: <span className="font-mono">{attempt.state.transitions.matchedRuleId ?? "(none)"}</span>
            </p>
            <p className="mt-1 text-sm">
              Incident state: <span className="font-mono">{attempt.state.transitions.incidentState}</span>
            </p>
            {previewScore && (
              <>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-[#d97706]">
                  Preview Score (not final — recomputed server-side on real attempts)
                </p>
                <p className="mt-1 text-sm">Total: {previewScore.total} / 1000</p>
                <dl className="mt-2 flex flex-col gap-1">
                  {Object.entries(previewScore.breakdown).map(([dimension, points]) => (
                    <div key={dimension} className="flex justify-between text-xs">
                      <dt className="text-muted">{dimension}</dt>
                      <dd className="font-mono">{points}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </div>
        );
      }}
    />
  );
}
