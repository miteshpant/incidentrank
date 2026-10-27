import "server-only";

export type StripePlan = "pro_monthly" | "pro_annual" | "founding_lifetime";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

/**
 * The server-side allowlist of purchasable plans (docs/implementation_
 * plan/phase9.md §13/§40). The client sends a `plan` string, never a raw
 * Stripe Price ID — this is the only place that string is translated
 * into a real configured Price ID. An unrecognized plan is rejected;
 * an unrecognized incoming Price ID on a webhook is never matched here
 * and therefore never grants anything (see entitlements grant logic).
 */
export function getPlanPriceId(plan: StripePlan): string {
  switch (plan) {
    case "pro_monthly":
      return requireEnv("STRIPE_PRO_MONTHLY_PRICE_ID");
    case "pro_annual":
      return requireEnv("STRIPE_PRO_ANNUAL_PRICE_ID");
    case "founding_lifetime":
      return requireEnv("STRIPE_FOUNDING_LIFETIME_PRICE_ID");
  }
}

export function isValidStripePlan(value: unknown): value is StripePlan {
  return (
    value === "pro_monthly" ||
    value === "pro_annual" ||
    value === "founding_lifetime"
  );
}

/**
 * Reverse lookup used by webhook handlers to classify an incoming
 * Stripe object by its actual Price ID — never by trusting
 * `metadata.plan` alone (phase9.md §40: "never trust only metadata").
 * Returns null for any Price ID this application does not recognize;
 * callers must treat that as "grant nothing," not as an error to
 * silently ignore the distinction.
 */
export function planForPriceId(priceId: string): StripePlan | null {
  if (priceId === process.env.STRIPE_PRO_MONTHLY_PRICE_ID) return "pro_monthly";
  if (priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID) return "pro_annual";
  if (priceId === process.env.STRIPE_FOUNDING_LIFETIME_PRICE_ID) {
    return "founding_lifetime";
  }
  return null;
}

export function entitlementTypeForPlan(
  plan: StripePlan,
): "pro" | "founding_lifetime" {
  return plan === "founding_lifetime" ? "founding_lifetime" : "pro";
}
