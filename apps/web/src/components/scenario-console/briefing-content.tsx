import type { ArchitectureDefinition } from "@incidentrank/simulator";
import type { ScenarioDefinition } from "@incidentrank/scenarios";
import { StructuredDescription } from "./structured-description";

const DIFFICULTY_LABEL: Record<ScenarioDefinition["difficulty"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  senior: "Senior",
  staff: "Staff",
  senior_staff: "Senior Staff",
  principal: "Principal",
};

export interface BriefingContentScenario {
  name: string;
  description: string;
  difficulty: ScenarioDefinition["difficulty"];
  estimatedMinutes: number;
  library?: ScenarioDefinition["library"];
}

interface BriefingContentProps {
  scenario: BriefingContentScenario;
  architecture: ArchitectureDefinition;
}

/**
 * The single candidate-safe briefing content shared by the
 * pre-Acknowledge screen (briefing-screen.tsx) and the post-start
 * Incident Brief (incident-brief.tsx) — one source of truth so the two
 * never drift (Phase 7.1, docs/implementation_plan/
 * phase7.action.md sections 9-10: "Avoid duplicated scenario-
 * description strings... copy/paste versions that may drift later").
 * Candidate-safe only (name, difficulty, category, time, skills,
 * description, architecture topology) — never rules, solutions,
 * success/failure thresholds, scoring bands, or hidden events.
 */
export function BriefingContent({ scenario, architecture }: BriefingContentProps) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{scenario.name}</h1>

      <StructuredDescription description={scenario.description} />

      <dl className="mt-6 grid grid-cols-3 gap-4 font-mono text-xs">
        <div>
          <dt className="uppercase tracking-wide text-muted">Difficulty</dt>
          <dd className="mt-1 text-foreground">{DIFFICULTY_LABEL[scenario.difficulty]}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-muted">Expected Time</dt>
          <dd className="mt-1 text-foreground">~{scenario.estimatedMinutes} min</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-muted">Category</dt>
          <dd className="mt-1 text-foreground">
            {scenario.library?.category ?? "Incident Response"}
          </dd>
        </div>
      </dl>

      {scenario.library && scenario.library.skills.length > 0 && (
        <div className="mt-6">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted">Skills</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {scenario.library.skills.map((skill) => (
              <li
                key={skill}
                className="rounded border border-border px-2 py-0.5 text-xs text-muted"
              >
                {skill}
              </li>
            ))}
          </ul>
        </div>
      )}

      {architecture.nodes.length > 0 && (
        <div className="mt-6">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
            System Architecture
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {architecture.nodes.map((node) => (
              <li
                key={node.id}
                className="rounded border border-border px-2 py-0.5 text-xs text-foreground"
              >
                {node.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
