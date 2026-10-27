import "server-only";
import type Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";
import {
  paidEntitlements,
  stripeSubscriptions,
  users,
  type User,
} from "@incidentrank/db";
import { db } from "../db";
import { planForPriceId } from "./config";
import { issueFoundingSlot } from "./founding-allocation";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

async function findUserByStripeCustomerId(
  tx: TxOrDb,
  stripeCustomerId: string,
): Promise<User | null> {
  const customer = await tx.query.stripeCustomers.findFirst({
    where: (table, { eq: eqFn }) => eqFn(table.stripeCustomerId, stripeCustomerId),
  });
  if (!customer) return null;
  const user = await tx.query.users.findFirst({
    where: eq(users.id, customer.userId),
  });
  return user ?? null;
}

/**
 * checkout.session.completed (phase9.md §28). Subscription checkouts
 * don't independently create Pro access here — the subsequent
 * customer.subscription.created/updated event is the actual source of
 * truth for subscription state, per §18 ("do not treat
 * checkout.session.completed as permanent proof of an active
 * subscription"). This handler's only job for subscription mode is
 * correlating the session to the user (already done via Customer at
 * session-creation time, so there is nothing further to synchronize).
 *
 * For Founding (mode: "payment"), this IS the authoritative completion
 * signal — a one-time payment has no further subscription lifecycle —
 * so this handler validates the price, converts the reservation to
 * issued, and creates the lifetime entitlement, all transactionally.
 */
export async function handleCheckoutSessionCompleted(
  tx: TxOrDb,
  session: Stripe.Checkout.Session,
  stripe: Stripe,
): Promise<void> {
  if (session.mode !== "payment") return; // subscription mode: no-op, see above
  if (session.payment_status !== "paid") return; // never issue for an unpaid session

  // The webhook payload never includes line_items unless the event
  // subscription explicitly expands it — always list them via the API
  // instead of trusting session.line_items to be populated, since this
  // handler must never guess the price it's issuing Founding access for.
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 1,
  });
  const priceId = lineItems.data[0]?.price?.id;
  if (!priceId) return;

  const plan = planForPriceId(priceId);
  if (plan !== "founding_lifetime") return; // unrecognized/unexpected price — grant nothing

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!customerId) return;

  const user = await findUserByStripeCustomerId(tx, customerId);
  if (!user) return;

  const reservation = await tx.query.foundingEngineerAllocations.findFirst({
    where: (table, { eq: eqFn }) => eqFn(table.stripeCheckoutSessionId, session.id),
  });
  if (!reservation) return; // no matching reservation — nothing to issue against

  const issued = await issueFoundingSlot(
    tx,
    reservation.id,
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null),
  );
  if (!issued) return; // already issued (replay) — idempotent no-op

  // One user may hold at most one founding_lifetime entitlement ever —
  // paid_entitlements_one_founding_per_user_idx is the DB-level backstop
  // if this handler were somehow invoked twice for the same user via two
  // different sessions; onConflictDoNothing makes a theoretical second
  // insert a safe no-op rather than an error.
  await tx
    .insert(paidEntitlements)
    .values({
      userId: user.id,
      entitlementType: "founding_lifetime",
      status: "active",
      source: "stripe_founding_payment",
      stripeCustomerId: customerId,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: issued.stripePaymentIntentId,
      stripePriceId: priceId,
      startsAt: new Date(),
      currentPeriodEnd: null,
    })
    // Must exactly match paid_entitlements_one_founding_per_user_idx's
    // own partial predicate (packages/db/src/schema.ts) — a
    // non-identical `where` clause here makes Postgres reject the ON
    // CONFLICT target outright, a gotcha already hit twice during
    // Phase 8 (admin-bootstrap.ts, incident-passes.ts).
    .onConflictDoNothing({
      target: paidEntitlements.userId,
      where: sql`${paidEntitlements.entitlementType} = 'founding_lifetime'`,
    });
}

/**
 * customer.subscription.created/updated/deleted (phase9.md §18, §29,
 * §37). Synchronizes the raw Stripe state into stripeSubscriptions, then
 * derives the IncidentRank-policy paidEntitlements row from it — this is
 * the one place Pro access state is ever written. An unrecognized Price
 * ID synchronizes the raw subscription row (for operational visibility)
 * but never creates/activates a Pro entitlement (phase9.md §29's "Unknown
 * Price IDs must not silently grant Pro").
 */
export async function handleSubscriptionEvent(
  tx: TxOrDb,
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const user = await findUserByStripeCustomerId(tx, customerId);
  if (!user) return;

  const item = subscription.items.data[0];
  const priceId = item?.price?.id;
  const productId =
    typeof item?.price?.product === "string"
      ? item.price.product
      : item?.price?.product?.id;
  if (!priceId || !productId) return;

  const periodStart = item?.current_period_start
    ? new Date(item.current_period_start * 1000)
    : null;
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : null;

  await tx
    .insert(stripeSubscriptions)
    .values({
      userId: user.id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      stripeProductId: productId,
      stripeStatus: subscription.status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
      endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : null,
    })
    .onConflictDoUpdate({
      target: stripeSubscriptions.stripeSubscriptionId,
      set: {
        stripeStatus: subscription.status,
        stripePriceId: priceId,
        stripeProductId: productId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : null,
        endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : null,
        updatedAt: new Date(),
      },
    });

  const plan = planForPriceId(priceId);
  if (!plan || plan === "founding_lifetime") {
    // Not one of our configured Pro prices — never derive Pro access
    // from an unrecognized subscription, even though the raw mirror
    // row above is still kept for operational visibility.
    return;
  }

  await syncProEntitlementFromSubscription(tx, user.id, customerId, subscription, priceId);
}

/**
 * The Pro access policy (phase9.md §19): an `active` Stripe subscription
 * grants access. A subscription with `cancel_at_period_end=true` but
 * still `active` also grants access — Stripe keeps status='active'
 * itself until the period genuinely ends, so no special-casing is
 * needed beyond trusting Stripe's own status here. `past_due` retains
 * access (Stripe still considers the subscription active while dunning
 * is in progress) only while Stripe's status is itself still 'active' or
 * 'past_due' — not once Stripe moves it to 'canceled'/'unpaid'/
 * 'incomplete_expired'. Anything else ends Pro access for NEW premium
 * attempts; existing in-progress attempts remain resumable regardless
 * (enforced upstream in the access-policy integration, never here).
 */
async function syncProEntitlementFromSubscription(
  tx: TxOrDb,
  userId: string,
  stripeCustomerId: string,
  subscription: Stripe.Subscription,
  priceId: string,
): Promise<void> {
  const grantsAccess =
    subscription.status === "active" || subscription.status === "past_due";

  const existing = await tx.query.paidEntitlements.findFirst({
    where: and(
      eq(paidEntitlements.userId, userId),
      eq(paidEntitlements.entitlementType, "pro"),
      eq(paidEntitlements.stripeSubscriptionId, subscription.id),
    ),
  });

  const periodEnd = subscription.items.data[0]?.current_period_end
    ? new Date(subscription.items.data[0].current_period_end * 1000)
    : null;

  const values = {
    userId,
    entitlementType: "pro" as const,
    status: grantsAccess ? ("active" as const) : ("inactive" as const),
    source: "stripe_subscription",
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    startsAt: existing?.startsAt ?? new Date(subscription.start_date * 1000),
    currentPeriodEnd: periodEnd,
    endedAt: grantsAccess ? null : new Date(),
  };

  if (existing) {
    await tx
      .update(paidEntitlements)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(paidEntitlements.id, existing.id));
  } else {
    await tx.insert(paidEntitlements).values(values);
  }
}

/**
 * invoice.paid / invoice.payment_failed (phase9.md §30). Invoice events
 * keep subscription state coherent but never independently grant/revoke
 * access — the subscription object itself (re-fetched here) is the
 * actual source of truth, reusing the exact same sync path as the
 * customer.subscription.* handlers so there is only one place Pro
 * access is ever derived.
 */
export async function handleInvoiceEvent(
  tx: TxOrDb,
  invoice: Stripe.Invoice,
  stripe: Stripe,
): Promise<void> {
  const subscriptionId =
    typeof invoice.parent?.subscription_details?.subscription === "string"
      ? invoice.parent.subscription_details.subscription
      : invoice.parent?.subscription_details?.subscription?.id;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await handleSubscriptionEvent(tx, subscription);
}
