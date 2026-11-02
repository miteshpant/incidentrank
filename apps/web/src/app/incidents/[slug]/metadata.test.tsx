import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => import("@/test/clerk-mock-impl"));

const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => null,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

import { generateMetadata } from "./page";

/**
 * docs/implementation_plan/seopphase.md §5: every scenario page must
 * have unique title/description, never a shared global default — and
 * (§5/§9) metadata must derive only from the public-safe projection,
 * with a real canonical URL.
 */
describe("ScenarioPracticePage generateMetadata", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("produces distinct titles/descriptions for two different scenarios", async () => {
    const kafka = await generateMetadata({
      params: Promise.resolve({ slug: "kafka-consumer-lag" }),
    });
    const cache = await generateMetadata({
      params: Promise.resolve({ slug: "cache-revalidation-herd" }),
    });

    expect(kafka.title).not.toEqual(cache.title);
    expect(kafka.description).not.toEqual(cache.description);
    expect(kafka.title).toContain("Kafka Consumer Lag");
    expect(cache.title).toContain("Cache Revalidation Herd");
  });

  it("includes a canonical URL pointing at the scenario's own page", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "kafka-consumer-lag" }),
    });

    expect(meta.alternates?.canonical).toContain("/incidents/kafka-consumer-lag");
  });

  it("returns empty metadata for an unknown slug rather than throwing", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "no-such-scenario" }),
    });

    expect(meta).toEqual({});
  });
});
