import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { adminUsers, type AdminUser, type User } from "@incidentrank/db";
import { db } from "./db";

export type AdminRole = AdminUser["role"];

export type LoadAdminResult =
  | { ok: true; membership: AdminUser }
  | { ok: false; status: 403 };

/**
 * Loads the given user's active admin membership. Every admin route/
 * action must call this (or requireAdminRole below) — never trust a
 * client-supplied admin flag, and never query adminUsers without
 * explicitly filtering revokedAt IS NULL (phase8loc.md Step 2B: "never
 * use an unconstrained lookup that may accidentally authorize against a
 * revoked record" — this function is the one place that filter lives).
 */
export async function loadAdminMembership(user: User): Promise<LoadAdminResult> {
  const membership = await db.query.adminUsers.findFirst({
    where: and(eq(adminUsers.userId, user.id), isNull(adminUsers.revokedAt)),
  });
  if (!membership) return { ok: false, status: 403 };
  return { ok: true, membership };
}

export function isOwnerRole(role: AdminRole): boolean {
  return role === "owner";
}

/**
 * A verified email ending in @incidentrank.com — necessary but never
 * sufficient for admin access on its own (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §1.4/§4.3): an
 * @incidentrank.com email with no adminUsers row is just a normal user.
 */
export function isIncidentRankDomainEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith("@incidentrank.com");
}
