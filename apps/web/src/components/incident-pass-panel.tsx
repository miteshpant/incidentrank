import Link from "next/link";
import { and, eq, or } from "drizzle-orm";
import { incidentPasses, paidEntitlements, stripeCustomers, referrals } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { isEligibleToReferOthers, findExistingReferralCode } from "@/lib/server/referrals";
import { isPaymentsEnabled, isReferralsEnabled } from "@/lib/server/feature-flags";
import { ReferralLinkSection } from "./referral-link-section";
import { ManageBillingButton } from "./manage-billing-button";

const PLAN_LABEL: Record<string, string> = {
  founding_lifetime: "Founding Engineer",
  pro: "Pro",
};

const PASS_STATUS_COPY: Record<string, (scenarioName: string | null) => string> = {
  available: () => "1 Incident Pass available. Use this pass to try one premium incident.",
  bound: (scenarioName) => `Incident Pass assigned to: ${scenarioName ?? "a scenario"}`,
  consumed: (scenarioName) => `Used on: ${scenarioName ?? "a scenario"}`,
};

/**
 * User-facing Incident Pass + referral display (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §22/§41, phase8loc.md
 * Step 17/19's exact copy — never "Pro access," never implying catalog-
 * wide access). Referral progress shows only coarse status
 * (Invited/Joined/Completed/Reward earned) — never the referred user's
 * score/tier/reasoning (§27's privacy rule), enforced structurally here
 * by only ever selecting referral status/timestamp columns, never
 * joining into the referred attempt's score columns at all.
 */
export async function IncidentPassPanel({ userId }: { userId: string }) {
  const [
    activePass,
    referralEligible,
    existingReferral,
    referralsAsReferrer,
    activeEntitlement,
    stripeCustomer,
  ] = await Promise.all([
    db.query.incidentPasses.findFirst({
      where: and(
        eq(incidentPasses.userId, userId),
        or(eq(incidentPasses.status, "available"), eq(incidentPasses.status, "bound")),
      ),
      with: { scenario: true },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    }),
    isReferralsEnabled() ? isEligibleToReferOthers(userId) : Promise.resolve(false),
    isReferralsEnabled() ? findExistingReferralCode(userId) : Promise.resolve(null),
    isReferralsEnabled()
      ? db.query.referrals.findMany({
          where: eq(referrals.referrerUserId, userId),
          columns: { id: true, status: true, claimedAt: true, rewardedAt: true },
          orderBy: (table, { desc }) => [desc(table.createdAt)],
        })
      : Promise.resolve([]),
    isPaymentsEnabled()
      ? db.query.paidEntitlements.findFirst({
          where: and(eq(paidEntitlements.userId, userId), eq(paidEntitlements.status, "active")),
          orderBy: (table, { desc }) => [desc(table.createdAt)],
        })
      : Promise.resolve(null),
    isPaymentsEnabled()
      ? db.query.stripeCustomers.findFirst({ where: eq(stripeCustomers.userId, userId) })
      : Promise.resolve(null),
  ]);

  const lastConsumedPass = activePass
    ? null
    : await db.query.incidentPasses.findFirst({
        where: and(eq(incidentPasses.userId, userId), eq(incidentPasses.status, "consumed")),
        with: { scenario: true },
        orderBy: (table, { desc }) => [desc(table.consumedAt)],
      });

  const displayPass = activePass ?? lastConsumedPass;

  return (
    <div className="mt-10 border-t border-border pt-6">
      {isPaymentsEnabled() && (
        <div className="mb-6">
          <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Billing</h2>
          {activeEntitlement ? (
            <>
              <p className="mt-3 text-sm text-foreground">
                {PLAN_LABEL[activeEntitlement.entitlementType] ?? activeEntitlement.entitlementType}
                {activeEntitlement.entitlementType === "founding_lifetime"
                  ? " — lifetime access."
                  : activeEntitlement.currentPeriodEnd
                    ? ` — access through ${activeEntitlement.currentPeriodEnd.toLocaleDateString()}.`
                    : " — active."}
              </p>
              {stripeCustomer && <ManageBillingButton />}
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted">
                Free plan.{" "}
                <Link href="/pricing" className="underline hover:no-underline">
                  See Pro and Founding Engineer pricing
                </Link>
                .
              </p>
              {stripeCustomer && <ManageBillingButton />}
            </>
          )}
        </div>
      )}

      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Incident Passes</h2>

      {displayPass ? (
        <p className="mt-3 text-sm text-foreground">
          {PASS_STATUS_COPY[displayPass.status]?.(displayPass.scenario?.name ?? null) ??
            `Pass status: ${displayPass.status}`}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">No Incident Passes yet.</p>
      )}

      {isReferralsEnabled() && (
        <ReferralLinkSection
          eligible={referralEligible}
          existingCode={existingReferral !== null}
          referrals={referralsAsReferrer.map((r) => ({
            id: r.id,
            status: r.status,
            claimed: r.claimedAt !== null,
            rewarded: r.rewardedAt !== null,
          }))}
        />
      )}
    </div>
  );
}
