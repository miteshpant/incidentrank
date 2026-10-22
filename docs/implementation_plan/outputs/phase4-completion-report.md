# Phase 4 Completion Report — Companies and Candidate Assessments

Status: **Complete.** Per the spec's instruction, Phase 5 was not started.

## 1. Files created or modified

### Database schema
- `packages/db/src/schema.ts` — added `organizations`, `organizationMembers`, `assessments`, `assessmentCandidates` tables, three new enums (`organizationRoleEnum`, `assessmentStatusEnum`, `assessmentCandidateStatusEnum`), and a proper FK + index on the previously-bare `attempts.assessmentId` column.
- `packages/db/src/relations.ts` — new relations for all four tables plus `attempts.assessment`.
- `packages/db/src/types.ts` — `Organization`/`NewOrganization`, `OrganizationMember`/`NewOrganizationMember`, `Assessment`/`NewAssessment`, `AssessmentCandidate`/`NewAssessmentCandidate`.
- `packages/db/drizzle/0001_sticky_butterfly.sql` — generated migration, applied to local Postgres.

### Server-side data/auth layer (`apps/web/src/lib/server/`)
- `organization-auth.ts` — `loadOrganizationMembership`, `canMutate`, `isOwner`.
- `organizations-for-user.ts` — `listOrganizationsForUser` (for `/organizations` and the nav-link visibility check).
- `assessment-access.ts` — `loadOrgAssessment`, `loadOrgCandidate` (the privacy-boundary chain).
- `invite-access.ts` — `loadInviteByToken` (hash-based lookup).
- `invite-token.ts` — `generateInviteToken`, `hashInviteToken`, `normalizeEmail`.
- `slug.ts` — `slugify`, `randomSlugSuffix`.
- `scenario-registry.ts` — extended with `getActiveScenarioById`, `listAssessableScenarios`.

### API routes (new)
- `POST/GET /api/organizations`
- `POST/GET /api/organizations/[slug]/assessments`
- `GET/PATCH /api/organizations/[slug]/assessments/[assessmentId]`
- `POST/GET /api/organizations/[slug]/assessments/[assessmentId]/candidates`
- `GET /api/organizations/[slug]/assessments/[assessmentId]/candidates/[candidateId]`
- `GET /api/assessment/[assessmentId]` (candidate-facing preview/state)
- `POST /api/assessment/[assessmentId]/start`
- `GET/POST /api/assessment/invite/[token]`

### API routes (modified)
- `apps/web/src/app/api/attempts/[attemptId]/complete/route.ts` — on completion, if the attempt is `attemptType = "assessment"`, also flips the linked `assessment_candidates` row to `completed`.

### Client/UI (new)
- `apps/web/src/app/organizations/` — `page.tsx` + `organizations-list.tsx`, `new/page.tsx` + `new-organization-form.tsx`.
- `apps/web/src/app/organizations/[slug]/` — `page.tsx` + `org-dashboard.tsx`.
- `apps/web/src/app/organizations/[slug]/assessments/new/` — `page.tsx` + `new-assessment-form.tsx`.
- `apps/web/src/app/organizations/[slug]/assessments/[assessmentId]/` — `page.tsx` + `assessment-detail.tsx` + `invite-candidate-form.tsx` + `assessment-status-controls.tsx` + `candidate-row.tsx`.
- `apps/web/src/app/organizations/[slug]/assessments/[assessmentId]/candidates/[candidateId]/` — `page.tsx` + `candidate-result.tsx`.
- `apps/web/src/app/assessment/invite/[token]/` — `page.tsx` + `invite-acceptance.tsx`.
- `apps/web/src/app/assessment/[assessmentId]/` — `page.tsx` + `assessment-landing.tsx` + `assessment-console.tsx` + `assessment-result-screen.tsx` + `already-completed.tsx`.

### Client/UI (modified)
- `apps/web/src/lib/use-incident-attempt.ts` — added optional `initialAttemptId` param so the hook can adopt a pre-created assessment attempt instead of creating a practice-mode one.
- `apps/web/src/lib/attempt-persistence.ts` — added `startAssessmentAttempt`.
- `apps/web/src/components/site-header.tsx` — added conditional "Organizations" nav link (only when the signed-in user belongs to ≥1 organization).
- `apps/web/src/proxy.ts` — extended the protected-route matcher for `/organizations`, `/assessment/[assessmentId]`, and their API routes.

### Documentation
- `docs/architecture.md` — added "Phase 3 scope" (previously undocumented) and "Phase 4 scope" sections, including the explicit privacy-boundary statement and invite-token security tradeoff.

### Tests (new)
- `apps/web/src/lib/server/organization-auth.test.ts`
- `apps/web/src/lib/server/assessment-access.test.ts`
- `apps/web/src/lib/server/invite-access.test.ts`
- `apps/web/src/lib/server/invite-acceptance.test.ts`
- `apps/web/src/lib/server/assessment-attempt-lifecycle.test.ts`

## 2. DB schema changes

Four new tables (`organizations`, `organization_members`, `assessments`, `assessment_candidates`), three new enums, and a proper foreign key + index added to the previously-unconstrained `attempts.assessment_id` column. All migrations applied via `pnpm db:migrate`. Key constraints:

- `organizations.slug` unique
- `organization_members` unique `(organizationId, userId)`
- `assessment_candidates` unique `(assessmentId, normalizedEmail)` and unique `inviteTokenHash`
- `assessments.scenarioId` restrict-delete, `createdByUserId` restrict-delete
- `assessment_candidates.userId` set-null on user delete, `attemptId` set-null on attempt delete
- `attempts.assessmentId` restrict-delete, referencing `assessments.id`

## 3. Organization model

```ts
Organization { id, name, slug (unique), createdAt, updatedAt }
```

Simple naming only — no logos, billing, departments, or enterprise settings, per the spec. Slugs auto-derived from name with collision-resistant random suffixing (`slugify` + `randomSlugSuffix`, retried up to 5 times).

## 4. Organization roles

```ts
OrganizationMember { id, organizationId, userId, role: "owner" | "admin" | "member", createdAt }
```

- `owner`/`admin` → create assessment, invite candidate, close assessment (`canMutate`)
- `owner` → reserved for future organization-level settings (`isOwner`, not yet used by any mutation in Phase 4)
- `member` → view-only

Authorization is checked server-side on every mutation; the UI additionally hides mutation controls for non-mutating roles, but the server check is authoritative (verified by `organization-auth.test.ts`'s role-authorization test, which calls the auth function directly rather than relying on hidden buttons).

## 5. Assessment model

```ts
Assessment {
  id, organizationId, name, scenarioId, scenarioVersion,
  status: "draft" | "active" | "closed",
  createdByUserId, createdAt, updatedAt
}
```

`scenarioVersion` is recorded at creation time from the currently-active scenario row, so later scenario changes never alter an already-created assessment. One assessment = one scenario, per Phase 4 scope (no multi-incident assessments).

Status transitions: `draft` → candidates cannot start; `active` → invitation links work, candidates may start; `closed` → existing completed results remain visible, new starts are blocked. Enforced both in the start API (`assessment.status !== "active"` → 403) and the candidate landing page (non-active assessments show "not currently accepting new attempts").

## 6. Candidate invitation model

```ts
AssessmentCandidate {
  id, assessmentId, email, normalizedEmail, userId (nullable),
  status: "invited" | "started" | "completed",
  inviteTokenHash, invitedAt, startedAt, completedAt,
  attemptId (nullable)
}
```

Unique `(assessmentId, normalizedEmail)` prevents duplicate invitations to the same email for the same assessment (returns `409` cleanly on retry, verified by `invite-access.test.ts`).

## 7. Invite-token implementation

`randomBytes(32).toString("base64url")` — a cryptographically secure, opaque token with no embedded/encoded data. Only `sha256(token)` is persisted (`inviteTokenHash`, unique-indexed); the plaintext is returned to the inviter exactly once in the creation response and is never stored or retrievable again. **Documented tradeoff**: no token rotation or expiry in this POC — a leaked link is valid until the assessment is closed. This is explicitly called out in `docs/architecture.md`.

## 8. Invitation acceptance flow

`/assessment/invite/[token]`:
1. **Signed out** → preview shows "You've been invited to complete an IncidentRank assessment for `<Org>`" + assessment name + "Sign in / Create Account" (works without auth via `GET /api/assessment/invite/[token]`, which exposes only org name, assessment name/status, and the candidate's own invited-status — never other candidates' data).
2. **Sign in/up** → returns to the same invite page.
3. **Accept** (`POST /api/assessment/invite/[token]`) → verifies the signed-in user's Clerk verified primary email matches the invitation's `normalizedEmail` (case-insensitive); on match, sets `assessment_candidates.userId`. An already-claimed invitation returns `409` for any other user (single-ownership, verified by `invite-acceptance.test.ts`).

## 9. Assessment attempt lifecycle

`POST /api/assessment/[assessmentId]/start`:
1. Verifies the signed-in user is the claimed owner of an `assessment_candidates` row for this assessment (candidate-identity authorization, not organization membership).
2. If `candidate.attemptId` is already set, returns the existing attempt — **no second attempt is ever created** (one official attempt, verified by `assessment-attempt-lifecycle.test.ts`).
3. Otherwise, verifies `assessment.status === "active"`, then inserts a normal `attempts` row with `attemptType = "assessment"`, `assessmentId` set, and links it to the candidate row (`status: "started"`).

The candidate console (`AssessmentConsole`) reuses `useIncidentAttempt` with a new `initialAttemptId` parameter that makes the hook adopt the pre-created attempt instead of creating a practice-mode one via `POST /api/attempts` — the same persistence functions (action groups, events, completion), the same simulation engine, and the same scoring package as practice mode handle everything downstream. On completion, `/api/attempts/[attemptId]/complete` (unmodified core logic, one small addition) also flips the linked candidate row to `completed`.

**Refresh/resume limitation** (documented per spec instruction, not implemented beyond this): if a candidate refreshes mid-assessment, the live in-browser simulation state is lost — consistent with Phase 3's existing practice-mode limitation. The assessment landing page re-fetches attempt status on load; if the attempt is still `in_progress`, it will currently re-mount a fresh `useIncidentAttempt` instance tied to the same `attemptId` without replaying prior actions into the engine state. Full resume/reconnect was explicitly out of scope for Phase 4.

## 10. Authorization rules

Every organization-scoped route verifies, server-side, via `loadOrganizationMembership`:
```text
current user is organization member → else 404 (unknown org) or 403 (not a member)
```
Mutations additionally require `canMutate(role)` (owner/admin only). Candidate-facing routes (invite accept, assessment start) use identity-based checks instead — the signed-in user must be the exact claimed `userId` on the candidate row. No route trusts a client-supplied organization/assessment/candidate id without re-verifying ownership server-side; there are no hidden-button-only protections.

## 11. Privacy boundaries

> **Company access is scoped to assessment-linked attempts only.**

`loadOrgCandidate` is the only path from an organization member to a candidate's attempt. It chains: organization membership → assessment belongs to that organization → candidate row belongs to that assessment → (only then) `candidate.attemptId`. This structurally cannot reach a candidate's private practice attempts (never linked to any assessment), attempts under a different organization's assessments, or another organization's data at all. Verified directly in `assessment-access.test.ts`'s "company cannot access a candidate's practice attempt" test and live in Manual Flow E below.

## 12. Routes added

- `/organizations` — list organizations the signed-in user belongs to.
- `/organizations/new` — create an organization (creator becomes owner).
- `/organizations/[slug]` — dashboard: name, member count, assessments list, "Create Assessment" CTA.
- `/organizations/[slug]/assessments/new` — create an assessment (name + scenario picker).
- `/organizations/[slug]/assessments/[assessmentId]` — assessment detail: status, activate/close controls, invite form, candidates table (sorted completed-first, score desc, recovery time asc, revenue loss asc).
- `/organizations/[slug]/assessments/[assessmentId]/candidates/[candidateId]` — candidate result detail, interviewer timeline.
- `/assessment/invite/[token]` — invitation preview/accept (public preview, auth-gated accept).
- `/assessment/[assessmentId]` — candidate assessment landing/live console/result.

## 13. Candidate result flow

After completing an assessment attempt, the candidate sees "Assessment Complete", the full IncidentRank score breakdown, recovery time, and revenue impact — and the explicit disclosure: *"This result, your actions, your reasoning, and the incident timeline have been shared with the organization that invited you."* No "Try Again" button, no company leaderboard, no visibility into other candidates. Only a "Back to IncidentRank" CTA. Revisiting an already-completed assessment shows a dedicated `AlreadyCompleted` screen rather than re-running the simulator.

## 14. Company result/review flow

The assessment detail page's candidates table shows `Candidate | Status | Score | Outcome`, sorted completed-first/score-desc/recovery-asc/revenue-asc (an assessment results table, explicitly not a gamified leaderboard, per the spec). Completed rows link to the candidate result detail page, which mirrors the practice `/attempts/[attemptId]` detail page's structure (score breakdown, stats, merged interviewer timeline of system events and candidate decision groups with reasoning) but in hiring context, reusing the same formatting helpers (`formatElapsed`, `formatUsd`, `CONTROL_LABELS`) as the practice attempt detail page.

## 15. Tests added

| File | Tests |
|---|---|
| `organization-auth.test.ts` | 5 (creator-becomes-owner, non-member-403, unknown-slug-404, member-cannot-mutate, canMutate matrix) |
| `assessment-access.test.ts` | 4 (scenario id/version recorded, member can view own org's candidate, other org denied, practice attempt not reachable via company routes) |
| `invite-access.test.ts` | 4 (invite creation stores hash not plaintext, duplicate invitation rejected by DB constraint, invalid token fails safely, lookup resolves correct assessment/org) |
| `invite-acceptance.test.ts` | 2 (authenticated matching user can claim, already-claimed invitation cannot be reclaimed) |
| `assessment-attempt-lifecycle.test.ts` | 5 (start creates attemptType=assessment with correct assessmentId, one official attempt invariant, persistence parity with practice mode, completion links candidate row, closed assessment blocks new starts) |

**Total new tests: 20.** Combined with Phase 0–3's existing 93, the full suite is **113 tests**.

## 16. Total test results

`pnpm -r test`: **113 passed**, 4 skipped (pre-existing dev-only timeline suite from Phase 2.1), 0 failed, across `packages/simulator` (13), `packages/db` (5), `packages/scenarios` (21/4 skipped), `packages/scoring` (13), `apps/web` (61).

## 17. Typecheck/lint/test/build results

- **Typecheck:** clean across all 5 packages (`pnpm -r typecheck`).
- **Lint:** clean across all 5 packages (`pnpm -r lint`). (One real issue was caught and fixed during development: a `set-state-in-effect` violation in the new `useHasOrganizations` hook, resolved by removing a redundant synchronous `setState` in the effect body.)
- **Test:** 113 passed, 4 skipped, 0 failed.
- **Build:** `next build` succeeds. All 23 app routes correctly classified (static/Partial Prerender/dynamic); proxy middleware active and extended for the new protected routes.

## 18. Manual Flow A result — Company Setup

**Passed**, driven live in an isolated browser tab. Created organization "Acme Corp" (creator became owner, confirmed via "your role: owner" on the dashboard), created "Staff Backend Engineer Assessment" against Payment Retry Storm v1, activated it (status DRAFT → ACTIVE, controls correctly swapped to "Close Assessment").

## 19. Manual Flow B result — Candidate Invitation

**Passed.** Invited `candidate+clerk_test@example.com` from the assessment detail page; a copyable invite link was generated and the candidate appeared in the table as "Invited". Opened the invite link in a freshly-signed-out browser session, signed up as that email (Clerk test-mode `+clerk_test@` convention, verification code `424242`), and confirmed the invite preview showed "You've been invited to complete an IncidentRank assessment for Acme Corp" + "Staff Backend Engineer Assessment" with an "Accept Invitation" CTA that worked once signed in.

## 20. Manual Flow C result — Candidate Completion

**Passed.** As the candidate, started the assessment from the landing page (disclosure text confirmed: *"Your actions, reasoning, result, and incident timeline will be shared with Acme Corp as part of this assessment"*), let the incident start, applied a mitigation (Retries 3→1, Backoff None→Exponential, Circuit Breaker Off→On) with reasoning text, and the incident resolved at 01:48 scoring 910/1000. The result screen showed "ASSESSMENT COMPLETE", full score breakdown, and critically **no "Try Again" button** (only "Back to IncidentRank") — the one-official-attempt UI constraint is correctly enforced. Verified in Postgres: `assessment_candidates.status = completed`, linked attempt `status = resolved`, `score = 910`.

## 21. Manual Flow D result — Hiring Team Review

**Passed.** Returned to the organization owner's session, opened the assessment — candidate row showed "Completed · 910 · Resolved". Opened the candidate result detail page: full score breakdown (all 6 dimensions), recovery time, revenue impact, configuration-change count, peak infrastructure cost, peak Kafka lag, and the Interviewer Timeline rendering the complete chronological sequence (provider degradation → candidate's bundled control change → system recovery events → incident resolved). The candidate's three control changes rendered correctly in the timeline card.

**Known issue found during this flow (documented, not a product bug):** the candidate's reasoning text did not appear in the timeline card for this specific manual run. Root-caused to a browser-automation interaction artifact — after programmatically setting the three dropdown values, the page layout shifted, and a subsequent raw-coordinate click+type for the reasoning textarea landed on a stale position and did not actually enter text (confirmed: the database shows an empty `reasoning` column for that action group, and the user directly observed "you did not type reasoning" during the live session). This is **not a regression**: the existing automated test `persistence.test.tsx` (which drives the same reasoning-entry UI via React Testing Library's `fireEvent`, not raw screen coordinates) passed cleanly both before and after this manual run, and the candidate-result and attempt-detail components' reasoning-rendering code (`{item.group.reasoning && (...)}`) is unchanged from the already-tested Phase 3 pattern.

## 22. Manual Flow E result — Privacy

**Passed.** Signed in as the candidate and completed one additional practice attempt (private, unrelated to any assessment). Returned to the organization owner's session and re-loaded the candidate result detail page — it showed exactly the same single assessment attempt (score 910) as before, with no trace of the new practice attempt anywhere in the UI or API response. Attempted direct URL access to the practice attempt as the owner (`/attempts/<practice-attempt-id>`) — **denied with a 404** (not merely an auth redirect — this is the ownership check firing, since the owner is fully authenticated but does not own that attempt), matching the same authorization path every signed-in user's attempt page uses. This privacy boundary is also covered by `assessment-access.test.ts`'s dedicated integration test and `load-owned-attempt.test.ts`'s cross-user-403 test.

## 23. Deviations from spec

None of substance. All "Important Constraints — Do NOT build" items (scenario authoring, custom company incidents, email delivery provider, billing, subscription plans, ATS integrations, enterprise SSO, AI candidate analysis, LLM reasoning evaluation, multi-incident assessments, public candidate marketplace) were respected. Invitation delivery is a copyable link only, per the spec's explicit allowance. Invite-token storage uses the "random opaque token, hashed at rest" option the spec explicitly permits for POC simplicity, with the tradeoff documented in `docs/architecture.md` and this report.

## 24. Product/UX concerns

- **Clock-skew sensitivity discovered during manual testing**: the local dev machine's system clock had drifted ~9 minutes behind real time, which caused Clerk to reject session JWTs as "not yet active" (`nbf` claim) specifically on some nested API routes, surfacing as a misleading "Failed to create invitation" / "Failed to create organization" error with no indication of the real cause. This is an environment issue, not an application bug, but it's worth noting that Clerk's JWT validation is clock-sensitive enough that a few minutes of drift produces a confusing, generic-looking failure. No code change was made for this; resolved by syncing the system clock (`sudo sntp -sS time.apple.com`) and restarting the dev server.
- **No invite-token expiry/rotation** (see Section 7) — acceptable for this POC per the spec, but should be prioritized if Phase 4's invitation flow sees real hiring usage, since a leaked link currently has no time-bound.
- **Assessment refresh/resume is a known, documented limitation** (Section 9) carried forward from Phase 3's practice-mode behavior — a refresh mid-assessment does not currently replay prior actions into a resumed engine state. For a *paid hiring assessment* (vs. free practice), this limitation has higher stakes than in practice mode and may warrant a resume mechanism sooner than the general practice-mode backlog item.
- **Score tie-break granularity** (inherited from Phase 3, not re-investigated this phase): the existing scoring bands are coarse enough that qualitatively different strong mitigations can tie exactly. Not revisited in Phase 4 per the instruction not to silently alter scoring bands without cause.

---

Per the spec's explicit instruction, **Phase 5 has not been started.**
