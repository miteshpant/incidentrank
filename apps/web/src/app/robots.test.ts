import { describe, expect, it } from "vitest";
import robots from "./robots";

/**
 * docs/implementation_plan/seopphase.md §8: allow crawling of intended
 * public pages, explicitly disallow private/internal areas — never
 * relied on as a security boundary, just a crawl-hint.
 */
describe("robots", () => {
  it("allows the public pages", () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rule?.allow).toContain("/incidents");
    expect(rule?.allow).toContain("/pricing");
    expect(rule?.allow).toContain("/contact");
  });

  it("disallows private/internal routes", () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    for (const privatePath of [
      "/admin",
      "/api",
      "/assessment",
      "/attempts",
      "/billing",
      "/challenge",
      "/invite",
      "/organization",
      "/organizations",
      "/profile",
      "/r",
      "/settings",
    ]) {
      expect(rule?.disallow).toContain(privatePath);
    }
  });

  it("points at the sitemap", () => {
    const result = robots();
    expect(result.sitemap).toContain("/sitemap.xml");
  });
});
