import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { deleteOwnAccount } from "@/lib/server/account-deletion";

/**
 * Phase 10D §42/§43. userId is always derived server-side from the
 * authenticated session — a user can only ever delete their own
 * account, never another user's.
 */
export async function POST() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await deleteOwnAccount(user.id);

  return NextResponse.json({ ok: true });
}
