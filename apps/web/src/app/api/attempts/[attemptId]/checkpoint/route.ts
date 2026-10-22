import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { attempts } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOwnedAttempt } from "@/lib/server/load-owned-attempt";

interface CheckpointBody {
  elapsedMs?: unknown;
}

/**
 * Persists the attempt's elapsed-simulation-time checkpoint, used to
 * resume deterministically (packages/simulator's replayAttempt). Called
 * on apply-changes, periodically (10-15s), on visibility change, and
 * never every tick — a lightweight PATCH, not a full state snapshot. A
 * no-op once the attempt is terminal: the checkpoint is superseded by
 * the attempt's final persisted state at that point.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { attemptId } = await params;
  const owned = await loadOwnedAttempt(attemptId, user);
  if (!owned.ok) {
    return NextResponse.json(
      { error: owned.status === 404 ? "Not found" : "Forbidden" },
      { status: owned.status },
    );
  }

  if (owned.attempt.status !== "in_progress") {
    // Terminal attempts are immutable — the checkpoint is moot once a
    // final result exists.
    return NextResponse.json({ attempt: owned.attempt });
  }

  const body = (await request.json().catch(() => null)) as CheckpointBody | null;
  if (typeof body?.elapsedMs !== "number" || body.elapsedMs < 0) {
    return NextResponse.json({ error: "Invalid elapsedMs" }, { status: 400 });
  }

  const [updated] = await db
    .update(attempts)
    .set({ lastSimulationTimeMs: Math.floor(body.elapsedMs) })
    .where(eq(attempts.id, attemptId))
    .returning();

  return NextResponse.json({ attempt: updated });
}
