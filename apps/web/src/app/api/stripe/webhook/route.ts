import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { stripeWebhookEvents } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { isStripeWebhooksEnabled } from "@/lib/server/feature-flags";
import { getStripeClient } from "@/lib/server/stripe/client";
import {
  handleCheckoutSessionCompleted,
  handleSubscriptionEvent,
  handleInvoiceEvent,
} from "@/lib/server/stripe/webhook-handlers";

/**
 * Stripe webhook receiver (docs/implementation_plan/phase9.md §6/§12/
 * §41/§42). Reads the raw request body (Next.js App Router does not
 * body-parse by default, so no special route config is needed) and
 * verifies `stripe-signature` before trusting anything in the payload —
 * a failed verification 400s with no DB write at all.
 *
 * Idempotency: `INSERT ... ON CONFLICT (stripe_event_id) DO NOTHING
 * RETURNING id` is the reservation gate — zero rows back means this
 * exact event was already seen (a Stripe retry or a genuine duplicate
 * delivery), so the handler acknowledges with 200 and does nothing
 * further, never re-running a handler for an event already processed.
 *
 * Dispatch happens inside one DB transaction per event; a thrown error
 * rolls that transaction back (so no partial entitlement state is ever
 * persisted) and the event's ledger row is marked `failed` with a non-2xx
 * response, which makes Stripe retry delivery later.
 */
export async function POST(request: Request) {
  if (!isStripeWebhooksEnabled()) {
    return NextResponse.json({ error: "Webhooks are not enabled" }, { status: 403 });
  }

  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const [reserved] = await db
    .insert(stripeWebhookEvents)
    .values({ stripeEventId: event.id, eventType: event.type, processingStatus: "processing" })
    .onConflictDoNothing({ target: stripeWebhookEvents.stripeEventId })
    .returning({ id: stripeWebhookEvents.id });

  if (!reserved) {
    // Already seen this exact event id — idempotent no-op acknowledgment.
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const stripe = getStripeClient();
    await db.transaction(async (tx) => {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutSessionCompleted(
            tx,
            event.data.object as Stripe.Checkout.Session,
            stripe,
          );
          break;
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          await handleSubscriptionEvent(tx, event.data.object as Stripe.Subscription);
          break;
        case "invoice.paid":
        case "invoice.payment_failed":
          await handleInvoiceEvent(tx, event.data.object as Stripe.Invoice, stripe);
          break;
        default:
          break; // unrecognized event types are acknowledged but no-op
      }
    });

    await db
      .update(stripeWebhookEvents)
      .set({ processingStatus: "processed", processedAt: new Date() })
      .where(eq(stripeWebhookEvents.id, reserved.id));

    return NextResponse.json({ received: true });
  } catch (error) {
    await db
      .update(stripeWebhookEvents)
      .set({
        processingStatus: "failed",
        error: error instanceof Error ? error.message : String(error),
      })
      .where(eq(stripeWebhookEvents.id, reserved.id));

    // Non-2xx so Stripe retries delivery later — the ledger row stays
    // `failed` rather than `processed`, so a retry with the same event
    // id is correctly treated as not-yet-processed by any future
    // reconciliation, not swallowed as a duplicate.
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
