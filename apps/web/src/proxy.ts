import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// /incidents/payment-retry-storm itself is intentionally NOT protected —
// free scenarios remain playable signed-out. Persistence (attempts API)
// requires auth; anonymous play simply never calls it, per the free-tier
// product principle. Attempt history and profile are always auth-only.
//
// /assessment/invite/[token] is intentionally NOT protected — a signed-out
// candidate must be able to preview the invitation (org/assessment name)
// before signing in, per Phase 4's invitation flow. Accepting the
// invitation and starting the assessment still require auth, enforced by
// the API routes themselves.
const isProtectedRoute = createRouteMatcher([
  "/attempts(.*)",
  "/profile(.*)",
  "/organizations(.*)",
  "/assessment/:assessmentId",
  "/api/attempts(.*)",
  "/api/profile(.*)",
  "/api/organizations(.*)",
  "/api/assessment/:assessmentId",
  "/api/assessment/:assessmentId/start",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
