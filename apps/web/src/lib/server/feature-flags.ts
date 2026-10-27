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
