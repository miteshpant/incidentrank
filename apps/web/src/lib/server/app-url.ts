import "server-only";

/**
 * The application's own public base URL, for server-side link
 * construction with no browser request to read window.location from
 * (transactional email bodies, Stripe Checkout redirect URLs, SEO
 * canonical/sitemap/robots/OG URLs). Falls back to localhost so local dev
 * and `next build` (which sets NODE_ENV=production even for a local
 * build) never fail or produce a broken relative link; every deployed
 * environment must set NEXT_PUBLIC_APP_URL to the real domain
 * (https://www.incidentrank.com in production) — an unset value in an
 * actually-deployed environment silently falls back to localhost, which
 * is a known limitation (see beta_readiness_report.md), not something
 * this function can distinguish from a local production build at runtime.
 */
export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
