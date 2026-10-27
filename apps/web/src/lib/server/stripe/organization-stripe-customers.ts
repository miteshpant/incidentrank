import "server-only";
import { eq } from "drizzle-orm";
import {
  organizationStripeCustomers,
  type Organization,
  type OrganizationStripeCustomer,
} from "@incidentrank/db";
import { db } from "../db";
import { getStripeClient } from "./client";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/**
 * Loads this organization's existing Stripe Customer mapping, or creates
 * both a real Stripe Customer and the DB row together (docs/
 * implementation_plan/phase10b.md §8). Structurally separate from
 * stripe-customers.ts's per-user getOrCreateStripeCustomer — an
 * organization's purchases must never flow through a member's personal
 * Stripe Customer, and a user who is owner/admin of multiple
 * organizations must never share one global credit balance (phase10b.md
 * §50/§51). Idempotent: a second concurrent call for the same
 * organization loses the insert race and re-reads the winner's row
 * rather than creating a duplicate Stripe Customer.
 */
export async function getOrCreateOrganizationStripeCustomer(
  tx: TxOrDb,
  organization: Organization,
  billingEmail: string | null,
): Promise<OrganizationStripeCustomer> {
  const existing = await tx.query.organizationStripeCustomers.findFirst({
    where: eq(organizationStripeCustomers.organizationId, organization.id),
  });
  if (existing) return existing;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: billingEmail ?? undefined,
    name: organization.name,
    metadata: {
      application: "incidentrank",
      organization_id: organization.id,
      organization_slug: organization.slug,
    },
  });

  const [created] = await tx
    .insert(organizationStripeCustomers)
    .values({
      organizationId: organization.id,
      stripeCustomerId: customer.id,
      billingEmail,
    })
    .onConflictDoNothing({ target: organizationStripeCustomers.organizationId })
    .returning();

  if (created) return created;

  // Lost a race with a concurrent request creating the same mapping —
  // the Stripe Customer we just created above is simply orphaned (no
  // meaningful cleanup needed in TEST MODE); re-read the winner's row
  // as authoritative, mirroring stripe-customers.ts's identical pattern.
  const row = await tx.query.organizationStripeCustomers.findFirst({
    where: eq(organizationStripeCustomers.organizationId, organization.id),
  });
  if (!row) {
    throw new Error(
      "Failed to create or find organization Stripe customer mapping after conflict",
    );
  }
  return row;
}
