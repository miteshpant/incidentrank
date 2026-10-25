import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { POST as PostHandler } from "./route";

/**
 * Regression coverage for the paid-practice access gate at the actual
 * route-handler boundary — not just the pure evaluatePracticeAccess()
 * function (see practice-access.test.ts) or the pure host-matching
 * dev-unlock predicate (see dev-unlock.test.ts). This closes the gap
 * identified during Phase 6C closeout: those two pure-function suites
 * were green, but nothing exercised the actual POST handler end-to-end
 * to confirm the gate is really wired in, under the real conditions the
 * dev server runs with (DEV_UNLOCK_PAID_SCENARIOS can be "true" in a
 * developer's local .env.local). Binding model (practice-access.ts):
 * paid scenarios are locked in practice mode for everyone except the
 * local-dev-only unlock (non-production + explicit env var + localhost
 * request) or a company-assigned assessment (a separate, unaffected
 * authorization path).
 */
describe("POST /api/attempts/score-preview — paid-scenario practice gate", () => {
  let POST: typeof PostHandler;

  // Imported once, outside any timed `it` block — the dynamic import's
  // module-graph resolution cost (observed 5-8s, scaling with
  // @incidentrank/scenarios' catalog size) can exceed Vitest's 10s
  // default hook timeout under concurrent-fork load; 30s gives real
  // headroom without masking an actually-hung import.
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function buildRequest(host: string) {
    return new Request("http://internal/api/attempts/score-preview", {
      method: "POST",
      headers: { host, "content-type": "application/json" },
      body: JSON.stringify({
        scenarioSlug: "rate-limit-misconfiguration",
        scoringInputs: {
          incidentStartedAtMs: 0,
          resolvedAtMs: 60_000,
          failedAtMs: null,
          revenueLossUsd: 0,
          finalStringValues: { rateLimitStatus: "protected" },
        },
      }),
    });
  }

  it("locks a paid scenario when DEV_UNLOCK_PAID_SCENARIOS is unset, even on localhost", async () => {
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", undefined);

    const response = await POST(buildRequest("localhost:3000"));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatch(/not available in practice mode/i);
  });

  it("locks a paid scenario when the dev-unlock flag is true but the request is not on localhost", async () => {
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", "true");

    const response = await POST(buildRequest("app.incidentrank.com"));

    expect(response.status).toBe(403);
  });

  it("locks a paid scenario when the dev-unlock flag is true but NODE_ENV is production", async () => {
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", "true");
    vi.stubEnv("NODE_ENV", "production");

    const response = await POST(buildRequest("localhost:3000"));

    expect(response.status).toBe(403);
  });

  it("unlocks a paid scenario only when the dev-unlock flag is true AND the request is on localhost AND non-production", async () => {
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", "true");

    const response = await POST(buildRequest("localhost:3000"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.score.total).toBeGreaterThanOrEqual(0);
  });

  it("never locks a free scenario, regardless of dev-unlock or host", async () => {
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", undefined);

    const request = new Request("http://internal/api/attempts/score-preview", {
      method: "POST",
      headers: { host: "app.incidentrank.com", "content-type": "application/json" },
      body: JSON.stringify({
        scenarioSlug: "database-connection-saturation",
        scoringInputs: {
          incidentStartedAtMs: 0,
          resolvedAtMs: 60_000,
          failedAtMs: null,
          revenueLossUsd: 0,
          finalStringValues: {},
        },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });
});
