import { NextResponse } from "next/server";
import { attemptEvents } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOwnedAttempt } from "@/lib/server/load-owned-attempt";

interface EventBody {
  sequence?: unknown;
  elapsedMs?: unknown;
  type?: unknown;
  message?: unknown;
  metadata?: unknown;
}

interface CreateEventsBody {
  events?: unknown;
}

function isValidEvent(value: unknown): value is {
  sequence: number;
  elapsedMs: number;
  type: string;
  message: string;
  metadata: unknown;
} {
  const event = value as EventBody;
  return (
    typeof event.sequence === "number" &&
    typeof event.elapsedMs === "number" &&
    typeof event.type === "string" &&
    typeof event.message === "string"
  );
}

/** Batched engine-event persistence — called around meaningful moments, not every tick. */
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
    | CreateEventsBody
    | null;

  if (!Array.isArray(body?.events) || !body.events.every(isValidEvent)) {
    return NextResponse.json(
      { error: "Invalid events payload" },
      { status: 400 },
    );
  }

  if (body.events.length === 0) {
    return NextResponse.json({ inserted: 0 });
  }

  await db
    .insert(attemptEvents)
    .values(
      body.events.map((event) => ({
        attemptId,
        sequence: event.sequence,
        elapsedMs: event.elapsedMs,
        type: event.type,
        message: event.message,
        metadataJson: event.metadata ?? null,
      })),
    )
    .onConflictDoNothing();

  return NextResponse.json({ inserted: body.events.length });
}
