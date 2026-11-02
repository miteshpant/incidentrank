import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { scenarios } from "@incidentrank/db";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import { SiteHeader } from "@/components/site-header";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";
import { HomeCtaRow } from "@/components/home/home-cta-row";
import { WeeklyChallengeCard } from "@/components/home/weekly-challenge-card";
import { getActiveWeeklyChallenge } from "@/lib/server/weekly-challenge";
import { db } from "@/lib/server/db";
import { appBaseUrl } from "@/lib/server/app-url";

export const metadata: Metadata = {
  title: "IncidentRank — Production is the test.",
  description:
    "Diagnose incidents. Operate the system. Restore production. Prove how you think under pressure.",
  alternates: { canonical: "/" },
};

/**
 * Organization + SoftwareApplication structured data (docs/
 * implementation_plan/seopphase.md §11) — only real, supported product
 * facts: name/description/category. No fabricated ratings, reviews,
 * certifications, or pricing claims.
 */
function HomeStructuredData() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "IncidentRank",
        url: appBaseUrl(),
      },
      {
        "@type": "SoftwareApplication",
        name: "IncidentRank",
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        description:
          "Diagnose incidents. Operate the system. Restore production. Prove how you think under pressure.",
        url: appBaseUrl(),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Diagnose",
    body: "Read the architecture, metrics and timeline.",
  },
  {
    step: "02",
    title: "Act",
    body: "Change the running system using real operational controls.",
  },
  {
    step: "03",
    title: "Stabilize",
    body: "Decide when you're satisfied and finish the incident. See how your decisions performed.",
  },
];

export default async function HomePage() {
  // Weekly Challenge (phase-challege-version.md §1/§14/§15) — a compact
  // element near the hero CTA, never a large section, and never rendered
  // at all when nothing is active (no broken/empty-state card).
  const active = await getActiveWeeklyChallenge();
  const activeScenarioRow = active
    ? await db.query.scenarios.findFirst({
        where: eq(scenarios.id, active.scenarioId),
        columns: { slug: true, name: true },
      })
    : null;
  const activeScenarioEntry = activeScenarioRow
    ? getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, activeScenarioRow.slug)
    : null;

  return (
    <main className="flex flex-1 flex-col">
      <HomeStructuredData />
      <PageViewTracker eventName="homepage_view" />
      <SiteHeader />

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-24">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Engineering assessment platform
        </p>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Production is the test.
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-muted text-pretty">
          IncidentRank puts you inside realistic production incidents.
          Diagnose the problem. Make operational decisions. Stabilize the
          system and see how your choices perform.
        </p>

        <p className="mt-4 max-w-2xl text-sm text-muted text-pretty">
          IncidentRank does not ask engineers what they would do. It puts
          them inside a running production incident and measures what
          happens when they actually do it.
        </p>

        <HomeCtaRow />

        <p className="mt-4 font-mono text-xs text-muted">
          New free incidents available regularly. No credit card required.
        </p>

        {activeScenarioRow && activeScenarioEntry && (
          <WeeklyChallengeCard
            scenarioSlug={activeScenarioRow.slug}
            scenarioName={activeScenarioRow.name}
            difficulty={activeScenarioEntry.definition.difficulty}
          />
        )}
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <p className="font-mono text-xs uppercase tracking-widest text-muted">
            How it works
          </p>

          <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step}>
                <p className="font-mono text-xs text-muted">{item.step}</p>
                <p className="mt-1 text-base font-semibold tracking-tight">
                  {item.title}
                </p>
                <p className="mt-2 text-sm text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <p className="text-lg font-semibold tracking-tight sm:text-xl">
            Not multiple choice. Not a theoretical interview question.
          </p>
          <p className="mt-2 text-sm text-muted">
            You operate the system. Your actions change what happens next.
          </p>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-5 font-mono text-xs text-muted">
          <span>IncidentRank</span>
          <Link href="/contact" className="hover:text-foreground">
            For Companies — Contact
          </Link>
        </div>
      </footer>
    </main>
  );
}
