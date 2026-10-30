import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { Organization, User } from "@incidentrank/db";
import { db } from "../db";
import { appBaseUrl } from "../app-url";
import { getStripeClient } from "./client";
import { getOrgCreditPlanPriceId, type OrgCreditPlan } from "./org-credit-config";
import { getOrCreateOrganizationStripeCustomer } from "./organization-stripe-customers";
import { getOrgFirstPurchaseLaunchCouponId } from "./discount-config";
import {
  releaseOrgLaunchDiscountClaim,
  reserveOrgLaunchDiscountClaim,
  setOrgLaunchDiscountClaimCheckoutSession,
} from "../org-discount-claims";

/**
 * Resolves the purchasing user's email via Clerk for use as the
 * organization's initial billing_email default (phase10b.md §9) — the
 * `users` table has no email column of its own (Clerk owns email
 * identity), mirroring organization-provisioning.ts's identical lookup.
 * Only used the first time an organization's Stripe customer is
 * created; never overwrites an existing billing_email.
 */
async function resolveUserEmail(user: User): Promise<string | null> {
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(user.authProviderId);
  return (
    clerkUser.emailAddresses.find((addr) => addr.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? null
  );
}

export type CreateOrganizationCreditCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: "checkout_session_failed" };

/**
 * Server-authoritative Checkout Session creation for organization
 * assessment credits (docs/implementation_plan/phase10b.md §15-§17).
 * Eligibility (flag state, suspension/pending, role) is verified by the
 * caller (the checkout route) before this is ever invoked — this
 * function only resolves the organization's Stripe customer and creates
 * the Checkout Session itself. `mode: "payment"` — these are one-time
 * purchases, never a subscription.
 */
export async function createOrganizationCreditCheckoutSession(
  organization: Organization,
  plan: OrgCreditPlan,
  purchasingUser: User,
): Promise<CreateOrganizationCreditCheckoutResult> {
  const priceId = getOrgCreditPlanPriceId(plan);
  const stripe = getStripeClient();
  const base = appBaseUrl();

  const billingEmail = await resolveUserEmail(purchasingUser);
  const customer = await db.transaction((tx) =>
    getOrCreateOrganizationStripeCustomer(tx, organization, billingEmail),
  );

  // docs/implementation_plan/phase10e.md §6-§9: server-selected only, one
  // lifetime discount per organization. A losing/ineligible reservation
  // simply proceeds without a coupon — it is never an error that blocks
  // the purchase itself.
  const maybeCouponId = getOrgFirstPurchaseLaunchCouponId();
  const claimReservation = maybeCouponId
    ? await db.transaction((tx) => reserveOrgLaunchDiscountClaim(tx, organization.id))
    : null;
  const couponId = claimReservation?.ok ? maybeCouponId : null;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customer.stripeCustomerId,
      client_reference_id: organization.id,
      line_items: [{ price: priceId, quantity: 1 }],
      discounts: couponId ? [{ coupon: couponId }] : undefined,
      metadata: {
        application: "incidentrank",
        purchase_type: "organization_assessment_credits",
        organization_id: organization.id,
        organization_slug: organization.slug,
        plan,
        purchasing_user_id: purchasingUser.id,
      },
      success_url: `${base}/organizations/${organization.slug}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/organizations/${organization.slug}/billing`,
      // Same requirement as the personal checkout.ts — this TEST MODE
      // account has Managed Payments enabled by default, which requires
      // every Product to carry a tax code the organization-credit
      // catalog doesn't have either. Session-creation parameter only,
      // never a catalog mutation.
      managed_payments: { enabled: false },
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout Session URL");
    }

    if (claimReservation?.ok) {
      await db.transaction((tx) =>
        setOrgLaunchDiscountClaimCheckoutSession(tx, claimReservation.claim.id, session.id),
      );
    }

    return { ok: true, url: session.url };
  } catch {
    // Checkout Session creation failure grants no credits and leaves no
    // dangling business state beyond the Stripe customer mapping, which
    // is safe to keep and reuse on a subsequent attempt (phase10b.md
    // §58). No purchase reservation exists, unlike Founding — but a
    // discount-claim reservation DOES exist by this point if one was
    // taken above, and must be released so a transient Stripe/network
    // failure never permanently burns the organization's one discount.
    if (claimReservation?.ok) {
      await db.transaction((tx) =>
        releaseOrgLaunchDiscountClaim(tx, claimReservation.claim.id),
      );
    }
    return { ok: false, reason: "checkout_session_failed" };
  }
}
