import Link from "next/link";
import type { PublicScenarioMetadata } from "@incidentrank/scenarios";
import { HideOnceHydrated } from "@/components/hide-once-hydrated";

const DIFFICULTY_LABEL: Record<PublicScenarioMetadata["difficulty"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  senior: "Senior",
  staff: "Staff",
  senior_staff: "Senior Staff",
  principal: "Principal",
};

/**
 * Server-rendered, crawler-visible public landing content for a scenario
 * page — rendered unconditionally, before any access-gate branch, so a
 * search crawler (which never executes the client runtime below it) sees
 * real title/teaser/difficulty/category/skills/CTA in the initial HTML
 * (docs/implementation_plan/seopphase.md §3). Takes only
 * PublicScenarioMetadata — never the full ScenarioDefinition — so there is
 * no private-field leak risk by construction, matching the same safety
 * boundary already enforced on the briefing/locked/listing components.
 *
 * Wrapped in HideOnceHydrated: the briefing/locked screen rendered below
 * this already repeats name/description/difficulty/skills once the client
 * runtime mounts, so a real (JS-executing) visitor would otherwise see
 * the title and teaser twice. A crawler or no-JS client never hydrates,
 * so this block is exactly what they see; a real visitor sees it
 * disappear once the fuller briefing/locked screen takes over.
 */
export function PublicScenarioLanding({ metadata }: { metadata: PublicScenarioMetadata }) {
  return (
    <HideOnceHydrated>
      <section className="mx-auto w-full max-w-2xl px-6 pt-16">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">
          {DIFFICULTY_LABEL[metadata.difficulty]}
          {metadata.category ? ` · ${metadata.category}` : ""}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{metadata.name}</h1>
        <p className="mt-4 text-base text-foreground">{metadata.description}</p>

        {metadata.publicSkills && metadata.publicSkills.length > 0 && (
          <div className="mt-6">
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted">Skills</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {metadata.publicSkills.map((skill) => (
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

        <nav className="mt-8 flex gap-4 font-mono text-xs text-muted">
          <Link href="/incidents" className="hover:text-foreground">
            ← Back to Incidents
          </Link>
          <Link href="/" className="hover:text-foreground">
            IncidentRank Home
          </Link>
        </nav>
      </section>
    </HideOnceHydrated>
  );
}
