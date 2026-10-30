import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, gte, inArray, like, lt } from "drizzle-orm";
import type Stripe from "stripe";
import {
  createDb,
  foundingEngineerAllocations,
  paidEntitlements,
  stripeCustomers,
  users,
  type Db,
} from "@incidentrank/db";
import { reserveFoundingSlot, setFoundingSlotCheckoutSession } from "./founding-allocation";
import { handleCheckoutSessionCompleted } from "./webhook-handlers";

const TEST_AUTH_USER = "test-founding-checkout-user";
const TEST_SLOT_BASE = 920_000;
const FOUNDING_PRICE_ID = process.env.STRIPE_FOUNDING_LIFETIME_PRICE_ID;

if (!FOUNDING_PRICE_ID) {
  throw new Error("STRIPE_FOUNDING_LIFETIME_PRICE_ID must be set to run this suite");
}

let testDb: Db;

// Mirrors founding.test.ts's real-pool-shielding technique exactly —
// reserveFoundingSlot claims the globally lowest free slot across the
// WHOLE table.
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

beforeAll(async () => {
  testDb = createDb();
});

afterEach(async () => {
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

async function createUserWithReservedSlot(suffix: string) {
  await shieldRealPool();
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: `${TEST_AUTH_USER}-${suffix}`, displayName: "Founding Checkout Tester" })
    .returning();
  if (!user) throw new Error("user not created");
  const stripeCustomerId = `cus_test_${suffix}_${crypto.randomUUID().slice(0, 8)}`;
  await testDb.insert(stripeCustomers).values({ userId: user.id, stripeCustomerId });

  await testDb.insert(foundingEngineerAllocations).values({
    slotNumber: TEST_SLOT_BASE + Math.floor(Math.random() * 1000),
    status: "released",
  });
  const reservation = await testDb.transaction((tx) => reserveFoundingSlot(tx, user.id));
  if (!reservation.ok) throw new Error("expected reservation to succeed");

  const sessionId = `cs_test_${crypto.randomUUID()}`;
  await testDb.transaction((tx) =>
    setFoundingSlotCheckoutSession(tx, reservation.allocation.id, sessionId),
  );

  return { user, stripeCustomerId, sessionId };
}

function fakeSession(opts: {
  sessionId: string;
  stripeCustomerId: string;
  amountTotal: number;
  currency: string;
  amountDiscount: number;
}): Stripe.Checkout.Session {
  return {
    id: opts.sessionId,
    mode: "payment",
    payment_status: "paid",
    customer: opts.stripeCustomerId,
    payment_intent: `pi_test_${crypto.randomUUID().slice(0, 8)}`,
    amount_total: opts.amountTotal,
    currency: opts.currency,
    total_details: { amount_discount: opts.amountDiscount },
    metadata: {},
  } as unknown as Stripe.Checkout.Session;
}

function fakeStripe(priceId: string): Stripe {
  return {
    checkout: {
      sessions: {
        listLineItems: async () => ({ data: [{ price: { id: priceId } }] }),
      },
    },
  } as unknown as Stripe;
}

// docs/implementation_plan/phase10e.md §15/§37 — actual collected amount
// persistence for the one-time Founding purchase path.
describe("handleCheckoutSessionCompleted — Founding amount persistence", () => {
  it("persists the real discounted amount/currency/discount onto paidEntitlements", async () => {
    const { sessionId, stripeCustomerId } = await createUserWithReservedSlot("discounted");
    const session = fakeSession({
      sessionId,
      stripeCustomerId,
      amountTotal: 4950, // 50% off $99
      currency: "usd",
      amountDiscount: 4950,
    });

    await testDb.transaction((tx) =>
      handleCheckoutSessionCompleted(tx, session, fakeStripe(FOUNDING_PRICE_ID)),
    );

    const entitlement = await testDb.query.paidEntitlements.findFirst({
      where: eq(paidEntitlements.stripeCheckoutSessionId, sessionId),
    });
    expect(entitlement?.amountTotalUsdCents).toBe(4950);
    expect(entitlement?.currency).toBe("usd");
    expect(entitlement?.discountAmountUsdCents).toBe(4950);
  });

  it("a full-price (non-discounted) purchase persists the full amount with zero discount", async () => {
    const { sessionId, stripeCustomerId } = await createUserWithReservedSlot("full-price");
    const session = fakeSession({
      sessionId,
      stripeCustomerId,
      amountTotal: 9900,
      currency: "usd",
      amountDiscount: 0,
    });

    await testDb.transaction((tx) =>
      handleCheckoutSessionCompleted(tx, session, fakeStripe(FOUNDING_PRICE_ID)),
    );

    const entitlement = await testDb.query.paidEntitlements.findFirst({
      where: eq(paidEntitlements.stripeCheckoutSessionId, sessionId),
    });
    expect(entitlement?.amountTotalUsdCents).toBe(9900);
    expect(entitlement?.discountAmountUsdCents).toBe(0);
  });

  it("the lifetime entitlement is granted regardless of the discounted amount paid — discount never affects entitlement semantics", async () => {
    const { user, sessionId, stripeCustomerId } = await createUserWithReservedSlot("entitlement-unaffected");
    const session = fakeSession({
      sessionId,
      stripeCustomerId,
      amountTotal: 4950,
      currency: "usd",
      amountDiscount: 4950,
    });

    await testDb.transaction((tx) =>
      handleCheckoutSessionCompleted(tx, session, fakeStripe(FOUNDING_PRICE_ID)),
    );

    const entitlement = await testDb.query.paidEntitlements.findFirst({
      where: eq(paidEntitlements.userId, user.id),
    });
    expect(entitlement?.entitlementType).toBe("founding_lifetime");
    expect(entitlement?.status).toBe("active");
    expect(entitlement?.currentPeriodEnd).toBeNull();
  });
});
