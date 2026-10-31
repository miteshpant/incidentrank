import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, scenarios, type Db } from "@incidentrank/db";
import type { POST as PostHandler } from "./route";

/**
 * Phase 10G §4: this route resolves scenarios directly from
 * BUILT_IN_SCENARIO_CATALOG (never through getActiveScenarioBySlug), so
 * it needed its own explicit publishing-lifecycle gate — see
 * isBuiltInScenarioCurrentlyPublished's call site in route.ts. No test
 * file existed for this route before Phase 10G; this covers just the
 * new gate, mirroring score-preview/route.test.ts's equivalent suite.
 */
describe("POST /api/attempts/finish-preview — publishing lifecycle gate", () => {
  let POST: typeof PostHandler;
  let testDb: Db;
  const FREE_SLUG = "database-connection-saturation";

  beforeAll(async () => {
    ({ POST } = await import("./route"));
    testDb = createDb();
  }, 30_000);

  afterEach(async () => {
    vi.unstubAllEnvs();
    await testDb
      .update(scenarios)
      .set({ status: "published", publishedAt: null })
      .where(and(eq(scenarios.slug, FREE_SLUG), eq(scenarios.ownershipType, "incidentrank")));
  });

  function buildRequest() {
    return new Request("http://internal/api/attempts/finish-preview", {
      method: "POST",
      headers: { host: "app.incidentrank.com", "content-type": "application/json" },
      body: JSON.stringify({
        scenarioSlug: FREE_SLUG,
        elapsedMs: 0,
        actionGroups: [],
      }),
    });
  }

  it("404s for a free scenario that is currently a draft", async () => {
    await testDb
      .update(scenarios)
      .set({ status: "draft" })
      .where(and(eq(scenarios.slug, FREE_SLUG), eq(scenarios.ownershipType, "incidentrank")));

    const response = await POST(buildRequest());
    expect(response.status).toBe(404);
  });

  it("404s for a free scenario scheduled for a future publishedAt", async () => {
    await testDb
      .update(scenarios)
      .set({ publishedAt: new Date(Date.now() + 60 * 60 * 1000) })
      .where(and(eq(scenarios.slug, FREE_SLUG), eq(scenarios.ownershipType, "incidentrank")));

    const response = await POST(buildRequest());
    expect(response.status).toBe(404);
  });

  it("200s once a scheduled scenario's publishedAt has passed", async () => {
    await testDb
      .update(scenarios)
      .set({ publishedAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(and(eq(scenarios.slug, FREE_SLUG), eq(scenarios.ownershipType, "incidentrank")));

    const response = await POST(buildRequest());
    expect(response.status).toBe(200);
  });
});
