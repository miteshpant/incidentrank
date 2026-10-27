import "server-only";
import { organizationAuditEvents, type OrganizationAuditEvent } from "@incidentrank/db";
import { db } from "./db";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export type OrganizationActorType = OrganizationAuditEvent["actorType"];

export interface LogOrgAuditEventInput {
  organizationId: string;
  actorUserId?: string | null;
  actorType: OrganizationActorType;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append-only insert into organization_audit_events (docs/
 * implementation_plan/phase10a.md §40/§41). Mirrors admin-audit.ts's
 * logAdminAction exactly, scoped to one organization and carrying
 * actorType so platform-admin-initiated events and org-member-initiated
 * events share one table. Never pass a raw invite token or other secret
 * as metadata — same rule as logAdminAction.
 */
export async function logOrgAuditEvent(
  tx: TxOrDb,
  input: LogOrgAuditEventInput,
): Promise<void> {
  await tx.insert(organizationAuditEvents).values({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorType,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadataJson: input.metadata ?? null,
  });
}
