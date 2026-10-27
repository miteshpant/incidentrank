import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  createDb,
  paidEntitlements,
  stripeCustomers,
  stripeWebhookEvents,
  users,
  type Db,
} from "@incidentrank/db";
import { getStripeClient } from "@/lib/server/stripe/client";
import type { POST as PostHandler } from "./route";

const TEST_AUTH_USER = "test-webhook-route-user";

let testDb: Db;
let POST: typeof PostHandler;

beforeAll(async () => {
  testDb = createDb();
  ({ POST } = await import("./route"));
}, 30_000);

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOKS_ENABLED", "true");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  const testUsers = await testDb.query.users.findMany({
    where: like(users.authProviderId, `${TEST_AUTH_USER}%`),
  });
  for (const user of testUsers) {
    await testDb.delete(paidEntitlements).where(eq(paidEntitlements.userId, user.id));
    await testDb.delete(stripeCustomers).where(eq(stripeCustomers.userId, user.id));
  }
  await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_USER}%`));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

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

describe("POST /api/stripe/webhook", () => {
  it("rejects a request with no stripe-signature header", async () => {
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a request with an invalid signature", async () => {
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=not_a_real_signature" },
        body: JSON.stringify({ id: "evt_fake", type: "checkout.session.completed" }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("is gated on STRIPE_WEBHOOKS_ENABLED — returns 403 without mutating anything when off", async () => {
    vi.stubEnv("STRIPE_WEBHOOKS_ENABLED", "false");
    const eventId = `evt_test_${crypto.randomUUID()}`;
    const request = signedRequest(
      buildEvent({ id: eventId, type: "customer.subscription.created", object: {} }),
    );

    const response = await POST(request);

    expect(response.status).toBe(403);
    const row = await testDb.query.stripeWebhookEvents.findFirst({
      where: eq(stripeWebhookEvents.stripeEventId, eventId),
    });
    expect(row).toBeUndefined();
  });

  it("acknowledges and marks an unrecognized event type as processed without error", async () => {
    const eventId = `evt_test_${crypto.randomUUID()}`;
    const request = signedRequest(buildEvent({ id: eventId, type: "some.unhandled.event", object: {} }));

    const response = await POST(request);

    expect(response.status).toBe(200);
    const row = await testDb.query.stripeWebhookEvents.findFirst({
      where: eq(stripeWebhookEvents.stripeEventId, eventId),
    });
    expect(row?.processingStatus).toBe("processed");
  });

  it("idempotent replay — the same event id delivered twice is only ever processed once", async () => {
    const eventId = `evt_test_${crypto.randomUUID()}`;
    const event = buildEvent({ id: eventId, type: "some.unhandled.event", object: {} });

    const first = await POST(signedRequest(event));
    const second = await POST(signedRequest(event));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { duplicate?: boolean };
    expect(secondBody.duplicate).toBe(true);

    const rows = await testDb.query.stripeWebhookEvents.findMany({
      where: eq(stripeWebhookEvents.stripeEventId, eventId),
    });
    expect(rows.length).toBe(1);
  });

  it("a genuine concurrent double-delivery of the same event id is only processed once", async () => {
    const eventId = `evt_test_${crypto.randomUUID()}`;
    const event = buildEvent({ id: eventId, type: "some.unhandled.event", object: {} });

    const [a, b] = await Promise.all([POST(signedRequest(event)), POST(signedRequest(event))]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const rows = await testDb.query.stripeWebhookEvents.findMany({
      where: eq(stripeWebhookEvents.stripeEventId, eventId),
    });
    expect(rows.length).toBe(1);
  });

  it("never grants an entitlement for a checkout.session.completed with an unrecognized price id", async () => {
    const [user] = await testDb
      .insert(users)
      .values({ authProviderId: `${TEST_AUTH_USER}-unknown-price`, displayName: "Tester" })
      .returning();
    if (!user) throw new Error("user not created");
    const stripeCustomerId = `cus_test_${crypto.randomUUID().slice(0, 8)}`;
    await testDb.insert(stripeCustomers).values({ userId: user.id, stripeCustomerId });

    const eventId = `evt_test_${crypto.randomUUID()}`;
    const request = signedRequest(
      buildEvent({
        id: eventId,
        type: "checkout.session.completed",
        object: {
          id: `cs_test_${crypto.randomUUID()}`,
          mode: "payment",
          payment_status: "paid",
          customer: stripeCustomerId,
          payment_intent: null,
        },
      }),
    );

    // listLineItems is a real network call this handler makes — without
    // a live checkout session id behind it, Stripe will error; the
    // webhook route must still acknowledge (not crash the whole request)
    // and must mark the event failed rather than processed so Stripe
    // retries, never silently drop a failure as if it succeeded.
    const response = await POST(request);

    expect(response.status).toBe(500);
    const row = await testDb.query.stripeWebhookEvents.findFirst({
      where: eq(stripeWebhookEvents.stripeEventId, eventId),
    });
    expect(row?.processingStatus).toBe("failed");

    const entitlement = await testDb.query.paidEntitlements.findFirst({
      where: eq(paidEntitlements.userId, user.id),
    });
    expect(entitlement).toBeUndefined();
  });
});
