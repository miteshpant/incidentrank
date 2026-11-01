import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { analyticsEvents, users, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import type { POST as PostHandler } from "./route";

const TEST_AUTH_ID = "test-analytics-route-user";
const TEST_SLUG_PREFIX = "test-analytics-route-";

let clerkUserId: string | null = null;

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerkUserId }),
  currentUser: async () => ({
    fullName: "Analytics Route Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

function uniqueSlug(): string {
  return `${TEST_SLUG_PREFIX}${crypto.randomUUID().slice(0, 8)}`;
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * docs/implementation_plan/phase10g.metrics.md §13 — the one route an
 * anonymous visitor hits for every tracked event, so its auth-skip and
 * userId-never-trusted-from-body behavior are worth a direct test.
 */
describe("POST /api/analytics/events", () => {
  let testDb: Db;
  let POST: typeof PostHandler;

  beforeAll(async () => {
    testDb = createDb();
    ({ POST } = await import("./route"));
  }, 30_000);

  afterEach(async () => {
    clerkUserId = null;
    await testDb.delete(analyticsEvents).where(like(analyticsEvents.scenarioSlug, `${TEST_SLUG_PREFIX}%`));
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_ID));
  });

  it("accepts an anonymous (signed-out) request and returns 204", async () => {
    const slug = uniqueSlug();
    const response = await POST(postRequest({ eventName: "page_view", scenarioSlug: slug }));
    expect(response.status).toBe(204);

    const row = await testDb.query.analyticsEvents.findFirst({
      where: eq(analyticsEvents.scenarioSlug, slug),
    });
    expect(row).toBeDefined();
    expect(row?.userId).toBeNull();
  });

  it("silently no-ops (204, no row) for an unknown event name", async () => {
    const slug = uniqueSlug();
    const response = await POST(postRequest({ eventName: "totally_made_up", scenarioSlug: slug }));
    expect(response.status).toBe(204);

    const row = await testDb.query.analyticsEvents.findFirst({
      where: eq(analyticsEvents.scenarioSlug, slug),
    });
    expect(row).toBeUndefined();
  });

  it("silently no-ops (204) for a malformed JSON body", async () => {
    const request = new Request("http://localhost/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const response = await POST(request);
    expect(response.status).toBe(204);
  });

  it("derives userId from the server session, never trusting a client-supplied value", async () => {
    clerkUserId = TEST_AUTH_ID;
    const slug = uniqueSlug();

    // A malicious/buggy client attempts to pass its own userId — the
    // route has no such field in its accepted body shape at all, so this
    // is dropped; the real signed-in user's id is used instead.
    const response = await POST(
      postRequest({ eventName: "page_view", scenarioSlug: slug, userId: "11111111-1111-1111-1111-111111111111" }),
    );
    expect(response.status).toBe(204);

    const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, TEST_AUTH_ID) });
    const row = await testDb.query.analyticsEvents.findFirst({
      where: eq(analyticsEvents.scenarioSlug, slug),
    });
    expect(row?.userId).toBe(user?.id);
    expect(row?.userId).not.toBe("11111111-1111-1111-1111-111111111111");
  });

  it("drops disallowed context keys, keeping only the allowlisted ones", async () => {
    const slug = uniqueSlug();
    await POST(
      postRequest({
        eventName: "finish_clicked",
        scenarioSlug: slug,
        context: { label: "Finish Incident", reasoning: "candidate's private reasoning text", score: 950 },
      }),
    );

    const row = await testDb.query.analyticsEvents.findFirst({
      where: eq(analyticsEvents.scenarioSlug, slug),
    });
    expect(row?.context).toEqual({ label: "Finish Incident" });
  });
});
