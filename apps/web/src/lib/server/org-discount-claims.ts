import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import {
  organizationCreditLedger,
  organizationLaunchDiscountClaims,
  type OrganizationLaunchDiscountClaim,
} from "@incidentrank/db";
import { db } from "./db";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

// An abandoned/unfinished Checkout Session never redeems the claim it
// reserved — after this TTL, a fresh checkout attempt is allowed to claim
// again rather than the organization's one lifetime discount being
// permanently burned by a session nobody completed (docs/
// implementation_plan/phase10e.md §8).
const RESERVATION_TTL_MS = 24 * 60 * 60 * 1000;

export type ReserveOrgLaunchDiscountClaimResult =
  | { ok: true; claim: OrganizationLaunchDiscountClaim }
  | { ok: false; reason: "already_purchased" | "already_claimed" };

/**
 * Reserves the organization's one lifetime launch-discount claim
 * (phase10e.md §6-§8). Authoritative eligibility is "has this
 * organization ever completed a successful credit purchase" — read
 * directly from organization_credit_ledger (transactionType='purchase'),
 * never from Stripe coupon-redemption history (§7). Race safety comes
 * from organization_launch_discount_claims_org_id_idx (a UNIQUE index on
 * organizationId, not partial — at most one claim row ever exists per
 * organization): INSERT ... ON CONFLICT (organization_id) DO NOTHING, so
 * a losing concurrent request simply returns "already_claimed" rather
 * than erroring — the checkout itself still proceeds, just without a
 * discount (see createOrganizationCreditCheckoutSession).
 *
 * A `reserved` claim older than RESERVATION_TTL_MS, with no matching
 * successful purchase since, is reclaimed in place (UPDATE back to a
 * fresh `reserved` row) rather than left permanently stuck — this is
 * what lets an abandoned Checkout Session's claim become eligible again
 * without a cron job.
 */
export async function reserveOrgLaunchDiscountClaim(
  tx: TxOrDb,
  organizationId: string,
): Promise<ReserveOrgLaunchDiscountClaimResult> {
  const purchase = await tx.query.organizationCreditLedger.findFirst({
    where: and(
      eq(organizationCreditLedger.organizationId, organizationId),
      eq(organizationCreditLedger.transactionType, "purchase"),
    ),
  });
  if (purchase) {
    return { ok: false, reason: "already_purchased" };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);

  const [inserted] = await tx
    .insert(organizationLaunchDiscountClaims)
    .values({ organizationId, status: "reserved", expiresAt })
    .onConflictDoNothing({ target: organizationLaunchDiscountClaims.organizationId })
    .returning();

  if (inserted) {
    return { ok: true, claim: inserted };
  }

  // Conflicted against an existing row — reclaim it if it's a stale,
  // never-redeemed `reserved` claim; otherwise this organization has
  // already redeemed or is mid-flight on a non-expired reservation.
  const [reclaimed] = await tx
    .update(organizationLaunchDiscountClaims)
    .set({ status: "reserved", stripeCheckoutSessionId: null, reservedAt: now, expiresAt })
    .where(
      and(
        eq(organizationLaunchDiscountClaims.organizationId, organizationId),
        eq(organizationLaunchDiscountClaims.status, "reserved"),
        lt(organizationLaunchDiscountClaims.expiresAt, now),
      ),
    )
    .returning();

  if (reclaimed) {
    return { ok: true, claim: reclaimed };
  }

  return { ok: false, reason: "already_claimed" };
}

/** Attaches the Checkout Session id to an already-reserved claim. */
export async function setOrgLaunchDiscountClaimCheckoutSession(
  tx: TxOrDb,
  claimId: string,
  stripeCheckoutSessionId: string,
): Promise<void> {
  await tx
    .update(organizationLaunchDiscountClaims)
    .set({ stripeCheckoutSessionId })
    .where(eq(organizationLaunchDiscountClaims.id, claimId));
}

/**
 * Checkout Session creation threw after a reservation succeeded — release
 * the claim (delete the row) so this is never treated as "this
 * organization already tried and should never get the discount again"
 * (mirrors founding-allocation.ts's releaseFoundingSlot-on-error pattern).
 * Only releases a still-`reserved` row — never touches an already-
 * redeemed claim.
 */
export async function releaseOrgLaunchDiscountClaim(
  tx: TxOrDb,
  claimId: string,
): Promise<void> {
  await tx
    .delete(organizationLaunchDiscountClaims)
    .where(
      and(
        eq(organizationLaunchDiscountClaims.id, claimId),
        eq(organizationLaunchDiscountClaims.status, "reserved"),
      ),
    );
}

/**
 * Called from the webhook path once the purchase is confirmed. Idempotent
 * by construction: redeeming an already-redeemed row is a no-op (the
 * WHERE clause only matches `reserved` rows), matching the webhook
 * handler's own replay-safety expectations elsewhere in this codebase.
 */
export async function redeemOrgLaunchDiscountClaim(
  tx: TxOrDb,
  organizationId: string,
  stripeCheckoutSessionId: string,
): Promise<void> {
  await tx
    .update(organizationLaunchDiscountClaims)
    .set({ status: "redeemed", redeemedAt: sql`now()` })
    .where(
      and(
        eq(organizationLaunchDiscountClaims.organizationId, organizationId),
        eq(organizationLaunchDiscountClaims.stripeCheckoutSessionId, stripeCheckoutSessionId),
        eq(organizationLaunchDiscountClaims.status, "reserved"),
      ),
    );
}
