import "server-only";
import { isLaunchDiscountsEnabled } from "../feature-flags";
import type { StripePlan } from "./config";

/**
 * Launch-discount coupon lookup (docs/implementation_plan/phase10e.md
 * §9-§10). Mirrors config.ts's getPlanPriceId pattern: the server is the
 * sole authority on which coupon (if any) applies to a plan — the client
 * never sends a coupon/discount parameter, and none is ever read from a
 * request. Returns null (no discount) whenever the flag is off or the
 * configured coupon env var is unset, so every caller gets a null-safe
 * optional discount rather than a thrown error — a missing coupon config
 * must fail safe to "no discount," never block checkout entirely.
 */
export function getLaunchCouponId(plan: StripePlan): string | null {
  if (!isLaunchDiscountsEnabled()) return null;

  switch (plan) {
    case "pro_monthly":
      return process.env.STRIPE_PRO_MONTHLY_LAUNCH_COUPON_ID || null;
    case "pro_annual":
      return process.env.STRIPE_PRO_ANNUAL_LAUNCH_COUPON_ID || null;
    case "founding_lifetime":
      return process.env.STRIPE_FOUNDING_LAUNCH_COUPON_ID || null;
  }
}

/**
 * Organization first-purchase launch coupon — kept separate from
 * getLaunchCouponId exactly as org-credit-config.ts is kept separate
 * from config.ts (structurally different catalog, never reused).
 */
export function getOrgFirstPurchaseLaunchCouponId(): string | null {
  if (!isLaunchDiscountsEnabled()) return null;
  return process.env.STRIPE_ORG_FIRST_PURCHASE_COUPON_ID || null;
}
