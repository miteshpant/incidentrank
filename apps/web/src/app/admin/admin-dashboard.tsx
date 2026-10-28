import Link from "next/link";
import { eq, isNull } from "drizzle-orm";
import {
  promotionalInvites,
  incidentPasses,
  referrals,
  adminUsers,
  paidEntitlements,
} from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { getVerifiedPrimaryEmail } from "@/lib/server/verified-email";
import { bootstrapOwnerIfEligible } from "@/lib/server/admin-bootstrap";
import { isAdminPortalEnabled, isPaymentsEnabled } from "@/lib/server/feature-flags";
import { getFoundingCapacity } from "@/lib/server/stripe/founding-allocation";
import { notFound } from "next/navigation";

async function countRows<T>(rows: Promise<T[]>): Promise<number> {
  return (await rows).length;
}

/**
 * /admin landing — attempts bootstrap (a no-op unless this exact
 * signed-in user is eligible per INITIAL_ADMIN_EMAIL and no owner has
 * ever been bootstrapped), then gates on active admin membership. Every
 * admin page in this portal repeats this same inline
 * loadAdminMembership() check — no layout-based gate, matching the
 * existing "no nested layout gating" convention (organizations/[slug]/
 * page.tsx does the equivalent per-page).
 */
export async function AdminDashboard() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null; // middleware protects signed-out visitors in practice.

  const verifiedEmail = await getVerifiedPrimaryEmail();
  await bootstrapOwnerIfEligible(user, verifiedEmail);

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const [invitesCreated, invitesSent, invitesRedeemed, passesGranted, passesConsumed, referralsClaimed, rewardsIssued] =
    await Promise.all([
      countRows(db.query.promotionalInvites.findMany({ columns: { id: true } })),
      countRows(
        db.query.promotionalInvites.findMany({
          where: eq(promotionalInvites.status, "sent"),
          columns: { id: true },
        }),
      ),
      countRows(
        db.query.promotionalInvites.findMany({
          where: eq(promotionalInvites.status, "redeemed"),
          columns: { id: true },
        }),
      ),
      countRows(db.query.incidentPasses.findMany({ columns: { id: true } })),
      countRows(
        db.query.incidentPasses.findMany({
          where: eq(incidentPasses.status, "consumed"),
          columns: { id: true },
        }),
      ),
      countRows(
        db.query.referrals.findMany({
          where: eq(referrals.status, "claimed"),
          columns: { id: true },
        }),
      ),
      countRows(
        db.query.referrals.findMany({
          where: eq(referrals.status, "rewarded"),
          columns: { id: true },
        }),
      ),
    ]);

  const activeAdmins = await db.query.adminUsers.findMany({
    where: isNull(adminUsers.revokedAt),
    with: { user: true },
  });

  const [activePro, activeFounding, foundingCapacity] = isPaymentsEnabled()
    ? await Promise.all([
        countRows(
          db.query.paidEntitlements.findMany({
            where: eq(paidEntitlements.entitlementType, "pro"),
            columns: { id: true },
          }),
        ),
        countRows(
          db.query.paidEntitlements.findMany({
            where: eq(paidEntitlements.entitlementType, "founding_lifetime"),
            columns: { id: true },
          }),
        ),
        getFoundingCapacity(),
      ])
    : [0, 0, null];

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-1 font-mono text-xs text-muted">
            signed in as {verifiedEmail} · your role: {membership.membership.role}
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Invites Sent" value={invitesSent} />
        <StatCard label="Invites Redeemed" value={invitesRedeemed} />
        <StatCard label="Passes Consumed" value={`${passesConsumed} / ${passesGranted}`} />
        <StatCard label="Rewards Issued" value={rewardsIssued} />
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted">
        {invitesCreated} invites created total · {referralsClaimed} referrals claimed
      </p>

      {isPaymentsEnabled() && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Pro Entitlements" value={activePro} />
          <StatCard label="Founding Entitlements" value={activeFounding} />
          <StatCard label="Founding Remaining" value={foundingCapacity?.remaining ?? 0} />
        </div>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/admin/promotional-invites"
          className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
        >
          Promotional Invites
        </Link>
        <Link
          href="/admin/incident-passes"
          className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
        >
          Incident Passes
        </Link>
        <Link
          href="/admin/referrals"
          className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
        >
          Referrals
        </Link>
        <Link
          href="/admin/admin-users"
          className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
        >
          Admin Users
        </Link>
        <Link
          href="/admin/organizations"
          className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
        >
          Organizations
        </Link>
        <Link
          href="/admin/dashboard"
          className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
        >
          Customer &amp; Revenue Dashboard
        </Link>
        {isPaymentsEnabled() && (
          <>
            <Link
              href="/admin/paid-entitlements"
              className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
            >
              Paid Entitlements
            </Link>
            <Link
              href="/admin/stripe-subscriptions"
              className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
            >
              Stripe Subscriptions
            </Link>
            <Link
              href="/admin/founding-allocations"
              className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
            >
              Founding Allocations
            </Link>
            <Link
              href="/admin/webhook-events"
              className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
            >
              Webhook Events
            </Link>
          </>
        )}
      </div>

      <div className="mt-10">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
          Active Admins
        </h2>
        <ul className="mt-4 flex flex-col gap-2">
          {activeAdmins.map((admin) => (
            <li
              key={admin.id}
              className="flex items-center justify-between rounded-md border border-border px-4 py-2 text-sm"
            >
              <span>{admin.user.displayName}</span>
              <span className="font-mono text-xs text-muted">{admin.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
