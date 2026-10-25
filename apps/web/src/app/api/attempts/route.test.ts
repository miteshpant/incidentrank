import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, users, attempts, type Db } from "@incidentrank/db";
import type { POST as PostHandler } from "./route";

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
