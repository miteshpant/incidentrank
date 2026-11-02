# Weekly Challenge / Challenge-Another-Engineer, Privacy &amp; Legal

## Weekly Challenge — the most recently built feature area

Schema (see `02-database.md` for full column lists): `weeklyChallenges` (at
most one `active=true` row, enforced by a partial unique index),
`challenges` (1:1 shareable invite, `tokenHash`-only persistence),
`attempts.weeklyChallengeId` (nullable attribution FK, `onDelete: "set null"`
— a challenge may rotate away without blocking cleanup of attempts started
under it; it's an attribution marker only, never itself part of
access-control logic after the attempt is created).

`apps/web/src/lib/server/weekly-challenge.ts`:
```ts
export async function getActiveWeeklyChallenge(tx = db): Promise<WeeklyChallenge | null>
export async function isCurrentWeeklyChallenge(scenarioId: string): Promise<boolean>
export async function isCurrentWeeklyChallengeSlug(slug: string): Promise<boolean>
export async function activateWeeklyChallenge(tx, input): Promise<WeeklyChallenge>
export async function deactivateWeeklyChallenge(tx): Promise<void>
```
`activateWeeklyChallenge` atomically deactivates any currently-active row
THEN inserts the new one, inside the caller-provided transaction — "the
current challenge" must never pass through a moment with zero or two active
rows, enforced at both the application level and the DB level (the partial
unique index).

**Free-access bypass**: folded into `isFree` resolution at each of the 4
practice-access call sites (see `03-auth-and-access.md`), not a new branch
inside `evaluatePracticeAccess()`. This is the pattern to copy for any future
"make X free under condition Y" feature.

`apps/web/src/lib/server/challenge.ts`:
```ts
export async function createChallenge(challengerUserId, attemptId): Promise<CreateChallengeResult>
// Eligibility enforced server-side: attempt must belong to the calling user,
// attemptType === "practice", assessmentId === null (belt-and-suspenders —
// company assessment attempts must NEVER become challenge links), status === "completed".

export async function getChallengeByToken(token): Promise<ChallengeLandingDTO | null>
// The no-spoiler landing lookup. Returns ONLY { challengeId, scenarioSlug,
// scenarioName, challengerDisplayName }. Null for unknown OR expired token
// — deliberately indistinguishable, both render as 404.

export async function acceptChallenge(token, challengedUserId): Promise<AcceptChallengeResult>
// Idempotent — accepting an already-accepted link just re-confirms it.

export async function linkChallengedAttemptIfPending(tx, userId, scenarioId, attemptId): Promise<boolean>
// Called from persistTerminalAttempt. Finds the most recent pending
// challenge (challengedUserId set, challengedAttemptId still null) for this
// user+scenario and links it. Returns whether it actually linked something.

export async function getChallengeComparison(challengeId, requestingUserId): Promise<ChallengeComparisonResult>
// Only a participant (challenger or challenged) may call successfully, and
// only once BOTH attempts are independently terminal. Never trusts a
// client-supplied "show me anyway" flag.
```

## The `safeDisplayName` email-leak bug — a privacy bug class to watch for

Found during live browser QA, not by any automated test. The bug: the
challenge landing page could show a raw email address as "<X> challenged
you" instead of neutral wording, because `users.displayName` falls back to
the account's email when Clerk has no `fullName`/`username` set. That
fallback is perfectly safe on every surface that shows a user their *own*
profile — it becomes a leak the instant that same field is forwarded into a
payload rendered for a **different** person.

The fix (`challenge.ts`):
```ts
function safeDisplayName(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  if (displayName.includes("@")) return null;
  return displayName;
}
```
Applied at every surface that shows one user's name to another: the landing
lookup and both sides of the comparison.

**The general lesson**: any time a field that was originally designed for
"show a user their own data" gets reused in a context where it's shown to
someone *else*, re-audit whether its fallback values are still safe. A
display-name/email/phone fallback chain is the classic shape this bug takes.
Grep for `displayName` (or any similarly-reused user-identity field) before
adding a new feature that shows one user's identity to another.

## Privacy / Legal / Data Deletion

### Account deletion (`apps/web/src/lib/server/account-deletion.ts`)

```ts
export async function deleteOwnAccount(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(users).set({
      displayName: "Deleted User",
      authProviderId: `anonymized_deleted-${userId}`,
      leaderboardVisible: false,
    }).where(eq(users.id, userId));
    await createPrivacyRequest(userId, "deletion", { status: "completed", tx });
  });
}
```

**Anonymization, not destructive deletion.** Deliberately does *not* touch
`organizationMembers`, `attempts` (practice or assessment), `rankSnapshots`,
`organizationCreditLedger`, `paidEntitlements`/`stripeSubscriptions`,
`referrals`, `legalAcceptances`, or any audit-event row — all of these
remain, pointed at the now-anonymized user id, per the explicit policy of
preferring anonymization over destructive removal whenever organizational
integrity, financial record-keeping, or legal-acceptance evidence must
survive. `legalAcceptances` in particular must never be deleted — deleting
it would destroy the evidence that consent was once given.
`benchmarkSubjects.userId` is explicitly never touched either (no
displayName/email/Clerk-id column exists there to begin with, so there's no
re-identification risk).

**If you're asked to add a "delete X" feature anywhere in this product,
default to this anonymize-don't-destroy pattern** unless there's a specific
reason the data genuinely must be gone (and even then, check `docs/privacy/`
first).

### Legal acceptance gate

`apps/web/src/lib/server/legal-gate.ts`:
```ts
export async function enforceLegalGate(user: User): Promise<void> {
  const result = await requireCurrentLegalAcceptance(user);
  if (!result.ok) redirect(result.redirectTo);
}
```
Called from server components for "real product access" pages (profile,
organizations, attempts) — not `/terms`, `/privacy`, `/legal/accept`, or
admin routes. Uses Next's `redirect()` (throws internally), not a boolean the
caller has to remember to act on.

`legal-versions.ts` — version constants plus a cutover mechanism:
```ts
export function legalAcceptanceGateCutoverAt(): Date {
  const raw = process.env.LEGAL_ACCEPTANCE_GATE_CUTOVER_AT;
  if (!raw) return new Date("9999-12-31T00:00:00Z"); // unset = gate no one
  ...
}
```
**Critical fact**: the gate applies only to users created at/after this
cutover instant. Pre-existing users are *permanently exempt*, no matter how
many times the version constants are bumped afterward. This is why a
privacy-policy version bump has zero effect on any existing user — don't
assume bumping `CURRENT_PRIVACY_VERSION` will force re-acceptance from
everyone.

### `docs/privacy/` — what's there

- `data_inventory.md` — field-by-field inventory of what personal data is
  actually stored, including an explicit "must not store" list (no
  IP/device-fingerprint logging exists anywhere in the product).
- `data_retention.md` — retention policy per data category. Most categories
  are "Manual (beta)" — no automated time-based purge exists anywhere today
  except the automated-by-construction survival of benchmark/legal-acceptance
  data.
- `privacy_security_review.md` — broader privacy/security posture review.
- `service_providers.md` — vendor/sub-processor inventory.

If you're touching anything that stores or deletes personal data, read
`data_inventory.md` and `data_retention.md` first — they're the authoritative
statement of what's allowed to exist and for how long.
