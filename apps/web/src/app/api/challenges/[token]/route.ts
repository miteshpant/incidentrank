import { NextResponse } from "next/server";
import { getChallengeByToken } from "@/lib/server/challenge";
import { recordAnalyticsEvent } from "@/lib/server/analytics";

/**
 * Public (unauthenticated) no-spoiler challenge lookup — see proxy.ts's
 * comment for why this exact path is excluded from the protected-route
 * matcher. getChallengeByToken already enforces the §8 spoiler guard at
 * the data layer (never selects score/tier/actions/reasoning at all), so
 * this route has nothing further to redact.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const landing = await getChallengeByToken(token);
  if (!landing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  void recordAnalyticsEvent({
    eventName: "challenge_link_opened",
    scenarioSlug: landing.scenarioSlug,
    practiceOrAssessment: "practice",
  });

  return NextResponse.json({ challenge: landing });
}
