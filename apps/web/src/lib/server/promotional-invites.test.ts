import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { incidentPasses, promotionalInvites, users, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import {
  createPromotionalInvite,
  loadPromotionalInviteByToken,
  previewPromotionalInvites,
  redeemPromotionalInvite,
} from "./promotional-invites";

let testDb: Db;

const TEST_AUTH_ADMIN = "test-promo-invites-admin";
const TEST_AUTH_RECIPIENT = "test-promo-invites-recipient";
const TEST_AUTH_OTHER = "test-promo-invites-other";
const TEST_EMAIL = "promo-recipient@example.com";
const TEST_CAMPAIGN = "test-promo-invites-campaign";

beforeAll(async () => {
  testDb = createDb();
});

afterEach(async () => {
  const invites = await testDb.query.promotionalInvites.findMany({
    where: eq(promotionalInvites.campaign, TEST_CAMPAIGN),
  });
  for (const invite of invites) {
    if (invite.incidentPassId) {
      await testDb.delete(incidentPasses).where(eq(incidentPasses.id, invite.incidentPassId));
    }
  }
  await testDb.delete(promotionalInvites).where(eq(promotionalInvites.campaign, TEST_CAMPAIGN));
  for (const authId of [TEST_AUTH_ADMIN, TEST_AUTH_RECIPIENT, TEST_AUTH_OTHER]) {
    await testDb.delete(users).where(eq(users.authProviderId, authId));
  }
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createUser(authProviderId: string, displayName: string) {
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId, displayName })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

describe("previewPromotionalInvites", () => {
  it("normalizes, deduplicates, and validates a bulk paste", async () => {
    const result = await previewPromotionalInvites(
      [" Foo@Example.com ", "foo@example.com", "not-an-email", "bar@example.com"],
      TEST_CAMPAIGN,
    );

    expect(result.valid).toEqual(["Foo@Example.com ".trim(), "bar@example.com"]);
    expect(result.duplicate).toEqual(["foo@example.com"]);
    expect(result.invalid).toEqual(["not-an-email"]);
  });

  it("flags an email as duplicate if an active invite for the same campaign already exists", async () => {
    const admin = await createUser(TEST_AUTH_ADMIN, "Admin");
    await createPromotionalInvite({
      email: TEST_EMAIL,
      campaign: TEST_CAMPAIGN,
      createdByUserId: admin.id,
    });

    const result = await previewPromotionalInvites([TEST_EMAIL], TEST_CAMPAIGN);
    expect(result.duplicate).toContain(TEST_EMAIL);
    expect(result.valid).toEqual([]);
  });
});

describe("createPromotionalInvite / loadPromotionalInviteByToken", () => {
  it("creates an invite and the token resolves it back", async () => {
    const admin = await createUser(TEST_AUTH_ADMIN, "Admin");
    const { invite, token } = await createPromotionalInvite({
      email: TEST_EMAIL,
      campaign: TEST_CAMPAIGN,
      createdByUserId: admin.id,
    });

    expect(invite.status).toBe("created");
    expect(token.length).toBeGreaterThan(20);

    const loaded = await loadPromotionalInviteByToken(token);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.invite.id).toBe(invite.id);
  });
});

describe("redeemPromotionalInvite", () => {
  it("grants exactly one Incident Pass on first redemption", async () => {
    const admin = await createUser(TEST_AUTH_ADMIN, "Admin");
    const recipient = await createUser(TEST_AUTH_RECIPIENT, "Recipient");
    const { invite } = await createPromotionalInvite({
      email: TEST_EMAIL,
      campaign: TEST_CAMPAIGN,
      createdByUserId: admin.id,
    });

    const result = await redeemPromotionalInvite(invite, recipient, TEST_EMAIL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.alreadyRedeemed).toBe(false);
      const pass = await testDb.query.incidentPasses.findFirst({
        where: eq(incidentPasses.id, result.passId),
      });
      expect(pass?.userId).toBe(recipient.id);
      expect(pass?.sourceType).toBe("promo_invite");
      expect(pass?.status).toBe("available");
    }
  });

  it("is idempotent for repeated redemption by the same user", async () => {
    const admin = await createUser(TEST_AUTH_ADMIN, "Admin");
    const recipient = await createUser(TEST_AUTH_RECIPIENT, "Recipient");
    const { invite } = await createPromotionalInvite({
      email: TEST_EMAIL,
      campaign: TEST_CAMPAIGN,
      createdByUserId: admin.id,
    });

    const first = await redeemPromotionalInvite(invite, recipient, TEST_EMAIL);
    expect(first.ok).toBe(true);

    const invite2 = await testDb.query.promotionalInvites.findFirst({
      where: eq(promotionalInvites.id, invite.id),
    });
    if (!invite2) throw new Error("invite not found");

    const second = await redeemPromotionalInvite(invite2, recipient, TEST_EMAIL);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.passId).toBe(first.passId);
      expect(second.alreadyRedeemed).toBe(true);
    }
  });

  it("rejects redemption by a user whose verified email does not match", async () => {
    const admin = await createUser(TEST_AUTH_ADMIN, "Admin");
    const other = await createUser(TEST_AUTH_OTHER, "Other");
    const { invite } = await createPromotionalInvite({
      email: TEST_EMAIL,
      campaign: TEST_CAMPAIGN,
      createdByUserId: admin.id,
    });

    const result = await redeemPromotionalInvite(invite, other, "wrong@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("email_mismatch");
  });

  it("rejects a second different user once already redeemed", async () => {
    const admin = await createUser(TEST_AUTH_ADMIN, "Admin");
    const recipient = await createUser(TEST_AUTH_RECIPIENT, "Recipient");
    const other = await createUser(TEST_AUTH_OTHER, "Other");
    const { invite } = await createPromotionalInvite({
      email: TEST_EMAIL,
      campaign: TEST_CAMPAIGN,
      createdByUserId: admin.id,
    });

    await redeemPromotionalInvite(invite, recipient, TEST_EMAIL);
    const invite2 = await testDb.query.promotionalInvites.findFirst({
      where: eq(promotionalInvites.id, invite.id),
    });
    if (!invite2) throw new Error("invite not found");

    const result = await redeemPromotionalInvite(invite2, other, TEST_EMAIL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("claimed_by_other");
  });

  it("rejects an expired invite", async () => {
    const admin = await createUser(TEST_AUTH_ADMIN, "Admin");
    const recipient = await createUser(TEST_AUTH_RECIPIENT, "Recipient");
    const { invite } = await createPromotionalInvite({
      email: TEST_EMAIL,
      campaign: TEST_CAMPAIGN,
      createdByUserId: admin.id,
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await redeemPromotionalInvite(invite, recipient, TEST_EMAIL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("rejects a revoked invite", async () => {
    const admin = await createUser(TEST_AUTH_ADMIN, "Admin");
    const recipient = await createUser(TEST_AUTH_RECIPIENT, "Recipient");
    const { invite } = await createPromotionalInvite({
      email: TEST_EMAIL,
      campaign: TEST_CAMPAIGN,
      createdByUserId: admin.id,
    });
    await testDb
      .update(promotionalInvites)
      .set({ status: "revoked" })
      .where(eq(promotionalInvites.id, invite.id));
    const revoked = await testDb.query.promotionalInvites.findFirst({
      where: eq(promotionalInvites.id, invite.id),
    });
    if (!revoked) throw new Error("invite not found");

    const result = await redeemPromotionalInvite(revoked, recipient, TEST_EMAIL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("revoked");
  });

  it("two concurrent redemption attempts by the same user grant exactly one pass", async () => {
    const admin = await createUser(TEST_AUTH_ADMIN, "Admin");
    const recipient = await createUser(TEST_AUTH_RECIPIENT, "Recipient");
    const { invite } = await createPromotionalInvite({
      email: TEST_EMAIL,
      campaign: TEST_CAMPAIGN,
      createdByUserId: admin.id,
    });

    const [a, b] = await Promise.all([
      redeemPromotionalInvite(invite, recipient, TEST_EMAIL),
      redeemPromotionalInvite(invite, recipient, TEST_EMAIL),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const passes = await testDb.query.incidentPasses.findMany({
      where: eq(incidentPasses.sourceId, invite.id),
    });
    expect(passes.length).toBe(1);
  });
});
