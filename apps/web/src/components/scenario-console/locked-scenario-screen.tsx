import Link from "next/link";
import type { ScenarioDefinition } from "@incidentrank/scenarios";

const DIFFICULTY_LABEL: Record<ScenarioDefinition["difficulty"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  senior: "Senior",
  staff: "Staff",
};

/**
 * The candidate-safe locked detail/briefing preview for a paid scenario
 * — per docs/implementation_plan/phase6.md's "Paid Lock State" and
 * "Scenario Detail / Briefing Preview": discoverable, never a dead end,
 * never a dead button, never fakes a payment flow. Shows the same
 * candidate-safe fields the free-scenario briefing screen shows (name,
 * difficulty, category, time, skills, description, architecture
 * topology, free/paid status) — never rules, solutions, thresholds,
 * scoring bands, or hidden events. No billing exists yet, so this simply
 * states that plainly rather than pretending a purchase is possible.
 */
export function LockedScenarioScreen({ scenario }: { scenario: ScenarioDefinition }) {
  const architecture = scenario.simulation.architecture;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-lg border border-border bg-surface p-8">
        <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
          🔒 Paid
        </span>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {scenario.name}
        </h1>

        <p className="mt-4 text-sm text-foreground">{scenario.description}</p>

        <dl className="mt-6 grid grid-cols-3 gap-4 font-mono text-xs">
          <div>
            <dt className="uppercase tracking-wide text-muted">Difficulty</dt>
            <dd className="mt-1 text-foreground">
              {DIFFICULTY_LABEL[scenario.difficulty]}
            </dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-muted">
              Expected Time
            </dt>
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
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
              Skills
            </p>
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

        <p className="mt-6 rounded-md border border-border bg-background p-4 text-sm text-muted">
          Coming with IncidentRank Pro. This scenario isn&apos;t available in
          practice mode yet.
        </p>

        <Link
          href="/incidents"
          className="mt-8 inline-block rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
        >
          Back to Incidents
        </Link>
      </div>
    </main>
  );
}
