import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { recordLegalAcceptance } from "@/lib/server/legal-acceptance";

/**
 * Phase 10D (phasse10d.md §18/§55). userId is always derived server-side
 * from the authenticated session — never accepted from the request body.
 * This route only ever records platform_terms + privacy_policy against
 * the module's own CURRENT_* version constants (legal-versions.ts); it
 * never accepts a client-supplied version string, so there is no
 * "invalid/future version" input to reject here in the first place —
 * the version is not a parameter.
 */
export async function POST() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await recordLegalAcceptance(user.id, "platform_terms");
  await recordLegalAcceptance(user.id, "privacy_policy");

  return NextResponse.json({ ok: true });
}
