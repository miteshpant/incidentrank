import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { challenges } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { hashChallengeToken } from "@/lib/server/challenge-token";
import { getChallengeComparison } from "@/lib/server/challenge";

/**
 * Signed-in only (proxy.ts protects this exact path shape).
 * getChallengeComparison enforces the §8/§16 spoiler guard itself — only
 * a participant may see it, and only once both attempts are terminal —
 * this route exists purely to resolve the opaque token to the
 * challenge's internal id and pass through the caller's own user id,
 * never trusted from the request body/query.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;
  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.tokenHash, hashChallengeToken(token)),
    columns: { id: true },
  });
  if (!challenge) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await getChallengeComparison(challenge.id, user.id);
  if (!result.ok) {
    const status = result.reason === "forbidden" ? 403 : result.reason === "not_ready" ? 409 : 404;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json(result);
}
