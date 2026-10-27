import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { adminInvites, adminUsers, users, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { acceptAdminInvite, createAdminInvite, loadAdminInviteByToken } from "./admin-invites";

let testDb: Db;

const TEST_AUTH_INVITER = "test-admin-invites-inviter";
const TEST_AUTH_RECIPIENT = "test-admin-invites-recipient";
const TEST_AUTH_OTHER = "test-admin-invites-other";
const TEST_INVITE_EMAIL = "new-admin@incidentrank.com";

beforeAll(async () => {
  testDb = createDb();
});

afterEach(async () => {
  await testDb.delete(adminInvites).where(eq(adminInvites.email, TEST_INVITE_EMAIL));
  for (const authId of [TEST_AUTH_INVITER, TEST_AUTH_RECIPIENT, TEST_AUTH_OTHER]) {
    const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, authId) });
    if (user) {
      await testDb.delete(adminUsers).where(eq(adminUsers.userId, user.id));
    }
  }
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_INVITER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_RECIPIENT));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OTHER));
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

describe("createAdminInvite", () => {
  it("creates an invite for a valid @incidentrank.com email", async () => {
    const inviter = await createUser(TEST_AUTH_INVITER, "Inviter");
    const result = await createAdminInvite({
      email: TEST_INVITE_EMAIL,
      role: "admin",
      invitedByUserId: inviter.id,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invite.status).toBe("pending");
      expect(typeof result.token).toBe("string");
      expect(result.token.length).toBeGreaterThan(20);
    }
  });

  it("rejects an external-domain email", async () => {
    const inviter = await createUser(TEST_AUTH_INVITER, "Inviter");
    const result = await createAdminInvite({
      email: "someone@gmail.com",
      role: "admin",
      invitedByUserId: inviter.id,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_domain");
  });
});

describe("acceptAdminInvite", () => {
  it("creates admin membership when the verified email matches", async () => {
    const inviter = await createUser(TEST_AUTH_INVITER, "Inviter");
    const recipient = await createUser(TEST_AUTH_RECIPIENT, "Recipient");

    const created = await createAdminInvite({
      email: TEST_INVITE_EMAIL,
      role: "admin",
      invitedByUserId: inviter.id,
    });
    if (!created.ok) throw new Error("invite not created");

    const loaded = await loadAdminInviteByToken(created.token);
    if (!loaded.ok) throw new Error("invite not found by token");

    const result = await acceptAdminInvite(loaded.invite, recipient, TEST_INVITE_EMAIL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.membership.role).toBe("admin");
      expect(result.membership.userId).toBe(recipient.id);
    }
  });

  it("rejects a mismatched verified email", async () => {
    const inviter = await createUser(TEST_AUTH_INVITER, "Inviter");
    const recipient = await createUser(TEST_AUTH_RECIPIENT, "Recipient");

    const created = await createAdminInvite({
      email: TEST_INVITE_EMAIL,
      role: "admin",
      invitedByUserId: inviter.id,
    });
    if (!created.ok) throw new Error("invite not created");
    const loaded = await loadAdminInviteByToken(created.token);
    if (!loaded.ok) throw new Error("invite not found by token");

    const result = await acceptAdminInvite(loaded.invite, recipient, "wrong@incidentrank.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("email_mismatch");
  });

  it("is idempotent for a repeated accept by the same already-accepted user", async () => {
    const inviter = await createUser(TEST_AUTH_INVITER, "Inviter");
    const recipient = await createUser(TEST_AUTH_RECIPIENT, "Recipient");

    const created = await createAdminInvite({
      email: TEST_INVITE_EMAIL,
      role: "admin",
      invitedByUserId: inviter.id,
    });
    if (!created.ok) throw new Error("invite not created");
    const loaded1 = await loadAdminInviteByToken(created.token);
    if (!loaded1.ok) throw new Error("invite not found by token");

    const first = await acceptAdminInvite(loaded1.invite, recipient, TEST_INVITE_EMAIL);
    expect(first.ok).toBe(true);

    const loaded2 = await loadAdminInviteByToken(created.token);
    if (!loaded2.ok) throw new Error("invite not found by token (2nd)");
    const second = await acceptAdminInvite(loaded2.invite, recipient, TEST_INVITE_EMAIL);

    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.membership.id).toBe(first.membership.id);
      expect(second.alreadyAccepted).toBe(true);
    }
  });

  it("rejects acceptance by a different user once already claimed", async () => {
    const inviter = await createUser(TEST_AUTH_INVITER, "Inviter");
    const recipient = await createUser(TEST_AUTH_RECIPIENT, "Recipient");
    const other = await createUser(TEST_AUTH_OTHER, "Other");

    const created = await createAdminInvite({
      email: TEST_INVITE_EMAIL,
      role: "admin",
      invitedByUserId: inviter.id,
    });
    if (!created.ok) throw new Error("invite not created");
    const loaded1 = await loadAdminInviteByToken(created.token);
    if (!loaded1.ok) throw new Error("invite not found by token");
    await acceptAdminInvite(loaded1.invite, recipient, TEST_INVITE_EMAIL);

    const loaded2 = await loadAdminInviteByToken(created.token);
    if (!loaded2.ok) throw new Error("invite not found by token (2nd)");
    const result = await acceptAdminInvite(loaded2.invite, other, TEST_INVITE_EMAIL);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("email_mismatch");
  });
});
