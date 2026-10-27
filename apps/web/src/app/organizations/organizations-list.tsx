import Link from "next/link";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { listOrganizationsForUser } from "@/lib/server/organizations-for-user";

export async function OrganizationsList() {
  const user = await getOrCreateCurrentUser();
  if (!user) return null; // middleware protects this route; unreachable in practice.

  const memberships = await listOrganizationsForUser(user.id);

  if (memberships.length === 0) {
    return (
      <p className="mt-10 text-sm text-muted">
        You don&apos;t belong to any organizations yet. Organizations are provisioned by
        IncidentRank — contact support@incidentrank.com to set one up.
      </p>
    );
  }

  return (
    <ul className="mt-10 flex flex-col gap-3">
      {memberships.map(({ organization, role }) => (
        <li key={organization.id}>
          <Link
            href={`/organizations/${organization.slug}`}
            className="flex items-center justify-between rounded-md border border-border bg-surface p-4 transition-colors hover:border-foreground/40"
          >
            <span className="text-sm font-medium">{organization.name}</span>
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
              {role}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
