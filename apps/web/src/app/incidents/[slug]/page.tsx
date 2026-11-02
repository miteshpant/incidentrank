import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BUILT_IN_SCENARIO_CATALOG,
  getBuiltInScenarioEntry,
  toPublicScenarioMetadata,
} from "@incidentrank/scenarios";
import {
  getActiveScenarioBySlug,
  isBuiltInScenarioCurrentlyPublished,
} from "@/lib/server/scenario-registry";
import { resolveBuiltInScenarioPracticeAccess } from "@/lib/server/resolve-practice-access";
import { appBaseUrl } from "@/lib/server/app-url";
import { GenericIncidentConsole } from "@/components/scenario-console/generic-incident-console";
import { LockedScenarioScreen } from "@/components/scenario-console/locked-scenario-screen";
import { PublicScenarioLanding } from "@/components/scenario-console/public-scenario-landing";
import { ScenarioStructuredData } from "@/components/scenario-console/scenario-structured-data";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";

// Per-scenario, per-request routing decision (unknown slug -> notFound(),
// locked vs. playable) — never a meaningful static/prerendered version,
// same reasoning as organizations/[slug]/page.tsx's own `instant = false`.
export const instant = false;

/**
 * Public SEO metadata only — derived from PublicScenarioMetadata, never
 * the full ScenarioDefinition (docs/implementation_plan/seopphase.md §5).
 * Returns {} for an unknown/unpublished slug so the page's own notFound()
 * remains the single source of truth for 404 behavior.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, slug);
  if (!entry || !(await isBuiltInScenarioCurrentlyPublished(slug))) return {};

  const meta = toPublicScenarioMetadata(entry.definition);
  const url = `${appBaseUrl()}/incidents/${slug}`;
  const title = `${meta.name} — System Design Incident Practice | IncidentRank`;

  return {
    title,
    description: meta.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: meta.description,
      url,
      siteName: "IncidentRank",
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description: meta.description,
    },
  };
}

/**
 * The generic practice route for every built-in scenario except Payment
 * Retry Storm, which keeps its own hand-written route/components
 * unchanged (apps/web/src/app/incidents/payment-retry-storm) per the
 * Phase 6 promotion contract: "adding scenario #21 requires no new
 * route/component." A paid scenario renders a locked state instead of
 * the console — see practice-access.ts; the console component is never
 * even mounted for a locked scenario, so the local simulator never runs
 * for a scenario the candidate isn't entitled to practice-play.
 */
export default async function ScenarioPracticePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, slug);
  if (!entry) notFound();
  // Phase 10G §4: a draft or scheduled-but-not-yet-released scenario
  // must never be reachable here, even though this page resolves
  // directly from the catalog rather than through getActiveScenarioBySlug.
  if (!(await isBuiltInScenarioCurrentlyPublished(slug))) notFound();

  // The only scenario-shaped prop ever passed into a client component
  // below — never the full entry.definition, and never
  // entry.definition.simulation either (see docs/implementation_plan/
  // seopphase.md §1/§15: the full ScenarioSimulationDefinition —
  // rules/successCondition/failureCondition/timedEvents/
  // actionClassifications — must never cross the server/client boundary
  // via a serialized prop, which it would if passed here even for a
  // visitor who never starts the incident. GenericIncidentConsole instead
  // fetches it lazily from GET /api/incidents/[slug]/simulation, gated by
  // the exact same resolveBuiltInScenarioPracticeAccess check below.
  const publicScenario = toPublicScenarioMetadata(entry.definition);

  // Phase 10F: persisted scenarios.is_free is authoritative, not the
  // compiled definition literal — lets a free incident rotate without a
  // code deploy. getActiveScenarioBySlug is already scoped to
  // ownershipType="incidentrank" (see its own doc comment), so this can
  // never read a different organization's row for a colliding slug.
  const scenarioForAccess = await getActiveScenarioBySlug(slug);
  const { access, hasExistingInProgressAttempt, availablePassId } =
    await resolveBuiltInScenarioPracticeAccess(scenarioForAccess, entry.definition.isFree);

  // A candidate resuming (refresh/revisit) an already-in-progress,
  // pass-funded attempt must never be locked out: by the time an attempt
  // exists, its funding pass is already "consumed" (not available/bound),
  // so the pass-state check would otherwise show the locked screen on
  // every refresh. Mirrors the same existing-attempt-first ordering fix
  // already applied to POST /api/attempts/route.ts for this exact
  // regression class.
  if (hasExistingInProgressAttempt) {
    return (
      <>
        <PageViewTracker eventName="incident_view" scenarioSlug={slug} />
        <PublicScenarioLanding metadata={publicScenario} />
        <ScenarioStructuredData metadata={publicScenario} />
        <GenericIncidentConsole scenario={publicScenario} candidateUI={entry.candidateUI} />
      </>
    );
  }

  if (!access.allowed) {
    return (
      <>
        <PageViewTracker eventName="incident_view" scenarioSlug={slug} />
        <PublicScenarioLanding metadata={publicScenario} />
        <ScenarioStructuredData metadata={publicScenario} />
        <LockedScenarioScreen
          scenario={publicScenario}
          access={access}
          availablePassId={availablePassId}
        />
      </>
    );
  }

  return (
    <>
      <PageViewTracker eventName="incident_view" scenarioSlug={slug} />
      <PublicScenarioLanding metadata={publicScenario} />
      <ScenarioStructuredData metadata={publicScenario} />
      <GenericIncidentConsole scenario={publicScenario} candidateUI={entry.candidateUI} />
    </>
  );
}
