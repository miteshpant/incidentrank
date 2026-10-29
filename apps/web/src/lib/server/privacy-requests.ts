import "server-only";
import { desc, eq } from "drizzle-orm";
import { privacyRequests, type PrivacyRequest } from "@incidentrank/db";
import { db } from "./db";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export type PrivacyRequestType = "access" | "correction" | "deletion" | "other";
export type PrivacyRequestStatus = "pending" | "completed";

/**
 * Phase 10D §44. notes is kept minimal by design — never assessment
 * reasoning, candidate reports, or other sensitive content; callers
 * should pass only a short user-supplied description, if any.
 */
export async function createPrivacyRequest(
  userId: string,
  requestType: PrivacyRequestType,
  opts: { notes?: string; status?: PrivacyRequestStatus; tx?: TxOrDb } = {},
): Promise<PrivacyRequest> {
  const conn = opts.tx ?? db;
  const status = opts.status ?? "pending";

  const [created] = await conn
    .insert(privacyRequests)
    .values({
      userId,
      requestType,
      status,
      notes: opts.notes ?? null,
      completedAt: status === "completed" ? new Date() : null,
    })
    .returning();

  if (!created) throw new Error("Failed to create privacy request");
  return created;
}

export async function listPrivacyRequestsForUser(userId: string, tx: TxOrDb = db): Promise<PrivacyRequest[]> {
  return tx.query.privacyRequests.findMany({
    where: eq(privacyRequests.userId, userId),
    orderBy: [desc(privacyRequests.requestedAt)],
  });
}

/** Admin-facing listing — newest first, across all users. */
export async function listAllPrivacyRequests(
  opts: { status?: PrivacyRequestStatus } = {},
  tx: TxOrDb = db,
): Promise<PrivacyRequest[]> {
  return tx.query.privacyRequests.findMany({
    where: opts.status ? eq(privacyRequests.status, opts.status) : undefined,
    orderBy: [desc(privacyRequests.requestedAt)],
    with: { user: true },
  });
}

export async function updatePrivacyRequestStatus(
  requestId: string,
  status: PrivacyRequestStatus,
  tx: TxOrDb = db,
): Promise<PrivacyRequest> {
  const [updated] = await tx
    .update(privacyRequests)
    .set({ status, completedAt: status === "completed" ? new Date() : null })
    .where(eq(privacyRequests.id, requestId))
    .returning();

  if (!updated) throw new Error("Privacy request not found");
  return updated;
}
