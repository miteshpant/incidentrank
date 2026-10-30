import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  createDb,
  organizationCreditLedger,
  organizationLaunchDiscountClaims,
  organizations,
  type Db,
} from "@incidentrank/db";
import {
  redeemOrgLaunchDiscountClaim,
  releaseOrgLaunchDiscountClaim,
  reserveOrgLaunchDiscountClaim,
  setOrgLaunchDiscountClaimCheckoutSession,
} from "./org-discount-claims";

const TEST_ORG_SLUG_PREFIX = "test-org-discount-claims-";

let testDb: Db;

beforeAll(async () => {
  testDb = createDb();
});

afterEach(async () => {
  const orgs = await testDb.query.organizations.findMany({
    where: like(organizations.slug, `${TEST_ORG_SLUG_PREFIX}%`),
  });
  for (const org of orgs) {
    await testDb
      .delete(organizationLaunchDiscountClaims)
      .where(eq(organizationLaunchDiscountClaims.organizationId, org.id));
    await testDb
      .delete(organizationCreditLedger)
      .where(eq(organizationCreditLedger.organizationId, org.id));
    await testDb.delete(organizations).where(eq(organizations.id, org.id));
  }
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

let orgCounter = 0;
async function createOrg() {
  orgCounter += 1;
  const [org] = await testDb
    .insert(organizations)
    .values({ name: "Discount Claim Tester", slug: `${TEST_ORG_SLUG_PREFIX}${orgCounter}` })
    .returning();
  if (!org) throw new Error("org not created");
  return org;
}

describe("reserveOrgLaunchDiscountClaim", () => {
  it("reserves a claim for a fresh organization", async () => {
    const org = await createOrg();

    const result = await testDb.transaction((tx) => reserveOrgLaunchDiscountClaim(tx, org.id));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.claim.status).toBe("reserved");
  });

  it("an organization with an existing successful purchase is denied — already_purchased", async () => {
    const org = await createOrg();
    await testDb.insert(organizationCreditLedger).values({
      organizationId: org.id,
      transactionType: "purchase",
      quantity: 1,
      stripeCheckoutSessionId: `cs_prior_${org.id}`,
    });

    const result = await testDb.transaction((tx) => reserveOrgLaunchDiscountClaim(tx, org.id));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("already_purchased");
  });

  it("a second reservation attempt while one is still live (not expired) is denied — already_claimed", async () => {
    const org = await createOrg();
    const first = await testDb.transaction((tx) => reserveOrgLaunchDiscountClaim(tx, org.id));
    expect(first.ok).toBe(true);

    const second = await testDb.transaction((tx) => reserveOrgLaunchDiscountClaim(tx, org.id));

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("already_claimed");
  });

  it("an expired, never-redeemed reservation is reclaimed by a fresh attempt rather than permanently blocking the discount", async () => {
    const org = await createOrg();
    // Seed a claim whose TTL has already passed — simulates an abandoned
    // Checkout Session from more than 24h ago.
    await testDb.insert(organizationLaunchDiscountClaims).values({
      organizationId: org.id,
      status: "reserved",
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await testDb.transaction((tx) => reserveOrgLaunchDiscountClaim(tx, org.id));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claim.status).toBe("reserved");
      expect(result.claim.expiresAt.getTime()).toBeGreaterThan(Date.now());
    }
    const rows = await testDb.query.organizationLaunchDiscountClaims.findMany({
      where: eq(organizationLaunchDiscountClaims.organizationId, org.id),
    });
    // Reclaim updates the existing row in place — never a second row,
    // consistent with the UNIQUE index on organization_id.
    expect(rows.length).toBe(1);
  });

  it("a redeemed claim is never reclaimed, even past its original expiry", async () => {
    const org = await createOrg();
    await testDb.insert(organizationLaunchDiscountClaims).values({
      organizationId: org.id,
      status: "redeemed",
      expiresAt: new Date(Date.now() - 1000),
      redeemedAt: new Date(),
    });

    const result = await testDb.transaction((tx) => reserveOrgLaunchDiscountClaim(tx, org.id));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("already_claimed");
  });

  it("exactly one of two concurrent reservations for the same organization succeeds", async () => {
    const orgA = await createOrg();

    const [resultA, resultB] = await Promise.all([
      testDb.transaction((tx) => reserveOrgLaunchDiscountClaim(tx, orgA.id)),
      testDb.transaction((tx) => reserveOrgLaunchDiscountClaim(tx, orgA.id)),
    ]);

    const succeeded = [resultA, resultB].filter((r) => r.ok);
    expect(succeeded.length).toBe(1);
    const rows = await testDb.query.organizationLaunchDiscountClaims.findMany({
      where: eq(organizationLaunchDiscountClaims.organizationId, orgA.id),
    });
    expect(rows.length).toBe(1);
  });
});

describe("releaseOrgLaunchDiscountClaim", () => {
  it("deletes a still-reserved claim", async () => {
    const org = await createOrg();
    const reserved = await testDb.transaction((tx) => reserveOrgLaunchDiscountClaim(tx, org.id));
    if (!reserved.ok) throw new Error("expected reservation to succeed");

    await testDb.transaction((tx) => releaseOrgLaunchDiscountClaim(tx, reserved.claim.id));

    const row = await testDb.query.organizationLaunchDiscountClaims.findFirst({
      where: eq(organizationLaunchDiscountClaims.id, reserved.claim.id),
    });
    expect(row).toBeUndefined();
  });

  it("never deletes an already-redeemed claim", async () => {
    const org = await createOrg();
    const reserved = await testDb.transaction((tx) => reserveOrgLaunchDiscountClaim(tx, org.id));
    if (!reserved.ok) throw new Error("expected reservation to succeed");
    await testDb.transaction((tx) =>
      setOrgLaunchDiscountClaimCheckoutSession(tx, reserved.claim.id, "cs_test_123"),
    );
    await testDb.transaction((tx) =>
      redeemOrgLaunchDiscountClaim(tx, org.id, "cs_test_123"),
    );

    await testDb.transaction((tx) => releaseOrgLaunchDiscountClaim(tx, reserved.claim.id));

    const row = await testDb.query.organizationLaunchDiscountClaims.findFirst({
      where: eq(organizationLaunchDiscountClaims.id, reserved.claim.id),
    });
    expect(row?.status).toBe("redeemed");
  });
});

describe("redeemOrgLaunchDiscountClaim", () => {
  it("marks a reserved claim redeemed when the session id matches", async () => {
    const org = await createOrg();
    const reserved = await testDb.transaction((tx) => reserveOrgLaunchDiscountClaim(tx, org.id));
    if (!reserved.ok) throw new Error("expected reservation to succeed");
    await testDb.transaction((tx) =>
      setOrgLaunchDiscountClaimCheckoutSession(tx, reserved.claim.id, "cs_test_match"),
    );

    await testDb.transaction((tx) => redeemOrgLaunchDiscountClaim(tx, org.id, "cs_test_match"));

    const row = await testDb.query.organizationLaunchDiscountClaims.findFirst({
      where: eq(organizationLaunchDiscountClaims.id, reserved.claim.id),
    });
    expect(row?.status).toBe("redeemed");
    expect(row?.redeemedAt).not.toBeNull();
  });

  it("a mismatched session id is a safe no-op — never redeems the wrong claim", async () => {
    const org = await createOrg();
    const reserved = await testDb.transaction((tx) => reserveOrgLaunchDiscountClaim(tx, org.id));
    if (!reserved.ok) throw new Error("expected reservation to succeed");
    await testDb.transaction((tx) =>
      setOrgLaunchDiscountClaimCheckoutSession(tx, reserved.claim.id, "cs_test_real"),
    );

    await testDb.transaction((tx) =>
      redeemOrgLaunchDiscountClaim(tx, org.id, "cs_test_wrong_session"),
    );

    const row = await testDb.query.organizationLaunchDiscountClaims.findFirst({
      where: eq(organizationLaunchDiscountClaims.id, reserved.claim.id),
    });
    expect(row?.status).toBe("reserved");
  });
});
