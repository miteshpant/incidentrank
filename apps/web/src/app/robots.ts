import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/server/app-url";

/**
 * Allows crawling of every intended public page, disallows every
 * admin/private-assessment/org-internal/candidate-assignment/challenge-
 * token/auth-callback/private-result/referral-redirect route (docs/
 * implementation_plan/seopphase.md §8). Not relied on as a security
 * boundary — every disallowed path here is already server-side
 * access-gated independent of robots.txt.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/incidents", "/incidents/", "/pricing", "/contact"],
      disallow: [
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
      ],
    },
    sitemap: `${appBaseUrl()}/sitemap.xml`,
  };
}
