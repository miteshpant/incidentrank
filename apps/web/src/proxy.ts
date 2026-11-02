import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// /incidents/payment-retry-storm itself is intentionally NOT protected —
// free scenarios remain playable signed-out. Persistence (attempts API)
// requires auth for any route scoped to a real, DB-persisted attempt;
// anonymous play never calls those. Attempt history and profile are
// always auth-only.
//
// /api/attempts/score-preview and /api/attempts/finish-preview are
// intentionally NOT protected — Phase 6.1's stateless scoring endpoints
// for anonymous practice, pure functions of (scenarioSlug, client-
// supplied inputs) with no DB-persisted attempt row and no auth() call
// of their own. A blanket "/api/attempts(.*)" pattern would swallow
// them, and even a "/api/attempts/:attemptId" glob would too (Clerk's
// route matcher treats :attemptId as matching any single path segment,
// including the literal strings "score-preview"/"finish-preview") — so
// attemptId-scoped routes are matched by a regex constrained to the
// real attempt id's shape (a Postgres uuid, see packages/db/src/schema.ts),
// which those two literal route names can never satisfy. The bare
// create-attempt POST route is listed by its own exact path.
//
// /assessment/invite/[token] is intentionally NOT protected — a signed-out
// candidate must be able to preview the invitation (org/assessment name)
// before signing in, per Phase 4's invitation flow. Accepting the
// invitation and starting the assessment still require auth, enforced by
// the API routes themselves.
//
// /challenge/[token] and GET /api/challenges/[token] are intentionally
// NOT protected — a signed-out visitor who opens a challenge link must be
// able to see the no-spoiler landing (challenger name, scenario) before
// deciding to sign in, same reasoning as the assessment invite above.
// Creating a challenge, accepting one, and viewing its comparison all
// still require auth, enforced by those routes' own gates — only the
// exact-GET "/api/challenges/:token" shape is excluded, so POST
// /api/challenges/:token/accept and GET .../comparison (distinct path
// shapes) still fall through to the general "/api/challenges(.*)" match
// below.
const UUID_SEGMENT = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const isProtectedRoute = createRouteMatcher([
  "/attempts(.*)",
  "/profile(.*)",
  "/organizations(.*)",
  "/assessment/:assessmentId",
  "/api/attempts",
  new RegExp(`^/api/attempts/${UUID_SEGMENT}(/.*)?$`),
  "/api/profile(.*)",
  "/api/organizations(.*)",
  "/api/assessment/:assessmentId",
  "/api/assessment/:assessmentId/start",
  "/api/challenges",
  "/api/challenges/:token/accept",
  "/api/challenges/:token/comparison",
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
