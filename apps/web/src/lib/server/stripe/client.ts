import "server-only";
import Stripe from "stripe";

/**
 * The single Stripe client for the whole application — never instantiate
 * `new Stripe(...)` anywhere else (docs/implementation_plan/phase9.md
 * §7). Memoized on globalThis for the same reason apps/web/src/lib/
 * server/db.ts caches its Drizzle client: Next.js dev-mode hot reload
 * would otherwise construct a fresh client on every module reload.
 * STRIPE_SECRET_KEY must be a TEST MODE secret key (sk_test_...) for the
 * whole of Phase 9 — this phase never creates or touches live-mode
 * Stripe objects.
 */
const globalForStripe = globalThis as unknown as {
  __incidentrankStripe?: Stripe;
};

export function getStripeClient(): Stripe {
  if (globalForStripe.__incidentrankStripe) {
    return globalForStripe.__incidentrankStripe;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }

  const client = new Stripe(secretKey);

  if (process.env.NODE_ENV !== "production") {
    globalForStripe.__incidentrankStripe = client;
  }

  return client;
}
