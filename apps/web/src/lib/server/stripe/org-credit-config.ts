import "server-only";

export type OrgCreditPlan = "single_credit" | "credit_pack_110";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

/**
 * The server-side allowlist of purchasable organization credit plans
 * (docs/implementation_plan/phase10b.md §15/§23). Mirrors config.ts's
 * getPlanPriceId exactly but for the organization-credit catalog, which
 * is structurally separate from the individual Pro/Founding catalog —
 * never reuse getPlanPriceId for organization purchases. The client
 * sends only this `plan` string, never a raw Stripe Price ID.
 */
export function getOrgCreditPlanPriceId(plan: OrgCreditPlan): string {
  switch (plan) {
    case "single_credit":
      return requireEnv("STRIPE_ORG_SINGLE_CREDIT_PRICE_ID");
    case "credit_pack_110":
      return requireEnv("STRIPE_ORG_CREDIT_PACK_PRICE_ID");
  }
}

export function isValidOrgCreditPlan(value: unknown): value is OrgCreditPlan {
  return value === "single_credit" || value === "credit_pack_110";
}

/**
 * Reverse lookup used by the webhook handler to classify an incoming
 * Stripe object by its actual configured Price ID — never by trusting
 * `metadata.credit_quantity` (phase10b.md §20/§22: "the configured Price
 * ID determines credits"). Returns null for any Price ID this
 * application does not recognize as an organization-credit price;
 * callers must treat that as "grant nothing."
 */
export function orgCreditPlanForPriceId(priceId: string): OrgCreditPlan | null {
  if (priceId === process.env.STRIPE_ORG_SINGLE_CREDIT_PRICE_ID) {
    return "single_credit";
  }
  if (priceId === process.env.STRIPE_ORG_CREDIT_PACK_PRICE_ID) {
    return "credit_pack_110";
  }
  return null;
}

/** The server-authoritative credit quantity for a plan — never derived from client/webhook metadata. */
export function creditQuantityForPlan(plan: OrgCreditPlan): number {
  return plan === "single_credit" ? 1 : 110;
}
