import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: null }),
  currentUser: async () => null,
}));

/**
 * Regression coverage for GET /api/incidents/[slug]/simulation — the
 * route GenericIncidentConsole fetches lazily instead of ever receiving
 * the full ScenarioSimulationDefinition as a server-passed prop (see
 * docs/implementation_plan/seopphase.md §1/§15). Proves the route's
 * access gate behaves identically to the page's own render-time gate:
 * a free scenario's real simulation is reachable anonymously, a locked
 * (paid) scenario's is not, and an unknown slug 404s.
 */
describe("GET /api/incidents/[slug]/simulation", () => {
  let GET: typeof import("./route").GET;

  beforeAll(async () => {
    ({ GET } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the real simulation for a free scenario, even anonymously", async () => {
    const response = await GET(new Request("http://internal"), {
      params: Promise.resolve({ slug: "kafka-consumer-lag" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { simulation?: { rules?: unknown } };
    expect(body.simulation).toBeDefined();
    expect(body.simulation?.rules).toBeDefined();
  });

  it("returns 403 for a locked (paid) scenario when not entitled", async () => {
    const response = await GET(new Request("http://internal"), {
      params: Promise.resolve({ slug: "cache-revalidation-herd" }),
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { simulation?: unknown };
    expect(body.simulation).toBeUndefined();
  });

  it("returns 404 for an unknown slug", async () => {
    const response = await GET(new Request("http://internal"), {
      params: Promise.resolve({ slug: "no-such-scenario" }),
    });
    expect(response.status).toBe(404);
  });
});
