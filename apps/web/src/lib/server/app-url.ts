import "server-only";

/**
 * The application's own public base URL, for server-side link
 * construction with no browser request to read window.location from
 * (transactional email bodies, Stripe Checkout redirect URLs). Falls
 * back to localhost so local dev never produces a broken relative link;
 * every deployed environment must set NEXT_PUBLIC_APP_URL to the real
 * domain.
 */
export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
