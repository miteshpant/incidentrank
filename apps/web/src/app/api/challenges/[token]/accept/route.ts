import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { acceptChallenge } from "@/lib/server/challenge";
import { recordAnalyticsEvent } from "@/lib/server/analytics";

/**
 * Signed-in only (proxy.ts protects this exact path shape). Records
 * which user accepted and returns the scenario slug to send the client
 * into the normal /incidents/[slug] practice flow — never a parallel
 * simulator (§4).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;
  const result = await acceptChallenge(token, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  void recordAnalyticsEvent({
    eventName: "challenge_accepted",
    userId: user.id,
    scenarioSlug: result.scenarioSlug,
    practiceOrAssessment: "practice",
  });

  return NextResponse.json({ scenarioSlug: result.scenarioSlug });
}
