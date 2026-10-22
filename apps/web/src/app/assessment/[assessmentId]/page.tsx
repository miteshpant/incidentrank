import { AssessmentLanding } from "./assessment-landing";

// Candidate-specific, per-request state (own attempt status) — never a
// meaningful static version.
export const instant = false;

export default async function AssessmentLandingPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  return <AssessmentLanding assessmentId={assessmentId} />;
}
