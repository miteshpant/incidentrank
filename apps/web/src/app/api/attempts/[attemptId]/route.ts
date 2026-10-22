import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { attempts } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOwnedAttempt } from "@/lib/server/load-owned-attempt";

export async function GET(
  _request: Request,
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

  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
    with: {
      scenario: true,
      actionGroups: {
        orderBy: (table, { asc }) => [asc(table.sequence)],
        with: {
          changes: {
            orderBy: (table, { asc }) => [asc(table.sequence)],
          },
        },
      },
      events: {
        orderBy: (table, { asc }) => [asc(table.sequence)],
      },
    },
  });

  return NextResponse.json({ attempt });
}
