import "server-only";

/**
 * Phase 10C — static USD-cents price map for the platform revenue
 * dashboard (docs/implementation_plan/phase10c.md §25/§42/§43). Values
 * confirmed directly against the real Stripe TEST MODE Price objects
 * configured in this environment (STRIPE_PRO_MONTHLY_PRICE_ID,
 * STRIPE_PRO_ANNUAL_PRICE_ID, STRIPE_FOUNDING_LIFETIME_PRICE_ID,
 * STRIPE_ORG_SINGLE_CREDIT_PRICE_ID, STRIPE_ORG_CREDIT_PACK_PRICE_ID) at
 * implementation time — never re-derived from a live Stripe API call per
 * spec §42 ("avoid making dozens of live Stripe API requests every time
 * /admin/dashboard loads"). No live sync: update these by hand if the
 * underlying Stripe Price amounts ever change.
 *
 * All monetary values in this module and everywhere downstream in the
 * revenue dashboard are integer USD cents, never floats — avoids
 * rounding drift when summing. Divide by 100 only at render time.
 */

export const PRO_MONTHLY_PRICE_USD_CENTS = 999; // $9.99/mo
export const PRO_ANNUAL_PRICE_USD_CENTS = 7900; // $79/yr
export const FOUNDING_LIFETIME_PRICE_USD_CENTS = 9900; // $99 one-time
export const ORG_SINGLE_CREDIT_PRICE_USD_CENTS = 5000; // $50 one-time, 1 credit
export const ORG_CREDIT_PACK_110_PRICE_USD_CENTS = 500_000; // $5,000 one-time, 110 credits

/** MRR contribution of one active monthly Pro subscription. */
export function proMonthlyMrrUsdCents(): number {
  return PRO_MONTHLY_PRICE_USD_CENTS;
}

/** MRR contribution of one active annual Pro subscription, normalized to a monthly run-rate. */
export function proAnnualMrrUsdCents(): number {
  return Math.round(PRO_ANNUAL_PRICE_USD_CENTS / 12);
}

/**
 * Maps an organization_credit_ledger purchase row's `quantity` to the
 * USD-cents price that purchase was actually charged. The ledger does
 * not independently record which plan a purchase was, but quantity
 * alone unambiguously identifies it: recordOrganizationCreditPurchase
 * only ever writes quantity=1 (single_credit, $50) or quantity=110
 * (credit_pack_110, $5,000) — a known V1 simplification that breaks if
 * a third ambiguous-quantity plan is ever introduced, acceptable since
 * phase10c.md §66 forbids creating new pricing products this phase.
 * Returns 0 for any quantity that doesn't match a known plan (e.g. an
 * admin_adjustment row, which this function is never called for in
 * practice — callers filter to transactionType='purchase' first).
 */
export function orgCreditPurchaseUsdCentsForQuantity(quantity: number): number {
  if (quantity === 1) return ORG_SINGLE_CREDIT_PRICE_USD_CENTS;
  if (quantity === 110) return ORG_CREDIT_PACK_110_PRICE_USD_CENTS;
  return 0;
}
