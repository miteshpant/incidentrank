import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { scenarios } from "@incidentrank/db";
import { BUILT_IN_SCENARIO_CATALOG, canPublishScenario, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { db } from "@/lib/server/db";
import { ScenarioEditForm } from "./scenario-edit-form";

/**
 * Platform-admin scenario detail/edit view (Phase 10G §2). Editable
 * fields are DB-row-backed metadata only (isFree, status, structure,
 * domain, releaseWeek, publishedAt) — built-in scenarios' architecture/
 * controls/scoring remain TypeScript source, reviewed via PR, not this
 * form. See docs/implementation_plan/phase10g.md and the approved plan's
 * "Scope boundaries" section for why this is intentionally narrower than
 * a full content editor.
 */
export async function ScenarioDetailView({ scenarioId }: { scenarioId: string }) {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const scenario = await db.query.scenarios.findFirst({
    where: eq(scenarios.id, scenarioId),
  });
  if (!scenario) notFound();

  // Phase 10G §5/§10: the single centralized publish gate, surfaced here
  // as a clear pass/fail + reasons list — only meaningful for built-in
  // scenarios, since org-owned scenarios go through validateAuthoredScenario
  // in their own (different) editor instead.
  const builtInEntry =
    scenario.ownershipType === "incidentrank"
      ? getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, scenario.slug)
      : null;
  const publishCheck = builtInEntry ? canPublishScenario(builtInEntry) : null;

  return (
    <>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
          {scenario.ownershipType} · {scenario.id}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{scenario.name}</h1>
        <p className="mt-1 font-mono text-xs text-muted">{scenario.slug}</p>
      </div>

      {publishCheck && (
        <div className="mt-6 rounded-md border border-border bg-surface p-4">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
            Publish Validation
          </p>
          {publishCheck.publishable ? (
            <p className="mt-2 text-sm text-muted">✓ Passes every validation check.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-[#dc2626]">
                ✗ {publishCheck.errors.length} validation error
                {publishCheck.errors.length === 1 ? "" : "s"} — not publishable.
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {publishCheck.errors.map((error, i) => (
                  <li key={i} className="font-mono text-xs text-muted">
                    <span className="text-foreground">{error.path}</span>: {error.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="mt-8">
        <ScenarioEditForm
          scenarioId={scenario.id}
          initial={{
            isFree: scenario.isFree,
            isFreeOverriddenByAdmin: scenario.isFreeOverriddenByAdmin,
            status: scenario.status,
            structure: scenario.structure,
            domain: scenario.domain,
            releaseWeek: scenario.releaseWeek,
            publishedAt: scenario.publishedAt ? scenario.publishedAt.toISOString().slice(0, 16) : "",
          }}
        />
      </div>
    </>
  );
}
