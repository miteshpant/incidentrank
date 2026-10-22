import { NextResponse } from "next/server";
import { attemptActionChanges, attemptActionGroups } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOwnedAttempt } from "@/lib/server/load-owned-attempt";

interface ActionGroupChangeBody {
  controlKey?: unknown;
  previousValue?: unknown;
  newValue?: unknown;
}

interface CreateActionGroupBody {
  sequence?: unknown;
  elapsedMs?: unknown;
  reasoning?: unknown;
  changes?: unknown;
}

function isValidChange(value: unknown): value is {
  controlKey: string;
  previousValue: unknown;
  newValue: unknown;
} {
  const change = value as ActionGroupChangeBody;
  return (
    typeof change.controlKey === "string" &&
    "previousValue" in change &&
    "newValue" in change
  );
}

export async function POST(
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

  const body = (await request.json().catch(() => null)) as
    | CreateActionGroupBody
    | null;

  if (
    typeof body?.sequence !== "number" ||
    typeof body?.elapsedMs !== "number" ||
    !Array.isArray(body.changes) ||
    body.changes.length === 0 ||
    !body.changes.every(isValidChange)
  ) {
    return NextResponse.json(
      { error: "Invalid action group payload" },
      { status: 400 },
    );
  }

  const reasoning =
    typeof body.reasoning === "string" && body.reasoning.trim().length > 0
      ? body.reasoning
      : null;

  const [group] = await db
    .insert(attemptActionGroups)
    .values({
      attemptId,
      sequence: body.sequence,
      elapsedMs: body.elapsedMs,
      reasoning,
    })
    .returning();

  if (!group) {
    return NextResponse.json(
      { error: "Failed to persist action group" },
      { status: 500 },
    );
  }

  await db.insert(attemptActionChanges).values(
    body.changes.map((change, index) => ({
      actionGroupId: group.id,
      sequence: index,
      controlKey: change.controlKey,
      previousValueJson: change.previousValue,
      newValueJson: change.newValue,
    })),
  );

  return NextResponse.json({ actionGroup: group });
}
