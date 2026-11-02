import type { PublicScenarioMetadata } from "@incidentrank/scenarios";

const DIFFICULTY_LABEL: Record<PublicScenarioMetadata["difficulty"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  senior: "Senior",
  staff: "Staff",
  senior_staff: "Senior Staff",
  principal: "Principal",
};

/**
 * The shared scenario-description block (title, description, difficulty/
 * time/category, skills, architecture nodes) — factored out of
 * LockedScenarioScreen so the "see this scenario's description" surface
 * on /attempts/incidents/[slug] renders identically rather than
 * duplicating this markup. Takes the public-safe projection, not the
 * full ScenarioDefinition — this component (and every client it's
 * rendered inside) never needs rules/scoring/timed events, and must
 * never receive them (docs/implementation_plan/seopphase.md §1/§15).
 */
export function ScenarioMetadata({ scenario }: { scenario: PublicScenarioMetadata }) {
  const architecture = scenario.architecture;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{scenario.name}</h1>

      <p className="mt-4 text-sm text-foreground">{scenario.description}</p>

      <dl className="mt-6 grid grid-cols-3 gap-4 font-mono text-xs">
        <div>
          <dt className="uppercase tracking-wide text-muted">Difficulty</dt>
          <dd className="mt-1 text-foreground">
            {DIFFICULTY_LABEL[scenario.difficulty]}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-muted">Expected Time</dt>
          <dd className="mt-1 text-foreground">~{scenario.estimatedMinutes} min</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-muted">Category</dt>
          <dd className="mt-1 text-foreground">
            {scenario.category ?? "Incident Response"}
          </dd>
        </div>
      </dl>

      {scenario.publicSkills && scenario.publicSkills.length > 0 && (
        <div className="mt-6">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
            Skills
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {scenario.publicSkills.map((skill) => (
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
