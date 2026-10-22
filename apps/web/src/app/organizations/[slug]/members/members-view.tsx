import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOrganizationMembership, canInviteMembers } from "@/lib/server/organization-auth";
import { listOrgMembers, listPendingInvitations } from "@/lib/server/org-membership";
import { InviteMemberForm } from "./invite-member-form";
import { MemberRow } from "./member-row";
import { InvitationRow } from "./invitation-row";

interface MembersViewProps {
  slug: string;
}

export async function MembersView({ slug }: MembersViewProps) {
  const user = await getOrCreateCurrentUser();
  if (!user) return null; // middleware protects this route; unreachable in practice.

  const result = await loadOrganizationMembership(slug, user);
  if (!result.ok) notFound();

  const [members, invitations] = await Promise.all([
    listOrgMembers(result.organization.id),
    listPendingInvitations(result.organization.id),
  ]);

  const canInvite = canInviteMembers(result.membership.role);
  const currentUserRole = result.membership.role;
  const ownerCount = members.filter((m) => m.role === "owner").length;

  return (
    <>
      <Link
        href={`/organizations/${slug}`}
        className="font-mono text-xs text-muted hover:text-foreground"
      >
        ← Back to organization
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Members</h1>
      <p className="mt-1 font-mono text-xs text-muted">
        {members.length} member{members.length === 1 ? "" : "s"} ·{" "}
        {result.organization.name}
      </p>

      {canInvite && (
        <div className="mt-6">
          <InviteMemberForm slug={slug} />
        </div>
      )}

      <div className="mt-10">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Members</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Joined</th>
                {(currentUserRole === "owner" || currentUserRole === "admin") && (
                  <th className="py-2 pr-4">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  slug={slug}
                  member={{
                    id: member.id,
                    role: member.role,
                    createdAt: member.createdAt.toISOString(),
                    displayName: member.user.displayName,
                  }}
                  currentUserRole={currentUserRole}
                  currentUserMemberId={result.membership.id}
                  ownerCount={ownerCount}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
          Pending Invitations
        </h2>
        {invitations.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No pending invitations.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Invited Role</th>
                  <th className="py-2 pr-4">Expires</th>
                  {canInvite && <th className="py-2 pr-4">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => (
                  <InvitationRow
                    key={invitation.id}
                    slug={slug}
                    invitation={{
                      id: invitation.id,
                      email: invitation.email,
                      role: invitation.role,
                      expiresAt: invitation.expiresAt.toISOString(),
                    }}
                    canManage={canInvite}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
