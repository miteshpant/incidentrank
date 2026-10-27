import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";
import { eq, like } from "drizzle-orm";
import {
  createDb,
  organizationMembers,
  organizations,
  organizationStripeCustomers,
  users,
  type Db,
  type User,
} from "@incidentrank/db";
import type { POST as PostHandler } from "./route";

const TEST_AUTH_USER = "test-org-billing-checkout-user";
const TEST_ORG_SLUG_PREFIX = "test-org-billing-checkout-";

let testDb: Db;
let POST: typeof PostHandler;

// Mirrors the personal checkout route test's AsyncLocalStorage technique
// — binds the signed-in test user to each request's own async context so
// concurrent-user tests never race on a shared mutable variable.
const currentUserContext = new AsyncLocalStorage<User>();
async function withTestUser<T>(user: User, fn: () => Promise<T>): Promise<T> {
  return currentUserContext.run(user, fn);
}

let mockSessionCounter = 0;
let lastSessionCreateArgs: Record<string, unknown> | null = null;
vi.mock("@/lib/server/stripe/client", () => ({
  getStripeClient: () => ({
    customers: {
      create: async () => ({ id: `cus_mock_${crypto.randomUUID().slice(0, 8)}` }),
    },
    checkout: {
      sessions: {
        create: async (args: Record<string, unknown>) => {
          lastSessionCreateArgs = args;
          return {
            id: `cs_mock_${++mockSessionCounter}_${crypto.randomUUID().slice(0, 8)}`,
            url: `https://checkout.stripe.com/mock/${mockSessionCounter}`,
          };
        },
      },
    },
  }),
}));

vi.mock("@/lib/server/current-user", () => ({
  getOrCreateCurrentUser: async () => currentUserContext.getStore() ?? null,
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: {
      getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }),
    },
  }),
}));

beforeAll(async () => {
  testDb = createDb();
  ({ POST } = await import("./route"));
}, 30_000);

beforeEach(() => {
  vi.stubEnv("ORG_BILLING_ENABLED", "true");
  vi.stubEnv("ORG_CREDIT_PURCHASE_ENABLED", "true");
  vi.stubEnv("STRIPE_ORG_SINGLE_CREDIT_PRICE_ID", "price_org_single_test");
  vi.stubEnv("STRIPE_ORG_CREDIT_PACK_PRICE_ID", "price_org_pack_test");
  lastSessionCreateArgs = null;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  const orgs = await testDb.query.organizations.findMany({
    where: like(organizations.slug, `${TEST_ORG_SLUG_PREFIX}%`),
  });
  for (const org of orgs) {
    await testDb
      .delete(organizationStripeCustomers)
      .where(eq(organizationStripeCustomers.organizationId, org.id));
    await testDb.delete(organizationMembers).where(eq(organizationMembers.organizationId, org.id));
    await testDb.delete(organizations).where(eq(organizations.id, org.id));
  }
  await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_USER}%`));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

let userCounter = 0;
async function createUser() {
  userCounter += 1;
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: `${TEST_AUTH_USER}-${userCounter}`, displayName: "Billing Tester" })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

let orgCounter = 0;
async function createOrg(status: "pending" | "active" | "suspended" = "active") {
  orgCounter += 1;
  const slug = `${TEST_ORG_SLUG_PREFIX}${orgCounter}`;
  const [org] = await testDb
    .insert(organizations)
    .values({ name: "Billing Tester Org", slug, status })
    .returning();
  if (!org) throw new Error("org not created");
  return org;
}

async function addMember(organizationId: string, userId: string, role: "owner" | "admin" | "member") {
  await testDb.insert(organizationMembers).values({ organizationId, userId, role });
}

function postBody(slug: string, plan: string) {
  return new Request(`http://localhost/api/organizations/${slug}/billing/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
}

async function postAsParams(slug: string, plan: string) {
  return POST(postBody(slug, plan), { params: Promise.resolve({ slug }) });
}

describe("POST /api/organizations/[slug]/billing/checkout", () => {
  it("401s when signed out", async () => {
    const org = await createOrg();
    const response = await postAsParams(org.slug, "single_credit");
    expect(response.status).toBe(401);
  });

  it("403s when ORG_BILLING_ENABLED is off", async () => {
    vi.stubEnv("ORG_BILLING_ENABLED", "false");
    const org = await createOrg();
    const user = await createUser();
    await addMember(org.id, user.id, "owner");
    const response = await withTestUser(user, () => postAsParams(org.slug, "single_credit"));
    expect(response.status).toBe(403);
  });

  it("403s when ORG_CREDIT_PURCHASE_ENABLED is off", async () => {
    vi.stubEnv("ORG_CREDIT_PURCHASE_ENABLED", "false");
    const org = await createOrg();
    const user = await createUser();
    await addMember(org.id, user.id, "owner");
    const response = await withTestUser(user, () => postAsParams(org.slug, "single_credit"));
    expect(response.status).toBe(403);
  });

  it("a member is denied checkout", async () => {
    const org = await createOrg();
    const user = await createUser();
    await addMember(org.id, user.id, "member");
    const response = await withTestUser(user, () => postAsParams(org.slug, "single_credit"));
    expect(response.status).toBe(403);
  });

  it("an owner is allowed", async () => {
    const org = await createOrg();
    const user = await createUser();
    await addMember(org.id, user.id, "owner");
    const response = await withTestUser(user, () => postAsParams(org.slug, "single_credit"));
    expect(response.status).toBe(200);
  });

  it("an admin is allowed", async () => {
    const org = await createOrg();
    const user = await createUser();
    await addMember(org.id, user.id, "admin");
    const response = await withTestUser(user, () => postAsParams(org.slug, "single_credit"));
    expect(response.status).toBe(200);
  });

  it("a suspended organization is denied checkout creation", async () => {
    const org = await createOrg("suspended");
    const user = await createUser();
    await addMember(org.id, user.id, "owner");
    const response = await withTestUser(user, () => postAsParams(org.slug, "single_credit"));
    expect(response.status).toBe(403);
  });

  it("a pending organization is denied checkout creation", async () => {
    const org = await createOrg("pending");
    const user = await createUser();
    await addMember(org.id, user.id, "owner");
    const response = await withTestUser(user, () => postAsParams(org.slug, "single_credit"));
    expect(response.status).toBe(403);
  });

  it("an arbitrary plan string is rejected — never forwards a client-supplied price id", async () => {
    const org = await createOrg();
    const user = await createUser();
    await addMember(org.id, user.id, "owner");
    const response = await withTestUser(user, () =>
      postAsParams(org.slug, "literally_any_price_id_i_want"),
    );
    expect(response.status).toBe(400);
  });

  it("single_credit maps to the configured single-credit Price ID", async () => {
    const org = await createOrg();
    const user = await createUser();
    await addMember(org.id, user.id, "owner");
    await withTestUser(user, () => postAsParams(org.slug, "single_credit"));

    expect(lastSessionCreateArgs?.line_items).toEqual([
      { price: "price_org_single_test", quantity: 1 },
    ]);
  });

  it("credit_pack_110 maps to the configured pack Price ID", async () => {
    const org = await createOrg();
    const user = await createUser();
    await addMember(org.id, user.id, "owner");
    await withTestUser(user, () => postAsParams(org.slug, "credit_pack_110"));

    expect(lastSessionCreateArgs?.line_items).toEqual([
      { price: "price_org_pack_test", quantity: 1 },
    ]);
  });

  it("creates the organization Stripe customer once and reuses it on a second purchase", async () => {
    const org = await createOrg();
    const user = await createUser();
    await addMember(org.id, user.id, "owner");

    await withTestUser(user, () => postAsParams(org.slug, "single_credit"));
    await withTestUser(user, () => postAsParams(org.slug, "credit_pack_110"));

    const customers = await testDb.query.organizationStripeCustomers.findMany({
      where: eq(organizationStripeCustomers.organizationId, org.id),
    });
    expect(customers.length).toBe(1);
  });

  it("Org A's Stripe customer mapping is never reused for Org B", async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    const userA = await createUser();
    const userB = await createUser();
    await addMember(orgA.id, userA.id, "owner");
    await addMember(orgB.id, userB.id, "owner");

    await withTestUser(userA, () => postAsParams(orgA.slug, "single_credit"));
    await withTestUser(userB, () => postAsParams(orgB.slug, "single_credit"));

    const customerA = await testDb.query.organizationStripeCustomers.findFirst({
      where: eq(organizationStripeCustomers.organizationId, orgA.id),
    });
    const customerB = await testDb.query.organizationStripeCustomers.findFirst({
      where: eq(organizationStripeCustomers.organizationId, orgB.id),
    });
    expect(customerA?.stripeCustomerId).toBeDefined();
    expect(customerB?.stripeCustomerId).toBeDefined();
    expect(customerA?.stripeCustomerId).not.toBe(customerB?.stripeCustomerId);
  });

  it("checkout metadata contains the correct organization identity", async () => {
    const org = await createOrg();
    const user = await createUser();
    await addMember(org.id, user.id, "owner");
    await withTestUser(user, () => postAsParams(org.slug, "single_credit"));

    expect(lastSessionCreateArgs?.metadata).toMatchObject({
      purchase_type: "organization_assessment_credits",
      organization_id: org.id,
      plan: "single_credit",
    });
  });

  it("a Stripe Checkout Session creation failure grants no credits and returns a clean error", async () => {
    const stripeModule = await import("@/lib/server/stripe/client");
    const spy = vi
      .spyOn(stripeModule, "getStripeClient")
      .mockReturnValue({
        customers: { create: async () => ({ id: `cus_mock_${crypto.randomUUID().slice(0, 8)}` }) },
        checkout: {
          sessions: {
            create: async () => {
              throw new Error("stripe is down");
            },
          },
        },
      } as unknown as ReturnType<typeof stripeModule.getStripeClient>);

    const org = await createOrg();
    const user = await createUser();
    await addMember(org.id, user.id, "owner");
    const response = await withTestUser(user, () => postAsParams(org.slug, "single_credit"));

    expect(response.status).toBe(502);
    spy.mockRestore();
  });
});
