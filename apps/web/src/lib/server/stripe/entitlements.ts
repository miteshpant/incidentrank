import "server-only";
import { and, eq } from "drizzle-orm";
import { paidEntitlements } from "@incidentrank/db";
import { db } from "../db";

export type PaidEntitlementState = "founding_lifetime" | "pro" | null;

/**
 * The single function the rest of the application calls to ask "does
 * this user have Pro or Founding access right now" (docs/
 * implementation_plan/phase9.md §19). Reads only paidEntitlements —
 * never Stripe directly, never stripeSubscriptions directly — since
 * paidEntitlements is the already-synchronized, policy-derived table
 * (see webhook-handlers.ts). Mirrors getScenarioPassAccess's shape so
 * call sites add a parallel lookup, not a nested one.
 *
 * Founding takes precedence in the return value when a user somehow
 * holds both (should be rare — Founding checkout is blocked for
 * existing Founding holders, but a user could hold an active Pro
 * subscription and also later become Founding): Founding is the
 * broader, permanent grant.
 */
export async function evaluatePaidPracticeEntitlement(
  userId: string,
): Promise<PaidEntitlementState> {
  const rows = await db.query.paidEntitlements.findMany({
    where: and(eq(paidEntitlements.userId, userId), eq(paidEntitlements.status, "active")),
  });

  if (rows.some((r) => r.entitlementType === "founding_lifetime")) {
    return "founding_lifetime";
  }

  const pro = rows.find((r) => r.entitlementType === "pro");
  if (!pro) return null;

  // "active" status alone is not sufficient for Pro: a canceled
  // subscription that is still within its paid period is also
  // "active" per this table's own policy (the webhook handler sets
  // status='active' with cancelAtPeriodEnd tracked on stripeSubscriptions
  // and only flips status to 'canceled'/'inactive' once the period
  // genuinely ends), so no extra currentPeriodEnd check is needed here —
  // see webhook-handlers.ts's subscription-sync logic for where that
  // policy decision is actually made.
  return "pro";
}

/** Whether a user currently holds ANY active paid entitlement (used for checkout-eligibility checks, not for practice access). */
export async function hasActivePaidEntitlement(
  userId: string,
  entitlementType: "pro" | "founding_lifetime",
): Promise<boolean> {
  const row = await db.query.paidEntitlements.findFirst({
    where: and(
      eq(paidEntitlements.userId, userId),
      eq(paidEntitlements.entitlementType, entitlementType),
      eq(paidEntitlements.status, "active"),
    ),
  });
  return !!row;
}
