import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { scenarios } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOrganizationMembership, canMutate } from "@/lib/server/organization-auth";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

interface ScenarioListProps {
  slug: string;
}

export async function ScenarioList({ slug }: ScenarioListProps) {
  const user = await getOrCreateCurrentUser();
  if (!user) return null; // middleware protects this route; unreachable in practice.

  const result = await loadOrganizationMembership(slug, user);
  if (!result.ok) notFound();

  const rows = await db.query.scenarios.findMany({
    where: and(
      eq(scenarios.organizationId, result.organization.id),
      eq(scenarios.ownershipType, "organization"),
    ),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  const drafts = rows.filter((r) => r.status === "draft");
  const published = rows.filter((r) => r.status === "published");
  const archived = rows.filter((r) => r.status === "archived");

  const canCreate = canMutate(result.membership.role);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scenarios</h1>
          <p className="mt-1 font-mono text-xs text-muted">
            {result.organization.name}
          </p>
        </div>
        {canCreate && (
          <Link
            href={`/organizations/${slug}/scenarios/new`}
            className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Create Scenario
          </Link>
        )}
      </div>

      <ScenarioGroup title="Drafts" scenarios={drafts} slug={slug} />
      <ScenarioGroup title="Published" scenarios={published} slug={slug} />
      <ScenarioGroup title="Archived" scenarios={archived} slug={slug} />
    </>
  );
}

interface ScenarioRow {
  id: string;
  name: string;
  status: string;
}

function ScenarioGroup({
  title,
  scenarios: rows,
  slug,
}: {
  title: string;
  scenarios: ScenarioRow[];
  slug: string;
}) {
  return (
    <div className="mt-10">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">None.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((scenario) => (
            <li key={scenario.id}>
              <Link
                href={`/organizations/${slug}/scenarios/${scenario.id}/edit`}
                className="flex items-center justify-between rounded-md border border-border bg-surface p-4 transition-colors hover:border-foreground/40"
              >
                <span className="text-sm font-medium">{scenario.name}</span>
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                  {STATUS_LABEL[scenario.status] ?? scenario.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
