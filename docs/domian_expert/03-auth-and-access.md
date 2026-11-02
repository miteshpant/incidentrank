# Authentication, Authorization &amp; Practice Access Control

## Clerk integration — `apps/web/src/proxy.ts` (Next 16's middleware equivalent)

This file's own comments explain real architectural decisions — read them in
full before assuming a route should or shouldn't be protected. Full matcher,
verbatim:

```ts
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
  if (isProtectedRoute(req)) await auth.protect();
});
```

**Deliberately NOT protected** (and why):
- `/incidents/*` — free scenarios remain playable signed-out.
- `/api/attempts/score-preview`, `/api/attempts/finish-preview` — stateless
  scoring endpoints for anonymous practice, pure functions of
  `(scenarioSlug, client-supplied inputs)` with no persisted attempt row and
  no `auth()` call of their own. A blanket `/api/attempts(.*)` pattern would
  swallow them — Clerk's route matcher treats `:attemptId` as matching any
  single path segment, *including* the literal strings `score-preview`/
  `finish-preview`. That's why attemptId-scoped routes use a **regex
  constrained to the real UUID shape** instead — those two literal route
  names can never satisfy it.
- `/assessment/invite/[token]` — a signed-out candidate must be able to
  preview the invitation (org/assessment name) before signing in. Accepting
  and starting still require auth, enforced by the API routes themselves.
- `/challenge/[token]` + bare `GET /api/challenges/[token]` — same reasoning:
  a signed-out visitor who opens a challenge link must see the no-spoiler
  landing before deciding to sign in. Only the exact-GET shape is excluded —
  `POST /api/challenges/:token/accept` and `GET .../comparison` are distinct
  path shapes and remain protected.

## `getOrCreateCurrentUser()` — the one identity bridge

`apps/web/src/lib/server/current-user.ts`. The single place a Clerk identity
resolves to a local `users` row, joined on `users.authProviderId`. Account
deletion (`account-deletion.ts`) scrambles this column to
`anonymized_deleted-<userId>` — that's the actual deletion mechanism: a fresh
`getOrCreateCurrentUser()` call for that Clerk identity can never find the old
row again, it creates a brand-new one.

## "User vs Candidate" — no separate account type

From `docs/architecture.md`, Principle 5, quoted in full:

> A "candidate" is a relationship/context, not a distinct account type. A
> single IncidentRank user may practice incidents independently, be a
> candidate for Company A, and simultaneously be a candidate for Company B.
> The architecture must not create separate candidate user accounts or force
> a user to pick "candidate" vs. "practice" identities.

Enforced structurally: `assessmentCandidates` is a pure association row
(`userId` nullable until claimed + `assessmentId` + invitation state) layered
on top of `users` — never a second account table.

## Admin portal auth

`apps/web/src/lib/server/admin-auth.ts` — full file:

```ts
export async function loadAdminMembership(user: User): Promise<LoadAdminResult> {
  const membership = await db.query.adminUsers.findFirst({
    where: and(eq(adminUsers.userId, user.id), isNull(adminUsers.revokedAt)),
  });
  if (!membership) return { ok: false, status: 403 };
  return { ok: true, membership };
}

export function requirePlatformOwner(result: LoadAdminResult): RequirePlatformOwnerResult {
  if (!result.ok) return { ok: false, status: 403 };
  if (!isOwnerRole(result.membership.role)) return { ok: false, status: 403 };
  return { ok: true, membership: result.membership };
}
```
Doc comment: "never trust a client-supplied admin flag, and never query
`adminUsers` without explicitly filtering `revokedAt IS NULL` — this
function is the one place that filter lives." Only the platform owner may
create or invite another platform admin — `requirePlatformOwner` exists so a
plain admin can never self-escalate the roster.

`admin-bootstrap.ts`'s `bootstrapOwnerIfEligible(user, verifiedEmail)`:
matches `verifiedEmail` against `INITIAL_ADMIN_EMAIL` env var (default
`mpant@incidentrank.com`, exact string match, no plus-address normalization
— override the env var per-environment instead of adding special-case logic
to production code), then races an `onConflictDoNothing` insert targeting
the exact partial-unique-index predicate (`role = 'owner'`). Bootstrap is
permanently closed the moment any owner row exists, even if later revoked.

### The `admin/layout.tsx` info-disclosure fix — a pattern to remember

This file's current doc comment captures a real lesson:

> This layout decides whether to render the nav itself. The nav lists every
> admin section by name (Stripe Subscriptions, Webhook Events, Founding
> Allocations, ...) and previously rendered unconditionally for any visitor,
> signed in or not, before any per-page gate ran — leaking the admin
> surface's structure to the public even though no actual data was ever
> exposed (each page's own gate still correctly blocked that).

**The general lesson**: UI chrome that reveals internal structure (section
names, nav items, feature lists) is its own disclosure surface, independent
of whether the underlying data access is correctly gated. When adding a new
admin section (or any gated nav), check whether the *shell* renders before
the auth check, not just whether the *data* is protected. The fix here was
deliberately presence-only (never `notFound()`/`redirect()` at the layout
level) so the legitimate public `/admin/invite/[token]` flow still renders
its children for a signed-out recipient — only the nav chrome is
conditionally hidden.

## Organization-level auth

`loadOrganizationMembership` gates by org slug (404 if the org doesn't
exist, 403 if not a member). For assessments specifically, `loadOrgAssessment`
/`loadOrgCandidate` (`assessment-access.ts`) additionally verify the
assessment belongs to that exact organization and the candidate row belongs
to that exact assessment before ever touching an `attemptId`. For org-owned
scenarios, `loadOrgScenario()` (`scenario-access.ts`) verifies both
membership and that the scenario's `organizationId` matches.

Role policy lives centrally in `organization-auth.ts`
(`canInviteMembers`/`canManageMember`/`canChangeRole`) — never scattered
inline through routes. Role matrix:

| Role | Can do |
|---|---|
| `owner` | Everything, including change roles (promote/demote, including other owners) |
| `admin` | Manage assessments/scenarios, invite admin/member, remove non-admin/non-owner members — cannot change roles |
| `member` | View only |

**Last-owner invariant**: `changeMemberRole`/`removeMember` unconditionally
reject (`"last_owner"`) any mutation that would leave zero owners, including
an owner acting on themselves.

## Practice access control — paid vs. free scenarios

`apps/web/src/lib/practice-access.ts` — `evaluatePracticeAccess()`, full
function, exact precedence order top-to-bottom:

```ts
export function evaluatePracticeAccess(
  scenario: { isFree: boolean; id?: string },
  opts?: {
    devUnlockPaid?: boolean;
    paidEntitlementState?: "founding_lifetime" | "pro" | null;
    incidentPassState?: "available" | "bound_here" | "bound_elsewhere" | null;
    incidentPassBoundScenarioId?: string;
  },
): PracticeAccessResult {
  if (scenario.isFree) return { allowed: true, mode: "free" };

  if (opts?.paidEntitlementState === "founding_lifetime")
    return { allowed: true, mode: "paid_entitlement", entitlement: "founding_lifetime" };
  if (opts?.paidEntitlementState === "pro")
    return { allowed: true, mode: "paid_entitlement", entitlement: "pro" };

  if (opts?.devUnlockPaid) return { allowed: true, mode: "dev_unlocked" };

  if (opts?.incidentPassState === "bound_here")
    return { allowed: true, mode: "incident_pass_bound_here" };
  if (opts?.incidentPassState === "available")
    return { allowed: false, reason: "incident_pass_available", passState: "available" };
  if (opts?.incidentPassState === "bound_elsewhere")
    return { allowed: false, reason: "incident_pass_bound_elsewhere", boundScenarioId: opts.incidentPassBoundScenarioId };

  return { allowed: false, reason: "paid_scenario_locked" };
}
```

**Precedence**: free (1) → Founding entitlement (2) → Pro entitlement (3) →
dev-unlock (4, triple-gated: env flag + `NODE_ENV !== "production"` +
localhost Host header) → pass bound here (5, allowed but not yet consumed —
consumption happens atomically at attempt-start) → pass available-but-unbound
(6, locked, "show the bind affordance") → pass bound to a different scenario
(7, locked) → nothing applies (8, `paid_scenario_locked`).

This is a pure, isomorphic function — no DB/env access inside it. Every
`opts` field is computed independently by each call site, never trusted from
a client. Call sites, each independently re-deriving `isFree`/entitlement/pass
state server-side: the practice page (`/incidents/[slug]`), `POST
/api/attempts`, `POST /api/attempts/score-preview`, `POST
/api/attempts/finish-preview`.

**The Weekly Challenge free-access bypass is folded into `isFree` resolution
at each call site, not a new branch inside `evaluatePracticeAccess` itself.**
Each call site computes an effective `isFree = scenario.isFree ||
isCurrentWeeklyChallenge(scenario.id)` before calling the function — confirmed
by the function's own source having zero Weekly-Challenge-specific code.
This is the right pattern to copy for any future "make X free under
condition Y" feature: extend what feeds `isFree`, don't add a new precedence
branch.

### Incident Passes and Paid Entitlements — the two unlock mechanisms besides free

- `apps/web/src/lib/server/incident-passes.ts` — pass lifecycle:
  `available → bound → consumed`, never reassignable to a different scenario
  once bound.
- `apps/web/src/lib/server/stripe/entitlements.ts` —
  `evaluatePaidPracticeEntitlement(userId)` queries `paidEntitlements` for
  active rows; Founding takes precedence over Pro if a user somehow holds
  both. `hasActivePaidEntitlement(userId, entitlementType)` is for
  checkout-eligibility, a different question than practice access.
