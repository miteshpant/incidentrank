import { notFound } from "next/navigation";
import { isNull } from "drizzle-orm";
import { adminUsers } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership, isOwnerRole } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { InviteAdminForm } from "./invite-admin-form";
import { AdminUserRow } from "./admin-user-row";

export async function AdminUsersView() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const activeAdmins = await db.query.adminUsers.findMany({
    where: isNull(adminUsers.revokedAt),
    with: { user: true },
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Admin Users</h1>

      {isOwnerRole(membership.membership.role) && (
        <div className="mt-6">
          <InviteAdminForm />
        </div>
      )}

      <ul className="mt-10 flex flex-col gap-2">
        {activeAdmins.map((admin) => (
          <AdminUserRow
            key={admin.id}
            adminUserId={admin.id}
            displayName={admin.user.displayName}
            role={admin.role}
            isSelf={admin.userId === user.id}
          />
        ))}
      </ul>
    </>
  );
}
