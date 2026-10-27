import "server-only";
import type { User } from "@incidentrank/db";
import { db } from "../db";
import { appBaseUrl } from "../app-url";
import { getStripeClient } from "./client";
import { getPlanPriceId, entitlementTypeForPlan, type StripePlan } from "./config";
import { getOrCreateStripeCustomer } from "./stripe-customers";
import { hasActivePaidEntitlement } from "./entitlements";
import {
  reserveFoundingSlot,
  releaseFoundingSlot,
  setFoundingSlotCheckoutSession,
} from "./founding-allocation";

export type CreateCheckoutSessionResult =
  | { ok: true; url: string }
  | {
      ok: false;
      reason:
        | "already_founding"
        | "already_pro"
        | "founding_sold_out"
        | "founding_already_reserved";
    };

/**
 * Server-authoritative Checkout Session creation (docs/implementation_
 * plan/phase9.md §13-§16, §39). The caller has already verified
 * isStripeCheckoutEnabled() and authentication — this function only
 * handles plan validation, customer mapping, and the Stripe API call
 * itself.
 *
 * Eligibility (phase9.md §26, §39, and the Founding-blocks-Pro
 * clarification): a Founding holder is blocked from ANY further
 * checkout (they already have permanent full access); an active Pro
 * subscriber is blocked from a second Pro checkout but may still
 * purchase Founding; Founding checkout additionally requires reserving
 * one of the 100 capacity slots before a Checkout Session is created,
 * and releases that reservation if session creation throws.
 */
export async function createCheckoutSession(
  user: User,
  plan: StripePlan,
): Promise<CreateCheckoutSessionResult> {
  const [isFounding, isPro] = await Promise.all([
    hasActivePaidEntitlement(user.id, "founding_lifetime"),
    hasActivePaidEntitlement(user.id, "pro"),
  ]);

  // Founding already grants everything permanently — no further
  // checkout of any plan makes sense.
  if (isFounding) {
    return { ok: false, reason: "already_founding" };
  }

  if (plan !== "founding_lifetime" && isPro) {
    return { ok: false, reason: "already_pro" };
  }

  const priceId = getPlanPriceId(plan);
  const stripe = getStripeClient();
  const base = appBaseUrl();

  if (plan === "founding_lifetime") {
    return db.transaction(async (tx) => {
      const reservation = await reserveFoundingSlot(tx, user.id);
      if (!reservation.ok) {
        return {
          ok: false,
          reason:
            reservation.reason === "sold_out"
              ? "founding_sold_out"
              : "founding_already_reserved",
        } as const;
      }

      const customer = await getOrCreateStripeCustomer(tx, user);

      try {
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          customer: customer.stripeCustomerId,
          client_reference_id: user.id,
          line_items: [{ price: priceId, quantity: 1 }],
          metadata: { incidentrank_user_id: user.id, plan },
          success_url: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${base}/billing/canceled`,
          // This Stripe TEST MODE account has Managed Payments enabled by
          // default, which requires every Product to carry a tax code —
          // the existing TEST MODE catalog (which this phase must never
          // modify) does not have one set. managed_payments is a session-
          // creation parameter, not a catalog mutation, so disabling it
          // here keeps the "never create/modify Stripe objects" rule intact.
          managed_payments: { enabled: false },
        });

        await setFoundingSlotCheckoutSession(tx, reservation.allocation.id, session.id);

        if (!session.url) {
          throw new Error("Stripe did not return a Checkout Session URL");
        }
        return { ok: true, url: session.url } as const;
      } catch (error) {
        // Checkout Session creation failed — release the slot rather
        // than permanently consuming Founding capacity because of a
        // transient Stripe/network failure (phase9.md §24).
        await releaseFoundingSlot(tx, reservation.allocation.id);
        throw error;
      }
    });
  }

  const customer = await getOrCreateStripeCustomer(db, user);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.stripeCustomerId,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      incidentrank_user_id: user.id,
      plan,
      entitlement_type: entitlementTypeForPlan(plan),
    },
    success_url: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/billing/canceled`,
    // See the Founding branch above for why this is required against
    // this TEST MODE account's current catalog.
    managed_payments: { enabled: false },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout Session URL");
  }
  return { ok: true, url: session.url };
}

export interface CreateCustomerPortalSessionResult {
  url: string;
}

export async function createCustomerPortalSession(
  user: User,
): Promise<CreateCustomerPortalSessionResult | null> {
  const customer = await db.query.stripeCustomers.findFirst({
    where: (table, { eq: eqFn }) => eqFn(table.userId, user.id),
  });
  if (!customer) return null;

  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.stripeCustomerId,
    return_url: `${appBaseUrl()}/profile`,
  });
  return { url: session.url };
}
