import "server-only";
import { adminAuditEvents } from "@incidentrank/db";
import { db } from "./db";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export interface LogAdminActionInput {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append-only insert into admin_audit_events. Never pass a raw invite
 * token, referral code, or any other secret as part of `metadata` — see
 * docs/implementation_plan/phase8_admin_promotional_access_referrals.md
 * §25 / phase8loc.md Step 16 ("Do not log raw invite tokens, raw
 * referral codes, secrets"). Every admin mutation route calls this after
 * (or as part of the same transaction as) the mutation itself.
 */
export async function logAdminAction(
  tx: TxOrDb,
  input: LogAdminActionInput,
): Promise<void> {
  await tx.insert(adminAuditEvents).values({
    adminUserId: input.adminUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadataJson: input.metadata ?? null,
  });
}
