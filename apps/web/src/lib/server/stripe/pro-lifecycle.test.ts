import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import type Stripe from "stripe";
import {
  createDb,
  paidEntitlements,
  stripeCustomers,
  stripeSubscriptions,
  users,
  type Db,
} from "@incidentrank/db";
import { evaluatePaidPracticeEntitlement, hasActivePaidEntitlement } from "./entitlements";
import { handleInvoiceEvent, handleSubscriptionEvent } from "./webhook-handlers";

let testDb: Db;

const TEST_AUTH_USER = "test-pro-lifecycle-user";
const PRO_MONTHLY_PRICE_ID = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
const PRO_ANNUAL_PRICE_ID = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;

if (!PRO_MONTHLY_PRICE_ID || !PRO_ANNUAL_PRICE_ID) {
  throw new Error(
    "STRIPE_PRO_MONTHLY_PRICE_ID / STRIPE_PRO_ANNUAL_PRICE_ID must be set to run this suite",
  );
}

beforeAll(async () => {
  testDb = createDb();
});

afterEach(async () => {
  const testUsers = await testDb.query.users.findMany({
    where: like(users.authProviderId, `${TEST_AUTH_USER}%`),
  });
  for (const user of testUsers) {
    await testDb.delete(paidEntitlements).where(eq(paidEntitlements.userId, user.id));
    await testDb.delete(stripeSubscriptions).where(eq(stripeSubscriptions.userId, user.id));
    await testDb.delete(stripeCustomers).where(eq(stripeCustomers.userId, user.id));
  }
  await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_USER}%`));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createUserWithCustomer(suffix: string) {
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: `${TEST_AUTH_USER}-${suffix}`, displayName: "Pro Tester" })
    .returning();
  if (!user) throw new Error("user not created");
  const stripeCustomerId = `cus_test_${suffix}_${crypto.randomUUID().slice(0, 8)}`;
  await testDb.insert(stripeCustomers).values({ userId: user.id, stripeCustomerId });
  return { user, stripeCustomerId };
}

function fakeSubscription(overrides: {
  id: string;
  customerId: string;
  priceId: string;
  productId?: string;
  status: Stripe.Subscription.Status;
  cancelAtPeriodEnd?: boolean;
}): Stripe.Subscription {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: overrides.id,
    customer: overrides.customerId,
    status: overrides.status,
    start_date: now,
    cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
    canceled_at: null,
    ended_at: null,
    items: {
      data: [
        {
          price: { id: overrides.priceId, product: overrides.productId ?? "prod_test" },
          current_period_start: now,
          current_period_end: now + 30 * 24 * 60 * 60,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

describe("handleSubscriptionEvent — Pro activation", () => {
  it("activates Pro for a recognized monthly price with status active", async () => {
    const { user, stripeCustomerId } = await createUserWithCustomer("monthly");
    const subscription = fakeSubscription({
      id: `sub_test_${crypto.randomUUID()}`,
      customerId: stripeCustomerId,
      priceId: PRO_MONTHLY_PRICE_ID,
      status: "active",
    });

    await testDb.transaction((tx) => handleSubscriptionEvent(tx, subscription));

    const state = await evaluatePaidPracticeEntitlement(user.id);
    expect(state).toBe("pro");
  });

  it("activates Pro for a recognized annual price", async () => {
    const { user, stripeCustomerId } = await createUserWithCustomer("annual");
    const subscription = fakeSubscription({
      id: `sub_test_${crypto.randomUUID()}`,
      customerId: stripeCustomerId,
      priceId: PRO_ANNUAL_PRICE_ID,
      status: "active",
    });

    await testDb.transaction((tx) => handleSubscriptionEvent(tx, subscription));

    const state = await evaluatePaidPracticeEntitlement(user.id);
    expect(state).toBe("pro");
  });

  it("never grants Pro for an unrecognized price ID, even though the raw subscription mirror is still synced", async () => {
    const { user, stripeCustomerId } = await createUserWithCustomer("unknown-price");
    const subscription = fakeSubscription({
      id: `sub_test_${crypto.randomUUID()}`,
      customerId: stripeCustomerId,
      priceId: "price_not_configured_anywhere",
      status: "active",
    });

    await testDb.transaction((tx) => handleSubscriptionEvent(tx, subscription));

    const state = await evaluatePaidPracticeEntitlement(user.id);
    expect(state).toBeNull();

    const mirrored = await testDb.query.stripeSubscriptions.findFirst({
      where: eq(stripeSubscriptions.stripeSubscriptionId, subscription.id),
    });
    expect(mirrored?.stripePriceId).toBe("price_not_configured_anywhere");
  });

  it("past_due still grants access", async () => {
    const { user, stripeCustomerId } = await createUserWithCustomer("past-due");
    const subscription = fakeSubscription({
      id: `sub_test_${crypto.randomUUID()}`,
      customerId: stripeCustomerId,
      priceId: PRO_MONTHLY_PRICE_ID,
      status: "past_due",
    });

    await testDb.transaction((tx) => handleSubscriptionEvent(tx, subscription));

    const state = await evaluatePaidPracticeEntitlement(user.id);
    expect(state).toBe("pro");
  });

  it("a canceled subscription ends Pro access", async () => {
    const { user, stripeCustomerId } = await createUserWithCustomer("cancel");
    const subId = `sub_test_${crypto.randomUUID()}`;
    await testDb.transaction((tx) =>
      handleSubscriptionEvent(
        tx,
        fakeSubscription({ id: subId, customerId: stripeCustomerId, priceId: PRO_MONTHLY_PRICE_ID, status: "active" }),
      ),
    );
    expect(await evaluatePaidPracticeEntitlement(user.id)).toBe("pro");

    await testDb.transaction((tx) =>
      handleSubscriptionEvent(
        tx,
        fakeSubscription({ id: subId, customerId: stripeCustomerId, priceId: PRO_MONTHLY_PRICE_ID, status: "canceled" }),
      ),
    );

    expect(await evaluatePaidPracticeEntitlement(user.id)).toBeNull();
  });

  it("cancel_at_period_end=true with status still active keeps access (Stripe's own status is trusted as-is)", async () => {
    const { user, stripeCustomerId } = await createUserWithCustomer("cape");
    const subscription = fakeSubscription({
      id: `sub_test_${crypto.randomUUID()}`,
      customerId: stripeCustomerId,
      priceId: PRO_MONTHLY_PRICE_ID,
      status: "active",
      cancelAtPeriodEnd: true,
    });

    await testDb.transaction((tx) => handleSubscriptionEvent(tx, subscription));

    expect(await evaluatePaidPracticeEntitlement(user.id)).toBe("pro");
    const mirrored = await testDb.query.stripeSubscriptions.findFirst({
      where: eq(stripeSubscriptions.stripeSubscriptionId, subscription.id),
    });
    expect(mirrored?.cancelAtPeriodEnd).toBe(true);
  });

  it("re-delivering the same event (replay) is idempotent — no duplicate paidEntitlements row", async () => {
    const { user, stripeCustomerId } = await createUserWithCustomer("replay");
    const subscription = fakeSubscription({
      id: `sub_test_${crypto.randomUUID()}`,
      customerId: stripeCustomerId,
      priceId: PRO_MONTHLY_PRICE_ID,
      status: "active",
    });

    await testDb.transaction((tx) => handleSubscriptionEvent(tx, subscription));
    await testDb.transaction((tx) => handleSubscriptionEvent(tx, subscription));

    const rows = await testDb.query.paidEntitlements.findMany({
      where: eq(paidEntitlements.userId, user.id),
    });
    expect(rows.length).toBe(1);
  });

  it("a user with no matching stripeCustomers row is silently skipped (no crash on an unmapped customer id)", async () => {
    const subscription = fakeSubscription({
      id: `sub_test_${crypto.randomUUID()}`,
      customerId: "cus_does_not_exist",
      priceId: PRO_MONTHLY_PRICE_ID,
      status: "active",
    });

    await expect(testDb.transaction((tx) => handleSubscriptionEvent(tx, subscription))).resolves.not.toThrow();
  });
});

describe("handleInvoiceEvent", () => {
  it("re-fetches the subscription and delegates to the same sync path", async () => {
    const { user, stripeCustomerId } = await createUserWithCustomer("invoice");
    const subId = `sub_test_${crypto.randomUUID()}`;
    const subscription = fakeSubscription({
      id: subId,
      customerId: stripeCustomerId,
      priceId: PRO_MONTHLY_PRICE_ID,
      status: "active",
    });
    const fakeStripe = {
      subscriptions: { retrieve: async () => subscription },
    } as unknown as Stripe;
    const invoice = {
      parent: { subscription_details: { subscription: subId } },
    } as unknown as Stripe.Invoice;

    await testDb.transaction((tx) => handleInvoiceEvent(tx, invoice, fakeStripe));

    expect(await evaluatePaidPracticeEntitlement(user.id)).toBe("pro");
  });

  it("an invoice with no linked subscription is a safe no-op", async () => {
    const invoice = { parent: null } as unknown as Stripe.Invoice;
    const fakeStripe = {
      subscriptions: { retrieve: async () => { throw new Error("should not be called"); } },
    } as unknown as Stripe;

    await expect(testDb.transaction((tx) => handleInvoiceEvent(tx, invoice, fakeStripe))).resolves.not.toThrow();
  });

  // docs/implementation_plan/phase10e.md §15/§37 — actual collected
  // amount persistence from invoice.payment_succeeded (paid) events.
  it("a paid invoice persists the real amount/currency/discount onto stripeSubscriptions", async () => {
    const { stripeCustomerId } = await createUserWithCustomer("invoice-amount");
    const subId = `sub_test_${crypto.randomUUID()}`;
    const subscription = fakeSubscription({
      id: subId,
      customerId: stripeCustomerId,
      priceId: PRO_MONTHLY_PRICE_ID,
      status: "active",
    });
    const fakeStripe = {
      subscriptions: { retrieve: async () => subscription },
    } as unknown as Stripe;
    const invoice = {
      status: "paid",
      amount_paid: 250, // 75% off $9.99 ≈ $2.50
      currency: "usd",
      total_discount_amounts: [{ amount: 749, discount: "di_test" }],
      parent: { subscription_details: { subscription: subId } },
    } as unknown as Stripe.Invoice;

    await testDb.transaction((tx) => handleInvoiceEvent(tx, invoice, fakeStripe));

    const row = await testDb.query.stripeSubscriptions.findFirst({
      where: eq(stripeSubscriptions.stripeSubscriptionId, subId),
    });
    expect(row?.lastInvoiceAmountPaidUsdCents).toBe(250);
    expect(row?.lastInvoiceCurrency).toBe("usd");
    expect(row?.lastInvoiceDiscountAmountUsdCents).toBe(749);
  });

  it("an unpaid invoice never writes an amount — never misrepresents a failed/draft invoice as collected", async () => {
    const { stripeCustomerId } = await createUserWithCustomer("invoice-unpaid");
    const subId = `sub_test_${crypto.randomUUID()}`;
    const subscription = fakeSubscription({
      id: subId,
      customerId: stripeCustomerId,
      priceId: PRO_MONTHLY_PRICE_ID,
      status: "active",
    });
    const fakeStripe = {
      subscriptions: { retrieve: async () => subscription },
    } as unknown as Stripe;
    const invoice = {
      status: "open",
      amount_paid: 0,
      currency: "usd",
      total_discount_amounts: null,
      parent: { subscription_details: { subscription: subId } },
    } as unknown as Stripe.Invoice;

    await testDb.transaction((tx) => handleInvoiceEvent(tx, invoice, fakeStripe));

    const row = await testDb.query.stripeSubscriptions.findFirst({
      where: eq(stripeSubscriptions.stripeSubscriptionId, subId),
    });
    expect(row?.lastInvoiceAmountPaidUsdCents).toBeNull();
  });

  it("a later paid invoice (normal-price renewal) overwrites the earlier discounted amount", async () => {
    const { stripeCustomerId } = await createUserWithCustomer("invoice-renewal");
    const subId = `sub_test_${crypto.randomUUID()}`;
    const subscription = fakeSubscription({
      id: subId,
      customerId: stripeCustomerId,
      priceId: PRO_MONTHLY_PRICE_ID,
      status: "active",
    });
    const fakeStripe = {
      subscriptions: { retrieve: async () => subscription },
    } as unknown as Stripe;

    await testDb.transaction((tx) =>
      handleInvoiceEvent(
        tx,
        {
          status: "paid",
          amount_paid: 250,
          currency: "usd",
          total_discount_amounts: [{ amount: 749, discount: "di_test" }],
          parent: { subscription_details: { subscription: subId } },
        } as unknown as Stripe.Invoice,
        fakeStripe,
      ),
    );
    await testDb.transaction((tx) =>
      handleInvoiceEvent(
        tx,
        {
          status: "paid",
          amount_paid: 999,
          currency: "usd",
          total_discount_amounts: null,
          parent: { subscription_details: { subscription: subId } },
        } as unknown as Stripe.Invoice,
        fakeStripe,
      ),
    );

    const row = await testDb.query.stripeSubscriptions.findFirst({
      where: eq(stripeSubscriptions.stripeSubscriptionId, subId),
    });
    expect(row?.lastInvoiceAmountPaidUsdCents).toBe(999);
    expect(row?.lastInvoiceDiscountAmountUsdCents).toBe(0);
  });

  it("a plain subscription.updated event (no invoice) never clobbers the last-known invoice amount with null", async () => {
    const { stripeCustomerId } = await createUserWithCustomer("invoice-preserve");
    const subId = `sub_test_${crypto.randomUUID()}`;
    const subscription = fakeSubscription({
      id: subId,
      customerId: stripeCustomerId,
      priceId: PRO_MONTHLY_PRICE_ID,
      status: "active",
    });
    const fakeStripe = {
      subscriptions: { retrieve: async () => subscription },
    } as unknown as Stripe;

    await testDb.transaction((tx) =>
      handleInvoiceEvent(
        tx,
        {
          status: "paid",
          amount_paid: 250,
          currency: "usd",
          total_discount_amounts: [{ amount: 749, discount: "di_test" }],
          parent: { subscription_details: { subscription: subId } },
        } as unknown as Stripe.Invoice,
        fakeStripe,
      ),
    );
    // A plain subscription.updated webhook (e.g. cancel_at_period_end
    // toggled) — no invoiceAmount, handleSubscriptionEvent's default null.
    await testDb.transaction((tx) =>
      handleSubscriptionEvent(
        tx,
        fakeSubscription({
          id: subId,
          customerId: stripeCustomerId,
          priceId: PRO_MONTHLY_PRICE_ID,
          status: "active",
          cancelAtPeriodEnd: true,
        }),
      ),
    );

    const row = await testDb.query.stripeSubscriptions.findFirst({
      where: eq(stripeSubscriptions.stripeSubscriptionId, subId),
    });
    expect(row?.lastInvoiceAmountPaidUsdCents).toBe(250);
    expect(row?.cancelAtPeriodEnd).toBe(true);
  });
});

describe("hasActivePaidEntitlement", () => {
  it("returns false before any entitlement exists, true after activation", async () => {
    const { user, stripeCustomerId } = await createUserWithCustomer("has-entitlement");
    expect(await hasActivePaidEntitlement(user.id, "pro")).toBe(false);

    await testDb.transaction((tx) =>
      handleSubscriptionEvent(
        tx,
        fakeSubscription({
          id: `sub_test_${crypto.randomUUID()}`,
          customerId: stripeCustomerId,
          priceId: PRO_MONTHLY_PRICE_ID,
          status: "active",
        }),
      ),
    );

    expect(await hasActivePaidEntitlement(user.id, "pro")).toBe(true);
    expect(await hasActivePaidEntitlement(user.id, "founding_lifetime")).toBe(false);
  });
});
