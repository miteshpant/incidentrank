import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  createDb,
  organizationAuditEvents,
  organizationCreditLedger,
  organizationMembers,
  organizations,
  organizationStripeCustomers,
  stripeWebhookEvents,
  users,
  type Db,
} from "@incidentrank/db";
import { getStripeClient } from "@/lib/server/stripe/client";
import { getOrganizationCreditBalance } from "@/lib/server/organization-credits";
import type { POST as PostHandler } from "./route";

/**
 * Organization assessment-credit webhook handling tests (docs/
 * implementation_plan/phase10b.md §67). Mirrors route.test.ts's
 * signedRequest/buildEvent conventions exactly. `checkout.sessions.
 * listLineItems` is a real Stripe network call this handler makes
 * (same as the existing Founding path) — mocked here so the price ID
 * under test is deterministic rather than depending on a live session.
 */

const TEST_ORG_SLUG_PREFIX = "test-org-credits-webhook-";
const SINGLE_PRICE_ID = "price_org_single_webhook_test";
const PACK_PRICE_ID = "price_org_pack_webhook_test";

let testDb: Db;
let POST: typeof PostHandler;
let lineItemsPriceId: string | null = null;

vi.mock("@/lib/server/stripe/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/stripe/client")>(
    "@/lib/server/stripe/client",
  );
  return {
    ...actual,
    getStripeClient: () => {
      const real = actual.getStripeClient();
      return {
        ...real,
        checkout: {
          ...real.checkout,
          sessions: {
            ...real.checkout.sessions,
            listLineItems: async () => ({
              data: lineItemsPriceId ? [{ price: { id: lineItemsPriceId } }] : [],
            }),
          },
        },
        webhooks: real.webhooks,
      };
    },
  };
});

beforeAll(async () => {
  testDb = createDb();
  ({ POST } = await import("./route"));
}, 30_000);

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOKS_ENABLED", "true");
  vi.stubEnv("STRIPE_ORG_SINGLE_CREDIT_PRICE_ID", SINGLE_PRICE_ID);
  vi.stubEnv("STRIPE_ORG_CREDIT_PACK_PRICE_ID", PACK_PRICE_ID);
  lineItemsPriceId = null;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  const orgs = await testDb.query.organizations.findMany({
    where: like(organizations.slug, `${TEST_ORG_SLUG_PREFIX}%`),
  });
  for (const org of orgs) {
    await testDb.delete(organizationAuditEvents).where(eq(organizationAuditEvents.organizationId, org.id));
    await testDb.delete(organizationCreditLedger).where(eq(organizationCreditLedger.organizationId, org.id));
    await testDb
      .delete(organizationStripeCustomers)
      .where(eq(organizationStripeCustomers.organizationId, org.id));
    await testDb.delete(organizationMembers).where(eq(organizationMembers.organizationId, org.id));
    await testDb.delete(organizations).where(eq(organizations.id, org.id));
  }
  await testDb.delete(users).where(like(users.authProviderId, "test-org-credits-webhook-%"));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

let orgCounter = 0;
async function createOrgWithStripeCustomer(status: "pending" | "active" | "suspended" = "active") {
  orgCounter += 1;
  const slug = `${TEST_ORG_SLUG_PREFIX}${orgCounter}`;
  const [org] = await testDb
    .insert(organizations)
    .values({ name: "Webhook Tester Org", slug, status })
    .returning();
  if (!org) throw new Error("org not created");

  const stripeCustomerId = `cus_test_${crypto.randomUUID().slice(0, 8)}`;
  await testDb
    .insert(organizationStripeCustomers)
    .values({ organizationId: org.id, stripeCustomerId });

  return { org, stripeCustomerId };
}

function buildEvent(overrides: { id: string; type: string; object: Record<string, unknown> }) {
  return {
    id: overrides.id,
    object: "event",
    type: overrides.type,
    api_version: "2026-09-30.endive",
    created: Math.floor(Date.now() / 1000),
    data: { object: overrides.object },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  };
}

function signedRequest(event: object): Request {
  const stripe = getStripeClient();
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature, "Content-Type": "application/json" },
    body: payload,
  });
}

function orgCreditSessionObject(opts: {
  sessionId: string;
  stripeCustomerId: string;
  organizationId: string;
  plan: string;
  purchasingUserId?: string | null;
}) {
  return {
    id: opts.sessionId,
    mode: "payment",
    payment_status: "paid",
    customer: opts.stripeCustomerId,
    payment_intent: `pi_test_${crypto.randomUUID().slice(0, 8)}`,
    metadata: {
      application: "incidentrank",
      purchase_type: "organization_assessment_credits",
      organization_id: opts.organizationId,
      plan: opts.plan,
      ...(opts.purchasingUserId ? { purchasing_user_id: opts.purchasingUserId } : {}),
    },
  };
}

describe("checkout.session.completed — organization assessment credits", () => {
  it("a valid single-credit purchase grants +1", async () => {
    const { org, stripeCustomerId } = await createOrgWithStripeCustomer();
    lineItemsPriceId = SINGLE_PRICE_ID;
    const sessionId = `cs_test_${crypto.randomUUID()}`;

    const response = await POST(
      signedRequest(
        buildEvent({
          id: `evt_test_${crypto.randomUUID()}`,
          type: "checkout.session.completed",
          object: orgCreditSessionObject({ sessionId, stripeCustomerId, organizationId: org.id, plan: "single_credit" }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(1);
  });

  it("a valid pack purchase grants +110", async () => {
    const { org, stripeCustomerId } = await createOrgWithStripeCustomer();
    lineItemsPriceId = PACK_PRICE_ID;
    const sessionId = `cs_test_${crypto.randomUUID()}`;

    const response = await POST(
      signedRequest(
        buildEvent({
          id: `evt_test_${crypto.randomUUID()}`,
          type: "checkout.session.completed",
          object: orgCreditSessionObject({ sessionId, stripeCustomerId, organizationId: org.id, plan: "credit_pack_110" }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(110);
  });

  it("duplicate webhook delivery (same session) never double-credits", async () => {
    const { org, stripeCustomerId } = await createOrgWithStripeCustomer();
    lineItemsPriceId = SINGLE_PRICE_ID;
    const sessionId = `cs_test_${crypto.randomUUID()}`;
    const object = orgCreditSessionObject({ sessionId, stripeCustomerId, organizationId: org.id, plan: "single_credit" });

    await POST(
      signedRequest(buildEvent({ id: `evt_test_${crypto.randomUUID()}`, type: "checkout.session.completed", object })),
    );
    // A second, DIFFERENT event id delivering the SAME checkout session —
    // the organization_credit_ledger partial unique index on
    // stripeCheckoutSessionId is what must catch this, not the webhook
    // event-id dedup gate (which only catches an identical event id).
    await POST(
      signedRequest(buildEvent({ id: `evt_test_${crypto.randomUUID()}`, type: "checkout.session.completed", object })),
    );

    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(1);
  });

  it("an unknown price id grants no credit, even if metadata claims a quantity", async () => {
    const { org, stripeCustomerId } = await createOrgWithStripeCustomer();
    lineItemsPriceId = "price_totally_unrecognized";
    const sessionId = `cs_test_${crypto.randomUUID()}`;

    const response = await POST(
      signedRequest(
        buildEvent({
          id: `evt_test_${crypto.randomUUID()}`,
          type: "checkout.session.completed",
          object: orgCreditSessionObject({ sessionId, stripeCustomerId, organizationId: org.id, plan: "credit_pack_110" }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(0);
  });

  it("an unpaid session never grants credit", async () => {
    const { org, stripeCustomerId } = await createOrgWithStripeCustomer();
    lineItemsPriceId = SINGLE_PRICE_ID;
    const sessionId = `cs_test_${crypto.randomUUID()}`;
    const object = orgCreditSessionObject({ sessionId, stripeCustomerId, organizationId: org.id, plan: "single_credit" });
    object.payment_status = "unpaid";

    const response = await POST(
      signedRequest(buildEvent({ id: `evt_test_${crypto.randomUUID()}`, type: "checkout.session.completed", object })),
    );

    expect(response.status).toBe(200);
    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(0);
  });

  it("a session with the wrong Stripe customer/org mapping is rejected", async () => {
    const { org } = await createOrgWithStripeCustomer();
    lineItemsPriceId = SINGLE_PRICE_ID;
    const sessionId = `cs_test_${crypto.randomUUID()}`;
    const wrongCustomerId = `cus_test_${crypto.randomUUID().slice(0, 8)}`; // never mapped to `org`

    const response = await POST(
      signedRequest(
        buildEvent({
          id: `evt_test_${crypto.randomUUID()}`,
          type: "checkout.session.completed",
          object: orgCreditSessionObject({ sessionId, stripeCustomerId: wrongCustomerId, organizationId: org.id, plan: "single_credit" }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(0);
  });

  it("a suspended-after-checkout organization still receives the valid purchased credits", async () => {
    const { org, stripeCustomerId } = await createOrgWithStripeCustomer("suspended");
    lineItemsPriceId = SINGLE_PRICE_ID;
    const sessionId = `cs_test_${crypto.randomUUID()}`;

    const response = await POST(
      signedRequest(
        buildEvent({
          id: `evt_test_${crypto.randomUUID()}`,
          type: "checkout.session.completed",
          object: orgCreditSessionObject({ sessionId, stripeCustomerId, organizationId: org.id, plan: "single_credit" }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(1); // credited regardless of org status
  });

  it("the purchase writes a credits_purchased organization audit event", async () => {
    const { org, stripeCustomerId } = await createOrgWithStripeCustomer();
    lineItemsPriceId = SINGLE_PRICE_ID;
    const sessionId = `cs_test_${crypto.randomUUID()}`;

    await POST(
      signedRequest(
        buildEvent({
          id: `evt_test_${crypto.randomUUID()}`,
          type: "checkout.session.completed",
          object: orgCreditSessionObject({ sessionId, stripeCustomerId, organizationId: org.id, plan: "single_credit" }),
        }),
      ),
    );

    const events = await testDb.query.organizationAuditEvents.findMany({
      where: eq(organizationAuditEvents.organizationId, org.id),
    });
    expect(events.some((e) => e.action === "credits_purchased")).toBe(true);
  });

  it("webhook DB failure (duplicate event id) is retried safely without granting a second credit", async () => {
    const { org, stripeCustomerId } = await createOrgWithStripeCustomer();
    lineItemsPriceId = SINGLE_PRICE_ID;
    const sessionId = `cs_test_${crypto.randomUUID()}`;
    const eventId = `evt_test_${crypto.randomUUID()}`;
    const object = orgCreditSessionObject({ sessionId, stripeCustomerId, organizationId: org.id, plan: "single_credit" });
    const event = buildEvent({ id: eventId, type: "checkout.session.completed", object });

    const first = await POST(signedRequest(event));
    const second = await POST(signedRequest(event)); // identical event id — Stripe retry

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { duplicate?: boolean };
    expect(secondBody.duplicate).toBe(true);

    const eventRows = await testDb.query.stripeWebhookEvents.findMany({
      where: eq(stripeWebhookEvents.stripeEventId, eventId),
    });
    expect(eventRows.length).toBe(1);

    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(1);
  });
});
