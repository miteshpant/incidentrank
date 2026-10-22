import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { users } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";

interface UpdateProfileBody {
  displayName?: unknown;
  leaderboardVisible?: unknown;
}

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ user });
}

export async function PATCH(request: Request) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | UpdateProfileBody
    | null;

  const updates: Partial<typeof users.$inferInsert> = {};

  if (body?.displayName !== undefined) {
    if (
      typeof body.displayName !== "string" ||
      body.displayName.trim().length === 0 ||
      body.displayName.length > 100
    ) {
      return NextResponse.json(
        { error: "displayName must be a non-empty string up to 100 characters" },
        { status: 400 },
      );
    }
    updates.displayName = body.displayName.trim();
  }

  if (body?.leaderboardVisible !== undefined) {
    if (typeof body.leaderboardVisible !== "boolean") {
      return NextResponse.json(
        { error: "leaderboardVisible must be a boolean" },
        { status: 400 },
      );
    }
    updates.leaderboardVisible = body.leaderboardVisible;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ user });
  }

  const [updated] = await db
    .update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();

  return NextResponse.json({ user: updated });
}
