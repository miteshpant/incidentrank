import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";
import { eq, gte, inArray, like, lt } from "drizzle-orm";
import {
  createDb,
  foundingEngineerAllocations,
  paidEntitlements,
  stripeCustomers,
  users,
  type Db,
  type User,
} from "@incidentrank/db";
import type { POST as PostHandler } from "./route";

const TEST_AUTH_USER = "test-checkout-route-user";
const TEST_SLOT_BASE = 910_000;

let testDb: Db;
let POST: typeof PostHandler;

// Concurrency tests run two requests in parallel, each as a different
// signed-in user — a single shared `currentTestUser` variable would race
// (both POSTs would observe whichever value was set last, since
// getOrCreateCurrentUser is awaited asynchronously inside the handler,
// not read synchronously at call time). AsyncLocalStorage binds the test
// user to each request's own async context instead.
const currentUserContext = new AsyncLocalStorage<User>();

async function withTestUser<T>(user: User, fn: () => Promise<T>): Promise<T> {
  return currentUserContext.run(user, fn);
}

let mockSessionCounter = 0;
vi.mock("@/lib/server/stripe/client", () => ({
  getStripeClient: () => ({
    customers: {
      create: async () => ({ id: `cus_mock_${crypto.randomUUID().slice(0, 8)}` }),
    },
    checkout: {
      sessions: {
        create: async () => ({
          id: `cs_mock_${++mockSessionCounter}_${crypto.randomUUID().slice(0, 8)}`,
          url: `https://checkout.stripe.com/mock/${mockSessionCounter}`,
        }),
      },
    },
  }),
}));

vi.mock("@/lib/server/current-user", () => ({
  getOrCreateCurrentUser: async () => currentUserContext.getStore() ?? null,
}));

// reserveFoundingSlot (invoked by the Founding checkout branch) claims
// the globally lowest free slot across the WHOLE table — see founding
// .test.ts's comment for why the real local-dev pool must be shielded
// (marked 'issued', unclaimable) around every test here rather than
// trusting high slot numbers alone to isolate this suite.
let realPoolSnapshot: { id: string; status: "reserved" | "issued" | "released" | "expired" }[] = [];

async function shieldRealPool() {
  realPoolSnapshot = await testDb.query.foundingEngineerAllocations.findMany({
    where: lt(foundingEngineerAllocations.slotNumber, TEST_SLOT_BASE),
    columns: { id: true, status: true },
  });
  const toShield = realPoolSnapshot.filter((row) => row.status !== "issued").map((row) => row.id);
  if (toShield.length > 0) {
    await testDb
      .update(foundingEngineerAllocations)
      .set({ status: "issued" })
      .where(inArray(foundingEngineerAllocations.id, toShield));
  }
}

async function restoreRealPool() {
  for (const row of realPoolSnapshot) {
    if (row.status !== "issued") {
      await testDb
        .update(foundingEngineerAllocations)
        .set({ status: row.status })
        .where(eq(foundingEngineerAllocations.id, row.id));
    }
  }
  realPoolSnapshot = [];
}

async function seedSlots(count: number) {
  const slots = Array.from({ length: count }, (_, i) => ({
    slotNumber: TEST_SLOT_BASE + i,
    status: "released" as const,
  }));
  await testDb.insert(foundingEngineerAllocations).values(slots);
}

beforeAll(async () => {
  testDb = createDb();
  ({ POST } = await import("./route"));
}, 30_000);

beforeEach(async () => {
  vi.stubEnv("PAYMENTS_ENABLED", "true");
  vi.stubEnv("STRIPE_CHECKOUT_ENABLED", "true");
  await shieldRealPool();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await testDb
    .delete(foundingEngineerAllocations)
    .where(gte(foundingEngineerAllocations.slotNumber, TEST_SLOT_BASE));
  const testUsers = await testDb.query.users.findMany({
    where: like(users.authProviderId, `${TEST_AUTH_USER}%`),
  });
  for (const user of testUsers) {
    await testDb.delete(paidEntitlements).where(eq(paidEntitlements.userId, user.id));
    await testDb.delete(stripeCustomers).where(eq(stripeCustomers.userId, user.id));
  }
  await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_USER}%`));
  await restoreRealPool();
});

afterAll(async () => {
  await restoreRealPool();
  await testDb.$client.end({ timeout: 1 });
});

async function createUser(suffix: string) {
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: `${TEST_AUTH_USER}-${suffix}`, displayName: "Checkout Tester" })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

function postBody(plan: string) {
  return new Request("http://localhost/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
}

describe("POST /api/stripe/checkout", () => {
  it("401s when signed out", async () => {
    const response = await POST(postBody("pro_monthly"));
    expect(response.status).toBe(401);
  });

  it("403s when PAYMENTS_ENABLED is off", async () => {
    vi.stubEnv("PAYMENTS_ENABLED", "false");
    const user = await createUser("flag-off");
    const response = await withTestUser(user, () => POST(postBody("pro_monthly")));
    expect(response.status).toBe(403);
  });

  it("403s when STRIPE_CHECKOUT_ENABLED is off", async () => {
    vi.stubEnv("STRIPE_CHECKOUT_ENABLED", "false");
    const user = await createUser("checkout-off");
    const response = await withTestUser(user, () => POST(postBody("pro_monthly")));
    expect(response.status).toBe(403);
  });

  it("rejects an unrecognized plan string — never forwards a client-supplied price id", async () => {
    const user = await createUser("bad-plan");
    const response = await withTestUser(user, () =>
      POST(postBody("literally_any_price_id_i_want")),
    );
    expect(response.status).toBe(400);
  });

  it("creates a Pro monthly checkout session for a new customer", async () => {
    const user = await createUser("pro-new");
    const response = await withTestUser(user, () => POST(postBody("pro_monthly")));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { url?: string };
    expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\/mock\//);

    const customer = await testDb.query.stripeCustomers.findFirst({
      where: eq(stripeCustomers.userId, user.id),
    });
    expect(customer).toBeDefined();
  });

  it("reuses an existing Stripe customer rather than creating a second one", async () => {
    const user = await createUser("pro-reuse");
    await withTestUser(user, () => POST(postBody("pro_monthly")));
    await withTestUser(user, () => POST(postBody("pro_annual")));

    const customers = await testDb.query.stripeCustomers.findMany({
      where: eq(stripeCustomers.userId, user.id),
    });
    expect(customers.length).toBe(1);
  });

  it("blocks a second Pro checkout for an already-active Pro subscriber", async () => {
    const user = await createUser("already-pro");
    await testDb.insert(paidEntitlements).values({
      userId: user.id,
      entitlementType: "pro",
      status: "active",
      source: "stripe_subscription",
      startsAt: new Date(),
    });

    const response = await withTestUser(user, () => POST(postBody("pro_monthly")));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("already_pro");
  });

  it("blocks ANY checkout for an already-Founding user, including a Founding-again attempt", async () => {
    const user = await createUser("already-founding");
    await testDb.insert(paidEntitlements).values({
      userId: user.id,
      entitlementType: "founding_lifetime",
      status: "active",
      source: "stripe_founding_payment",
      startsAt: new Date(),
    });

    const proResponse = await withTestUser(user, () => POST(postBody("pro_monthly")));
    const foundingResponse = await withTestUser(user, () => POST(postBody("founding_lifetime")));

    expect(proResponse.status).toBe(400);
    expect((await proResponse.json()).error).toBe("already_founding");
    expect(foundingResponse.status).toBe(400);
    expect((await foundingResponse.json()).error).toBe("already_founding");
  });

  it("a Pro subscriber CAN still purchase Founding (only Founding blocks further checkout, not the reverse)", async () => {
    await seedSlots(1);
    const user = await createUser("pro-wants-founding");
    await testDb.insert(paidEntitlements).values({
      userId: user.id,
      entitlementType: "pro",
      status: "active",
      source: "stripe_subscription",
      startsAt: new Date(),
    });

    const response = await withTestUser(user, () => POST(postBody("founding_lifetime")));

    expect(response.status).toBe(200);
  });

  it("Founding checkout reserves a slot and records the checkout session id on it", async () => {
    await seedSlots(1);
    const user = await createUser("founding-reserve");

    const response = await withTestUser(user, () => POST(postBody("founding_lifetime")));
    expect(response.status).toBe(200);

    const allocation = await testDb.query.foundingEngineerAllocations.findFirst({
      where: eq(foundingEngineerAllocations.userId, user.id),
    });
    expect(allocation?.status).toBe("reserved");
    expect(allocation?.stripeCheckoutSessionId).toMatch(/^cs_mock_/);
  });

  it("sold-out Founding capacity returns 409, not 400 or 500", async () => {
    // Zero released/expired slots anywhere (real pool fully shielded,
    // no test slots seeded) — Founding has nothing to reserve.
    const user = await createUser("founding-sold-out");

    const response = await withTestUser(user, () => POST(postBody("founding_lifetime")));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("founding_sold_out");
  });

  it("exactly one of two concurrent Founding checkouts for the last slot succeeds; the loser sees sold-out, not a thrown error", async () => {
    await seedSlots(1);
    const [a, b] = [await createUser("race-a"), await createUser("race-b")];

    const responses = await Promise.all([
      withTestUser(a, () => POST(postBody("founding_lifetime"))),
      withTestUser(b, () => POST(postBody("founding_lifetime"))),
    ]);

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
  });
});
