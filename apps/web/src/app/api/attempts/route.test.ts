import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  createDb,
  users,
  attempts,
  incidentPasses,
  scenarios,
  type Db,
} from "@incidentrank/db";
import type { POST as PostHandler } from "./route";
import { bindIncidentPass, grantIncidentPass } from "@/lib/server/incident-passes";

const TEST_AUTH_ID = "test-paid-practice-gate";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: TEST_AUTH_ID }),
  currentUser: async () => ({
    fullName: "Paid Gate Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

/**
 * Regression coverage for the paid-practice access gate on the actual
 * attempt-creation route — the highest-value target, since this is the
 * route that would actually let someone play (and persist an attempt
 * for) a paid scenario without entitlement. Added during Phase 6C
 * closeout after confirming evaluatePracticeAccess() and
 * isDevUnlockPaidScenariosRequest() were both correctly implemented and
 * unit-tested in isolation, but nothing exercised this route end-to-end
 * to prove the gate is actually wired in here, under realistic
 * DEV_UNLOCK_PAID_SCENARIOS states. Binding model (practice-access.ts):
 * paid scenarios are locked in practice mode for everyone except the
 * local-dev-only unlock or a company-assigned assessment.
 */
describe("POST /api/attempts — paid-scenario practice gate", () => {
  let testDb: Db;
  let POST: typeof PostHandler;

  // Imported once, outside any timed `it` block — see the identical note
  // in score-preview/route.test.ts. The dynamic import's first-time
  // transform cost (observed 5-8s, scaling with @incidentrank/scenarios'
  // catalog size) can exceed Vitest's 10s default hook timeout under
  // concurrent-fork load; 30s gives real headroom without masking an
  // actually-hung import.
  beforeAll(async () => {
    testDb = createDb();
    ({ POST } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_ID));
  });

  function buildRequest(host: string, scenarioSlug: string) {
    return new Request("http://internal/api/attempts", {
      method: "POST",
      headers: { host, "content-type": "application/json" },
      body: JSON.stringify({ scenarioSlug }),
    });
  }

  it("refuses to create an attempt for a paid scenario when dev-unlock is unset, even on localhost", async () => {
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", undefined);

    const response = await POST(buildRequest("localhost:3000", "rate-limit-misconfiguration"));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatch(/not available in practice mode/i);
  });

  it("creates no attempt row for a paid scenario when dev-unlock is unset", async () => {
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", undefined);

    await POST(buildRequest("localhost:3000", "rate-limit-misconfiguration"));

    const user = await testDb.query.users.findFirst({
      where: eq(users.authProviderId, TEST_AUTH_ID),
    });
    if (!user) return; // user row may not exist yet if auth lookup short-circuited before insert
    const rows = await testDb.query.attempts.findMany({ where: eq(attempts.userId, user.id) });
    expect(rows).toHaveLength(0);
  });

  it("refuses a paid scenario when dev-unlock is true but the request is not on localhost", async () => {
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", "true");

    const response = await POST(buildRequest("app.incidentrank.com", "rate-limit-misconfiguration"));

    expect(response.status).toBe(403);
  });

  it("creates an attempt for a paid scenario only when dev-unlock is true AND on localhost AND non-production", async () => {
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", "true");

    const response = await POST(buildRequest("localhost:3000", "rate-limit-misconfiguration"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attempt?.id).toBeTruthy();
  });

  it("always creates an attempt for a free scenario, regardless of dev-unlock or host", async () => {
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", undefined);

    const response = await POST(
      buildRequest("app.incidentrank.com", "database-connection-saturation"),
    );

    expect(response.status).toBe(200);
  });
});

/**
 * Phase 7.3 regression: POST /api/attempts used to unconditionally
 * INSERT, so a signed-in candidate who navigated away/refreshed an
 * active practice incident and re-acknowledged the briefing got a
 * second, silently-created attempt row — the first was never completable
 * again (no UI ever offered a way back into it), and the candidate's
 * "Attempts" list accumulated unbounded orphaned "in_progress" rows.
 * POST is now idempotent against an existing in_progress practice
 * attempt for the same user+scenario; GET ?scenarioSlug= is the lookup
 * the practice console's resume flow uses on mount to find that same row
 * before deciding whether to show a fresh briefing or a resume prompt.
 */
describe("POST /api/attempts — idempotent against an existing in-progress attempt", () => {
  let testDb: Db;
  let POST: typeof PostHandler;
  let GET: (request: Request) => Promise<Response>;

  beforeAll(async () => {
    testDb = createDb();
    ({ POST, GET } = await import("./route"));
  }, 30_000);

  afterEach(async () => {
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_ID));
  });

  function buildPostRequest(scenarioSlug: string) {
    return new Request("http://internal/api/attempts", {
      method: "POST",
      headers: { host: "localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ scenarioSlug }),
    });
  }

  function buildGetRequest(scenarioSlug?: string) {
    const url = scenarioSlug
      ? `http://internal/api/attempts?scenarioSlug=${encodeURIComponent(scenarioSlug)}`
      : "http://internal/api/attempts";
    return new Request(url, { headers: { host: "localhost:3000" } });
  }

  it("a second POST for the same scenario returns the existing in-progress attempt, not a new row", async () => {
    const first = await POST(buildPostRequest("database-connection-saturation"));
    const firstBody = await first.json();
    expect(first.status).toBe(200);

    const second = await POST(buildPostRequest("database-connection-saturation"));
    const secondBody = await second.json();
    expect(second.status).toBe(200);

    expect(secondBody.attempt.id).toBe(firstBody.attempt.id);

    const user = await testDb.query.users.findFirst({
      where: eq(users.authProviderId, TEST_AUTH_ID),
    });
    const rows = await testDb.query.attempts.findMany({
      where: eq(attempts.userId, user!.id),
    });
    expect(rows).toHaveLength(1);
  });

  it("a different scenario still gets its own new attempt even with an existing in-progress attempt for another scenario", async () => {
    const first = await POST(buildPostRequest("database-connection-saturation"));
    const firstBody = await first.json();

    const second = await POST(buildPostRequest("kafka-consumer-lag"));
    const secondBody = await second.json();

    expect(secondBody.attempt.id).not.toBe(firstBody.attempt.id);

    const user = await testDb.query.users.findFirst({
      where: eq(users.authProviderId, TEST_AUTH_ID),
    });
    const rows = await testDb.query.attempts.findMany({
      where: eq(attempts.userId, user!.id),
    });
    expect(rows).toHaveLength(2);
  });

  it("GET ?scenarioSlug= finds the existing in-progress attempt for resume", async () => {
    const created = await POST(buildPostRequest("database-connection-saturation"));
    const createdBody = await created.json();

    const response = await GET(buildGetRequest("database-connection-saturation"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.attempt.id).toBe(createdBody.attempt.id);
  });

  it("GET ?scenarioSlug= returns null when no in-progress attempt exists for that scenario", async () => {
    const response = await GET(buildGetRequest("database-connection-saturation"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.attempt).toBeNull();
  });

  it("unscoped GET (no scenarioSlug) still returns the full attempts history list, unaffected", async () => {
    await POST(buildPostRequest("database-connection-saturation"));

    const response = await GET(buildGetRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.attempts)).toBe(true);
    expect(body.attempts.length).toBeGreaterThan(0);
  });
});

/**
 * Phase 8: starting a premium scenario with a pass bound to it must
 * atomically consume that pass and link attempt.incidentPassId — the
 * "pass consumption / attempt start" transaction boundary from docs/
 * implementation_plan/phase8_admin_promotional_access_referrals.md §12/
 * §29. A direct POST with no bound pass for a paid scenario must still
 * be refused (§13's "direct API attempts must enforce the same rule").
 */
describe("POST /api/attempts — Incident Pass consumption", () => {
  let testDb: Db;
  let POST: typeof PostHandler;
  const PAID_SCENARIO_SLUG = "rate-limit-misconfiguration";

  beforeAll(async () => {
    testDb = createDb();
    ({ POST } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", undefined);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const user = await testDb.query.users.findFirst({
      where: eq(users.authProviderId, TEST_AUTH_ID),
    });
    if (user) {
      await testDb.delete(incidentPasses).where(eq(incidentPasses.userId, user.id));
    }
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_ID));
  });

  function buildRequest(scenarioSlug: string) {
    return new Request("http://internal/api/attempts", {
      method: "POST",
      headers: { host: "localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ scenarioSlug }),
    });
  }

  async function ensureUser() {
    const existing = await testDb.query.users.findFirst({
      where: eq(users.authProviderId, TEST_AUTH_ID),
    });
    if (existing) return existing;
    const [created] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_ID, displayName: "Pass Consumption Tester" })
      .returning();
    if (!created) throw new Error("user not created");
    return created;
  }

  it("without a bound pass, a direct API call to start a paid scenario is still refused", async () => {
    const response = await POST(buildRequest(PAID_SCENARIO_SLUG));
    expect(response.status).toBe(403);
  });

  it("starting a scenario with a pass bound to it consumes the pass and links incidentPassId", async () => {
    const user = await ensureUser();
    const scenarioRow = await testDb.query.scenarios.findFirst({
      where: and(eq(scenarios.slug, PAID_SCENARIO_SLUG), eq(scenarios.ownershipType, "incidentrank")),
    });
    if (!scenarioRow) throw new Error("seed scenario missing — run pnpm db:seed");

    const pass = await grantIncidentPass(testDb, { userId: user.id, sourceType: "admin_grant" });
    if (!pass) throw new Error("pass not granted");
    const bound = await bindIncidentPass(testDb, { passId: pass.id, userId: user.id, scenario: scenarioRow });
    expect(bound.ok).toBe(true);

    const response = await POST(buildRequest(PAID_SCENARIO_SLUG));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attempt.incidentPassId).toBe(pass.id);

    const reloadedPass = await testDb.query.incidentPasses.findFirst({
      where: eq(incidentPasses.id, pass.id),
    });
    expect(reloadedPass?.status).toBe("consumed");
  });

  it("concurrent attempt-start requests for the same bound pass do not double-consume", async () => {
    const user = await ensureUser();
    const scenarioRow = await testDb.query.scenarios.findFirst({
      where: and(eq(scenarios.slug, PAID_SCENARIO_SLUG), eq(scenarios.ownershipType, "incidentrank")),
    });
    if (!scenarioRow) throw new Error("seed scenario missing — run pnpm db:seed");

    const pass = await grantIncidentPass(testDb, { userId: user.id, sourceType: "admin_grant" });
    if (!pass) throw new Error("pass not granted");
    await bindIncidentPass(testDb, { passId: pass.id, userId: user.id, scenario: scenarioRow });

    const [a, b] = await Promise.all([
      POST(buildRequest(PAID_SCENARIO_SLUG)),
      POST(buildRequest(PAID_SCENARIO_SLUG)),
    ]);

    const statuses = [a.status, b.status].sort();
    // Exactly one request wins (200, consumes the pass); the loser gets a
    // clean 409 (pass already consumed) — never a second attempt, never a
    // 500. (A 200/200 pair would only occur if the loser's idempotency
    // check for an existing in-progress attempt somehow raced ahead of
    // the winner's INSERT, which the transaction boundary here prevents.)
    expect(statuses).toEqual([200, 409]);

    const attemptRows = await testDb.query.attempts.findMany({
      where: eq(attempts.incidentPassId, pass.id),
    });
    expect(attemptRows.length).toBeLessThanOrEqual(1);
  });

  it("resuming (re-POSTing) an existing in-progress pass-funded attempt does not consume a second pass", async () => {
    const user = await ensureUser();
    const scenarioRow = await testDb.query.scenarios.findFirst({
      where: and(eq(scenarios.slug, PAID_SCENARIO_SLUG), eq(scenarios.ownershipType, "incidentrank")),
    });
    if (!scenarioRow) throw new Error("seed scenario missing — run pnpm db:seed");

    const pass = await grantIncidentPass(testDb, { userId: user.id, sourceType: "admin_grant" });
    if (!pass) throw new Error("pass not granted");
    await bindIncidentPass(testDb, { passId: pass.id, userId: user.id, scenario: scenarioRow });

    const first = await POST(buildRequest(PAID_SCENARIO_SLUG));
    expect(first.status).toBe(200);
    const firstBody = await first.json();

    // A second Incident Pass, also available for this user, to prove the
    // resume path doesn't reach for *any* available/bound pass again.
    const secondPass = await grantIncidentPass(testDb, { userId: user.id, sourceType: "admin_grant" });

    const second = await POST(buildRequest(PAID_SCENARIO_SLUG));
    expect(second.status).toBe(200);
    const secondBody = await second.json();

    expect(secondBody.attempt.id).toBe(firstBody.attempt.id);
    expect(secondBody.attempt.incidentPassId).toBe(pass.id);

    const reloadedSecondPass = await testDb.query.incidentPasses.findFirst({
      where: eq(incidentPasses.id, secondPass!.id),
    });
    expect(reloadedSecondPass?.status).toBe("available");

    const attemptRows = await testDb.query.attempts.findMany({
      where: eq(attempts.userId, user.id),
    });
    expect(attemptRows.length).toBe(1);
  });
});
