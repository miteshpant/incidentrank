import "server-only";

/**
 * Phase 8 feature flags. Mirrors dev-unlock.ts's plain-string-comparison
 * style — no validation library, each flag a small predicate function
 * read directly from process.env. Default to false/off (see .env.example)
 * until explicitly enabled; every server mutation these gate must check
 * the flag itself, never rely on UI visibility alone (docs/
 * implementation_plan/phase8_admin_promotional_access_referrals.md §3).
 */

export function isAdminPortalEnabled(): boolean {
  return process.env.ADMIN_PORTAL_ENABLED === "true";
}

export function isPromotionalInvitesEnabled(): boolean {
  return process.env.PROMOTIONAL_INVITES_ENABLED === "true";
}

export function isReferralsEnabled(): boolean {
  return process.env.REFERRALS_ENABLED === "true";
}

export function isTransactionalEmailsEnabled(): boolean {
  return process.env.TRANSACTIONAL_EMAILS_ENABLED === "true";
}

/**
 * Phase 9 feature flags (docs/implementation_plan/phase9.md §3). Kept
 * separate from the Phase 8 flags above — never repurpose
 * DEV_UNLOCK_PAID_SCENARIOS, which is a distinct local-dev-only bypass.
 * Every checkout/webhook route checks these itself, server-side; hiding
 * the pricing UI is never sufficient on its own.
 */

export function isPaymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === "true";
}

export function isStripeCheckoutEnabled(): boolean {
  return process.env.STRIPE_CHECKOUT_ENABLED === "true";
}

export function isStripeWebhooksEnabled(): boolean {
  return process.env.STRIPE_WEBHOOKS_ENABLED === "true";
}

/**
 * Phase 10B feature flags (docs/implementation_plan/phase10b.md §7).
 * Separate from the Phase 9 personal-payments flags above — organization
 * billing has its own gate so one can be enabled without the other.
 * UI hiding is never sufficient on its own: the checkout route, the
 * purchase mutation, and the credit-consumption policy inside the
 * assessment-start route each check the relevant flag themselves.
 * Disabling purchase (isOrgCreditPurchaseEnabled -> false) must never
 * erase existing credits or block resuming an already-started attempt.
 */

export function isOrgBillingEnabled(): boolean {
  return process.env.ORG_BILLING_ENABLED === "true";
}

export function isOrgCreditPurchaseEnabled(): boolean {
  return process.env.ORG_CREDIT_PURCHASE_ENABLED === "true";
}

export function isOrgCreditConsumptionEnabled(): boolean {
  return process.env.ORG_CREDIT_CONSUMPTION_ENABLED === "true";
}

/**
 * Phase 10C flag (docs/implementation_plan/phase10c.md §67). Gates the
 * Engineer Rank recalculation trigger and the profile panel/global
 * leaderboard that read from it — never scoring itself, which is always
 * computed regardless of this flag. When off, persistRankSnapshotIfChanged
 * is a no-op (checked once inside that function, not at every call site),
 * EngineerRankPanel renders nothing, and the admin rebuild route and
 * global leaderboard route both decline.
 */
export function isEngineerRankEnabled(): boolean {
  return process.env.ENGINEER_RANK_ENABLED === "true";
}

/**
 * Phase 10E flag (docs/implementation_plan/phase10e.md §11). Gates
 * whether a NEW checkout receives the configured launch-discount coupon.
 * Default false/off: normal list pricing. Never tie entitlement validity
 * to this flag after purchase — disabling it only stops future discounted
 * checkouts, it never revokes an already-granted entitlement or credit.
 */
export function isLaunchDiscountsEnabled(): boolean {
  return process.env.LAUNCH_DISCOUNTS_ENABLED === "true";
}
