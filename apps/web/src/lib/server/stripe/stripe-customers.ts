import "server-only";
import { eq } from "drizzle-orm";
import { stripeCustomers, type StripeCustomer, type User } from "@incidentrank/db";
import { db } from "../db";
import { getStripeClient } from "./client";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/**
 * Loads this user's existing Stripe Customer mapping, or creates both a
 * real Stripe Customer and the DB row together (docs/implementation_plan/
 * phase9.md §9). The database is authoritative for the mapping — never
 * resolve identity by email alone. Idempotent: a second concurrent call
 * for the same user loses the insert race and re-reads the winner's row
 * rather than creating a duplicate Stripe Customer, matching the
 * grantIncidentPass "lost the race, re-query" pattern from Phase 8.
 */
export async function getOrCreateStripeCustomer(
  tx: TxOrDb,
  user: User,
): Promise<StripeCustomer> {
  const existing = await tx.query.stripeCustomers.findFirst({
    where: eq(stripeCustomers.userId, user.id),
  });
  if (existing) return existing;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    metadata: {
      application: "incidentrank",
      incidentrank_user_id: user.id,
    },
  });

  const [created] = await tx
    .insert(stripeCustomers)
    .values({ userId: user.id, stripeCustomerId: customer.id })
    .onConflictDoNothing({ target: stripeCustomers.userId })
    .returning();

  if (created) return created;

  // Lost a race with a concurrent request creating the same mapping —
  // the Stripe Customer we just created above is simply orphaned (Stripe
  // test-mode customer creation has no meaningful cost/side-effect to
  // clean up here); re-read the winner's row as the authoritative one.
  const row = await tx.query.stripeCustomers.findFirst({
    where: eq(stripeCustomers.userId, user.id),
  });
  if (!row) {
    throw new Error("Failed to create or find Stripe customer mapping after conflict");
  }
  return row;
}
