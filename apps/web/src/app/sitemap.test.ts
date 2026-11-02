import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

/**
 * docs/implementation_plan/seopphase.md §7: the sitemap must derive only
 * from safe public scenario metadata, include every currently-published
 * built-in scenario, and never include admin/private-assessment/
 * org-internal/candidate-assignment/challenge-token/auth-callback/
 * private-result routes.
 */
describe("sitemap", () => {
  it("includes the homepage and static public pages", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls.some((u) => u.endsWith("/incidents"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/pricing"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/contact"))).toBe(true);
  });

  it("includes known public built-in scenario slugs", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls.some((u) => u.endsWith("/incidents/kafka-consumer-lag"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/incidents/payment-retry-storm"))).toBe(true);
  });

  it("never includes a private/internal route", async () => {
    const entries = await sitemap();
    // Check the first path SEGMENT only — a scenario slug like
    // "third-party-api-latency" legitimately contains the substring
    // "api" without being the /api route.
    const firstSegments = entries.map((e) => new URL(e.url).pathname.split("/")[1] ?? "");

    for (const privateSegment of [
      "admin",
      "api",
      "assessment",
      "attempts",
      "billing",
      "challenge",
      "invite",
      "organization",
      "organizations",
      "profile",
      "r",
      "settings",
    ]) {
      expect(firstSegments).not.toContain(privateSegment);
    }
  });
});
