import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  assessments,
  attempts,
  organizationCreditLedger,
  organizations,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import {
  adjustOrganizationCredit,
  consumeOrganizationCreditForAttempt,
  getOrganizationCreditBalance,
  recordOrganizationCreditPurchase,
} from "./organization-credits";

/**
 * Integration tests against the local Postgres (docs/implementation_
 * plan/phase10b.md §65/§68/§70 Cases A & B). Covers the ledger's
 * authoritative-balance invariant, purchase/consumption idempotency,
 * adjustment safety, and genuine DB-level concurrency for the race-safe
 * consumption path.
 */

let testDb: Db;
let scenarioId: string;
let scenarioVersion: number;

const TEST_ORG_SLUG_PREFIX = "test-org-credits-";
const TEST_AUTH_USER_PREFIX = "test-org-credits-user-";

beforeAll(async () => {
  testDb = createDb();
  const scenario = await testDb.query.scenarios.findFirst({
    where: eq(scenarios.slug, "payment-retry-storm"),
  });
  if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
  scenarioId = scenario.id;
  scenarioVersion = 1;
});

afterEach(async () => {
  // attempts.assessmentId references assessments with onDelete:
  // "restrict" (not cascade) — attempts created against this test's
  // assessments must be deleted first, or the organizations ->
  // assessments cascade below fails with a restrict violation.
  const testUsers = await testDb.query.users.findMany({
    where: like(users.authProviderId, `${TEST_AUTH_USER_PREFIX}%`),
  });
  for (const user of testUsers) {
    await testDb.delete(attempts).where(eq(attempts.userId, user.id));
  }
  await testDb.delete(organizations).where(like(organizations.slug, `${TEST_ORG_SLUG_PREFIX}%`));
  await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_USER_PREFIX}%`));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

let orgCounter = 0;
async function createOrg() {
  orgCounter += 1;
  const slug = `${TEST_ORG_SLUG_PREFIX}${orgCounter}-${crypto.randomUUID().slice(0, 8)}`;
  const [org] = await testDb
    .insert(organizations)
    .values({ name: "Credits Tester Org", slug })
    .returning();
  if (!org) throw new Error("org not created");
  return org;
}

let userCounter = 0;
async function createUser() {
  userCounter += 1;
  const [user] = await testDb
    .insert(users)
    .values({
      authProviderId: `${TEST_AUTH_USER_PREFIX}${userCounter}-${crypto.randomUUID().slice(0, 8)}`,
      displayName: "Credits Tester",
    })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

async function createAttempt(candidateUserId: string, assessmentId: string) {
  const [attempt] = await testDb
    .insert(attempts)
    .values({
      userId: candidateUserId,
      scenarioId,
      scenarioVersion,
      attemptType: "assessment",
      assessmentId,
      status: "in_progress",
    })
    .returning();
  if (!attempt) throw new Error("attempt not created");
  return attempt;
}

async function createAssessment(organizationId: string, createdByUserId: string) {
  const [assessment] = await testDb
    .insert(assessments)
    .values({
      organizationId,
      name: "Staff Backend Hiring",
      scenarioId,
      scenarioVersion,
      status: "active",
      createdByUserId,
    })
    .returning();
  if (!assessment) throw new Error("assessment not created");
  return assessment;
}

describe("getOrganizationCreditBalance", () => {
  it("a new organization has a zero balance", async () => {
    const org = await createOrg();
    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance).toEqual({ purchased: 0, consumed: 0, adjusted: 0, available: 0 });
  });

  it("+1 purchase yields balance 1", async () => {
    const org = await createOrg();
    await testDb.transaction((tx) =>
      recordOrganizationCreditPurchase(tx, {
        organizationId: org.id,
        quantity: 1,
        stripeCheckoutSessionId: `cs_test_${crypto.randomUUID()}`,
        stripePaymentIntentId: null,
        purchasingUserId: null,
      }),
    );
    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(1);
    expect(balance.purchased).toBe(1);
  });

  it("+110 purchase yields balance 110", async () => {
    const org = await createOrg();
    await testDb.transaction((tx) =>
      recordOrganizationCreditPurchase(tx, {
        organizationId: org.id,
        quantity: 110,
        stripeCheckoutSessionId: `cs_test_${crypto.randomUUID()}`,
        stripePaymentIntentId: null,
        purchasingUserId: null,
      }),
    );
    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(110);
    expect(balance.purchased).toBe(110);
  });

  it("consumption decrements available and reports a positive consumed count", async () => {
    const org = await createOrg();
    const user = await createUser();
    const assessment = await createAssessment(org.id, user.id);
    const attempt = await createAttempt(user.id, assessment.id);
    await testDb.transaction((tx) =>
      recordOrganizationCreditPurchase(tx, {
        organizationId: org.id,
        quantity: 1,
        stripeCheckoutSessionId: `cs_test_${crypto.randomUUID()}`,
        stripePaymentIntentId: null,
        purchasingUserId: null,
      }),
    );

    await testDb.transaction((tx) =>
      consumeOrganizationCreditForAttempt(tx, {
        organizationId: org.id,
        assessmentId: assessment.id,
        attemptId: attempt.id,
      }),
    );

    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(0);
    expect(balance.consumed).toBe(1);
  });

  it("admin adjustment is reflected in the adjusted bucket and available balance", async () => {
    const org = await createOrg();
    const admin = await createUser();
    await testDb.transaction((tx) =>
      adjustOrganizationCredit(tx, {
        organizationId: org.id,
        quantity: 3,
        reason: "goodwill credit",
        createdByUserId: admin.id,
      }),
    );
    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.adjusted).toBe(3);
    expect(balance.available).toBe(3);
  });

  it("balance always equals the ledger's signed-quantity sum", async () => {
    const org = await createOrg();
    const user = await createUser();
    const assessment = await createAssessment(org.id, user.id);
    const attempt = await createAttempt(user.id, assessment.id);
    await testDb.transaction((tx) =>
      recordOrganizationCreditPurchase(tx, {
        organizationId: org.id,
        quantity: 110,
        stripeCheckoutSessionId: `cs_test_${crypto.randomUUID()}`,
        stripePaymentIntentId: null,
        purchasingUserId: null,
      }),
    );
    await testDb.transaction((tx) =>
      consumeOrganizationCreditForAttempt(tx, {
        organizationId: org.id,
        assessmentId: assessment.id,
        attemptId: attempt.id,
      }),
    );
    await testDb.transaction((tx) =>
      adjustOrganizationCredit(tx, {
        organizationId: org.id,
        quantity: -2,
        reason: "billing correction",
        createdByUserId: user.id,
      }),
    );

    const rows = await testDb.query.organizationCreditLedger.findMany({
      where: eq(organizationCreditLedger.organizationId, org.id),
    });
    const sum = rows.reduce((total, row) => total + row.quantity, 0);

    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(sum);
    expect(balance.available).toBe(107);
  });

  it("an unrelated organization's ledger rows never affect this organization's balance", async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    await testDb.transaction((tx) =>
      recordOrganizationCreditPurchase(tx, {
        organizationId: orgA.id,
        quantity: 110,
        stripeCheckoutSessionId: `cs_test_${crypto.randomUUID()}`,
        stripePaymentIntentId: null,
        purchasingUserId: null,
      }),
    );

    const balanceB = await getOrganizationCreditBalance(orgB.id);
    expect(balanceB.available).toBe(0);
  });
});

describe("recordOrganizationCreditPurchase — idempotency", () => {
  it("a duplicate purchase session does not double-credit", async () => {
    const org = await createOrg();
    const sessionId = `cs_test_${crypto.randomUUID()}`;

    const first = await testDb.transaction((tx) =>
      recordOrganizationCreditPurchase(tx, {
        organizationId: org.id,
        quantity: 110,
        stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId: null,
        purchasingUserId: null,
      }),
    );
    const second = await testDb.transaction((tx) =>
      recordOrganizationCreditPurchase(tx, {
        organizationId: org.id,
        quantity: 110,
        stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId: null,
        purchasingUserId: null,
      }),
    );

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);

    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(110);
  });
});

describe("consumeOrganizationCreditForAttempt — idempotency and safety", () => {
  it("a duplicate attempt does not double-consume", async () => {
    const org = await createOrg();
    const user = await createUser();
    const assessment = await createAssessment(org.id, user.id);
    const attempt = await createAttempt(user.id, assessment.id);
    const attemptId = attempt.id;
    await testDb.transaction((tx) =>
      recordOrganizationCreditPurchase(tx, {
        organizationId: org.id,
        quantity: 2,
        stripeCheckoutSessionId: `cs_test_${crypto.randomUUID()}`,
        stripePaymentIntentId: null,
        purchasingUserId: null,
      }),
    );

    const first = await testDb.transaction((tx) =>
      consumeOrganizationCreditForAttempt(tx, {
        organizationId: org.id,
        assessmentId: assessment.id,
        attemptId,
      }),
    );
    const second = await testDb.transaction((tx) =>
      consumeOrganizationCreditForAttempt(tx, {
        organizationId: org.id,
        assessmentId: assessment.id,
        attemptId,
      }),
    );

    expect(first).toEqual({ ok: true, inserted: true });
    expect(second).toEqual({ ok: true, inserted: false });

    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(1); // only ONE credit consumed, not two
  });

  it("insufficient balance is rejected and never drives balance negative", async () => {
    const org = await createOrg();
    const user = await createUser();
    const assessment = await createAssessment(org.id, user.id);

    const result = await testDb.transaction((tx) =>
      consumeOrganizationCreditForAttempt(tx, {
        organizationId: org.id,
        assessmentId: assessment.id,
        attemptId: crypto.randomUUID(),
      }),
    );

    expect(result).toEqual({ ok: false, reason: "insufficient_balance" });
    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(0);
  });
});

describe("adjustOrganizationCredit — safety", () => {
  it("a negative adjustment cannot create an invalid (negative) balance", async () => {
    const org = await createOrg();
    const admin = await createUser();
    await testDb.transaction((tx) =>
      recordOrganizationCreditPurchase(tx, {
        organizationId: org.id,
        quantity: 1,
        stripeCheckoutSessionId: `cs_test_${crypto.randomUUID()}`,
        stripePaymentIntentId: null,
        purchasingUserId: null,
      }),
    );

    const result = await testDb.transaction((tx) =>
      adjustOrganizationCredit(tx, {
        organizationId: org.id,
        quantity: -5,
        reason: "would overdraw",
        createdByUserId: admin.id,
      }),
    );

    expect(result).toEqual({ ok: false, reason: "would_go_negative" });
    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(1);
  });
});

describe("race-safe consumption — genuine DB concurrency (phase10b.md §70)", () => {
  it("Case A: balance = 1, two candidates start simultaneously — exactly one succeeds, balance = 0", async () => {
    const org = await createOrg();
    const candidateA = await createUser();
    const candidateB = await createUser();
    const owner = await createUser();
    const assessment = await createAssessment(org.id, owner.id);
    const attemptA = await createAttempt(candidateA.id, assessment.id);
    const attemptB = await createAttempt(candidateB.id, assessment.id);
    await testDb.transaction((tx) =>
      recordOrganizationCreditPurchase(tx, {
        organizationId: org.id,
        quantity: 1,
        stripeCheckoutSessionId: `cs_test_${crypto.randomUUID()}`,
        stripePaymentIntentId: null,
        purchasingUserId: null,
      }),
    );

    const [resultA, resultB] = await Promise.all([
      testDb.transaction((tx) =>
        consumeOrganizationCreditForAttempt(tx, {
          organizationId: org.id,
          assessmentId: assessment.id,
          attemptId: attemptA.id,
        }),
      ),
      testDb.transaction((tx) =>
        consumeOrganizationCreditForAttempt(tx, {
          organizationId: org.id,
          assessmentId: assessment.id,
          attemptId: attemptB.id,
        }),
      ),
    ]);

    const succeeded = [resultA, resultB].filter((r) => r.ok && r.inserted);
    const denied = [resultA, resultB].filter((r) => !r.ok);
    expect(succeeded.length).toBe(1);
    expect(denied.length).toBe(1);

    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(0);
  });

  it("Case A (10 credits, 11 concurrent candidates): exactly 10 succeed, balance = 0", async () => {
    const org = await createOrg();
    const owner = await createUser();
    const assessment = await createAssessment(org.id, owner.id);
    const candidates = await Promise.all(Array.from({ length: 11 }, () => createUser()));
    const attemptIds = await Promise.all(
      candidates.map((candidate) =>
        createAttempt(candidate.id, assessment.id).then((a) => a.id),
      ),
    );
    await testDb.transaction((tx) =>
      recordOrganizationCreditPurchase(tx, {
        organizationId: org.id,
        quantity: 10,
        stripeCheckoutSessionId: `cs_test_${crypto.randomUUID()}`,
        stripePaymentIntentId: null,
        purchasingUserId: null,
      }),
    );

    const results = await Promise.all(
      attemptIds.map((attemptId) =>
        testDb.transaction((tx) =>
          consumeOrganizationCreditForAttempt(tx, {
            organizationId: org.id,
            assessmentId: assessment.id,
            attemptId,
          }),
        ),
      ),
    );

    const succeeded = results.filter((r) => r.ok && r.inserted);
    const denied = results.filter((r) => !r.ok);
    expect(succeeded.length).toBe(10);
    expect(denied.length).toBe(1);

    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(0);
  }, 30_000);

  it("Case B: the same candidate/assessment attempt started twice concurrently consumes exactly once", async () => {
    const org = await createOrg();
    const owner = await createUser();
    const candidate = await createUser();
    const assessment = await createAssessment(org.id, owner.id);
    const attempt = await createAttempt(candidate.id, assessment.id);
    await testDb.transaction((tx) =>
      recordOrganizationCreditPurchase(tx, {
        organizationId: org.id,
        quantity: 2,
        stripeCheckoutSessionId: `cs_test_${crypto.randomUUID()}`,
        stripePaymentIntentId: null,
        purchasingUserId: null,
      }),
    );
    const attemptId = attempt.id;

    const [resultA, resultB] = await Promise.all([
      testDb.transaction((tx) =>
        consumeOrganizationCreditForAttempt(tx, {
          organizationId: org.id,
          assessmentId: assessment.id,
          attemptId,
        }),
      ),
      testDb.transaction((tx) =>
        consumeOrganizationCreditForAttempt(tx, {
          organizationId: org.id,
          assessmentId: assessment.id,
          attemptId,
        }),
      ),
    ]);

    const inserted = [resultA, resultB].filter((r) => r.ok && r.inserted);
    expect(inserted.length).toBe(1); // exactly one consumption entry

    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(1); // started 2 credits, consumed exactly 1

    const ledgerRows = await testDb.query.organizationCreditLedger.findMany({
      where: eq(organizationCreditLedger.attemptId, attemptId),
    });
    expect(ledgerRows.length).toBe(1);
  });

  it("two TRULY overlapping transactions for the SAME organization — the second's FOR UPDATE lock genuinely waits for the first's commit, never an unhandled exception", async () => {
    // Mirrors founding.test.ts's two-independent-connection technique:
    // a plain Promise.all over two testDb.transaction() calls can fully
    // serialize on a connection pool before truly overlapping. Driving
    // two raw reserved connections through explicit BEGIN/.../COMMIT
    // ordering forces transaction B's consumption attempt to block on
    // transaction A's FOR UPDATE lock until A commits, reproducing the
    // exact interleaving consumeOrganizationCreditForAttempt's locking
    // strategy exists to serialize.
    const org = await createOrg();
    const owner = await createUser();
    const candidate = await createUser();
    const assessment = await createAssessment(org.id, owner.id);
    const attempt = await createAttempt(candidate.id, assessment.id);
    await testDb.transaction((tx) =>
      recordOrganizationCreditPurchase(tx, {
        organizationId: org.id,
        quantity: 1,
        stripeCheckoutSessionId: `cs_test_${crypto.randomUUID()}`,
        stripePaymentIntentId: null,
        purchasingUserId: null,
      }),
    );

    const connA = await testDb.$client.reserve();
    const connB = await testDb.$client.reserve();
    const attemptA = attempt.id;
    try {
      await connA`BEGIN`;
      await connB`BEGIN`;

      // A locks the organization's ledger rows first.
      await connA`
        SELECT id FROM organization_credit_ledger
        WHERE organization_id = ${org.id}
        FOR UPDATE
      `;

      // B's lock attempt will block behind A's — start it concurrently
      // with A's remaining work and only await it after A commits.
      const bLockPromise = connB`
        SELECT id FROM organization_credit_ledger
        WHERE organization_id = ${org.id}
        FOR UPDATE
      `;

      const aBalance = await connA`
        SELECT COALESCE(SUM(quantity), 0) AS available
        FROM organization_credit_ledger
        WHERE organization_id = ${org.id}
      `;
      expect(Number(aBalance[0]?.available)).toBe(1);

      await connA`
        INSERT INTO organization_credit_ledger
          (organization_id, transaction_type, quantity, assessment_id, attempt_id)
        VALUES (${org.id}, 'assessment_started', -1, ${assessment.id}, ${attemptA})
      `;
      await connA`COMMIT`;

      // Now B's lock resolves, seeing A's committed consumption.
      await bLockPromise;
      const bBalance = await connB`
        SELECT COALESCE(SUM(quantity), 0) AS available
        FROM organization_credit_ledger
        WHERE organization_id = ${org.id}
      `;
      expect(Number(bBalance[0]?.available)).toBe(0); // sees A's committed -1

      // B correctly observes insufficient balance and does not insert.
      await connB`ROLLBACK`;
    } finally {
      connA.release();
      connB.release();
    }

    const balance = await getOrganizationCreditBalance(org.id);
    expect(balance.available).toBe(0);
    const consumptionRows = await testDb.query.organizationCreditLedger.findMany({
      where: eq(organizationCreditLedger.assessmentId, assessment.id),
    });
    expect(consumptionRows.length).toBe(1); // only A's consumption committed
  });
});
