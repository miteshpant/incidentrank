# Practice vs. Assessment Runtime, Terminal Completion, Billing, Admin Portal, Analytics

## Why practice and assessment run differently

```
Practice Runtime            Assessment Runtime
(attemptType: practice)     (attemptType: assessment)

Browser runs simulate()     Server runs simulate()
directly, full               — apps/web/src/lib/server/
ScenarioSimulationDefinition  assessment-runtime.ts
sent client-side
```

Practice attempts aren't graded competitively or compared across candidates —
they're the candidate's own, so client-side simulation is an acceptable trust
model. Assessment attempts ARE compared by a real employer making a hiring
decision, so the engine runs exclusively server-side — the client never
receives rules/thresholds/scoring config, only a `RuntimeView` projection
(`packages/simulator/src/runtime-view.ts`'s `toRuntimeView()`): architecture,
controls, state, already-occurred events, status, incidentStartMs,
completionMode. Structurally has no field for rules, timed events, success/
failure conditions, scoring, action classifications, or cost/revenue rates.

### Assessment runtime (`apps/web/src/lib/server/assessment-runtime.ts`)

- `bootstrapRuntime(attempt)` — reconstructs state via `replayAttempt()` to
  the persisted checkpoint. Used for both initial mount *and* every
  refresh/resume — there's no separate resume path.
- `advanceRuntime(attemptId, attempt)` — server computes the allowed elapsed
  delta from its own stored `runtimeAnchoredAt` (`now - runtimeAnchoredAt`,
  capped at 30s per call), **never from client input**. Null
  `runtimeAnchoredAt` means paused; advancing is then a no-op.
- `submitAction(attempt, clientRequestId, changes, reasoning)` — validates
  against the scenario's own control definitions, persists action
  group/events/checkpoint in one transaction.
- `resumeRuntimeClock`/`pauseRuntimeClock` toggle `runtimeAnchoredAt`.

Routes: `GET .../runtime` (bootstrap/resume), `POST .../advance`
(server-authoritative time step, client polls every 4s while
mounted/active/visible), `POST .../actions`, `POST .../pause`.

**Idempotency/concurrency**: `attemptActionGroups.clientRequestId` (unique
per attempt) is the idempotency key for action submission. `advanceRuntime`
uses `attempts.runtimeVersion` as an optimistic-concurrency token —
`WHERE runtime_version = <value just read>`; zero rows affected means a
concurrent write already moved the attempt, caller re-reads and retries.

### `generic-incident-console.tsx` vs. the Payment Retry Storm exception

A single `CandidateUIDescriptor` (`packages/scenarios/src/candidate-ui.ts`)
drives generic metrics/component/timeline panels and the overall console for
ANY scenario, built-in or org-authored, with zero scenario-specific UI code.
`apps/web/src/app/incidents/payment-retry-storm/` is kept as a separate,
hand-written directory for historical reasons — it predates the generic
console (it was the original Phase 1/2 implementation) and was later
retrofitted to produce the same `CandidateUIDescriptor` shape rather than
being replaced outright. Don't be surprised to find its own
`persistence.test.tsx` etc. alongside the generic path's tests.

## `persistTerminalAttempt()` — the one convergence point

`apps/web/src/lib/server/terminal-attempt.ts`. Both completion triggers
(engine-detected automatic failure, and explicit candidate Finish) converge
here:

```
automatic (engine) terminal event ───┐
                                      ↓
                            persistTerminalAttempt()
                                      ↑
candidate Finish declaration ────────┘
```

```ts
export async function persistTerminalAttempt(
  tx: TxOrDb,
  attempt: Pick<Attempt, "id"|"scenarioId"|"scenarioVersion"|"attemptType"|"assessmentId"|"startedAt">
    & { scenario: { slug: string; ownershipType: string } },
  inputs: ScoringInputs,
  finalState: SimulationState,
  fields: TerminalAttemptFields,
): Promise<AttemptScoreResult>
```

Scores via `scoreAttempt()`, writes exactly one `UPDATE attempts SET ...
WHERE id = <id> AND status = 'in_progress'` — scoped so a concurrent writer
that already completed the attempt first becomes a clean no-op, never a
double-write. If this is an assessment attempt, also syncs the matching
`assessmentCandidates` row to `completed`.

**Everything else only runs if the UPDATE actually affected a row** (i.e.
this call genuinely won the race):
1. `qualifyReferralForAttempt()` — always, practice or assessment.
2. If `attemptType === "practice"` only:
   - `persistRankSnapshotIfChanged()` — Engineer Rank recalculation.
   - `linkChallengedAttemptIfPending()` — Weekly Challenge linking.
   - Conditionally fires `weekly_challenge_finished` / `challenge_finished`
     analytics events.

This is **the** place to hook in any future "something should happen when a
practice attempt finishes" logic — not the result-screen UI, not a client
callback. Note the explicit reasoning for not wrapping the Engineer Rank call
in a defensive try/catch: a try/catch around a query sharing the same `tx`
provides no real isolation, since Postgres poisons the whole transaction on
any statement error regardless of a JS-level catch.

### `finishAttempt()` — the candidate-declared Finish flow

`apps/web/src/lib/server/finish-attempt.ts`. Row-locks the attempt
(`FOR UPDATE`), checks the `finishRequestId` idempotency key against the
*freshly-locked* row **before** the terminal check (so a genuine retry of an
already-succeeded request is still recognized even though the attempt is now
correctly terminal), replays persisted action groups, calls
`evaluateCandidateDeclaredFinish()`, derives `ScoringInputs` via
`extractFinishScoringInputs` (using the scoring-only `resolvedAtMsOverride` —
the actual sustained-since instant, never the wall-clock Finish-click time),
calls `persistTerminalAttempt()`. Benchmark materialization happens *after*
the transaction commits, and only on a genuine first application, never on an
idempotent replay.

## Billing (Stripe) — `apps/web/src/lib/server/stripe/`

Two **separate** code paths, not shared:

- **Personal** (Pro/Founding): `checkout.ts`. Pro uses `mode: "subscription"`
  (price ID resolved server-side only via `getPlanPriceId(plan)` — the client
  sends a `plan` enum, never a raw price ID). Founding uses `mode: "payment"`,
  wrapped in a transaction: reserve capacity slot first
  (`reserveFoundingSlot`), then create/reuse Stripe Customer, then create the
  Checkout Session; a failed session-creation releases the reservation and
  rethrows.
- **Organization**: `organization-checkout.ts` + `organization-credits.ts` +
  `organizationCreditLedger` (see `02-database.md`). An org's credits belong
  to the organization record itself, never to whichever user owns the
  Stripe-customer mapping — so changing org owners never moves or destroys
  credits.

**Founding capacity** (`founding-allocation.ts`): exactly 100 pre-seeded
rows, race-safe via `UPDATE ... WHERE slot_number = (SELECT ... FOR UPDATE
SKIP LOCKED)`. `reserveFoundingSlot` catches Postgres error `23505` and
converts it to a clean `already_reserved` result rather than an unhandled
500 — this was a real confirmed bug fix at some point in this project's
history, worth keeping in mind as the pattern for any future
`SKIP LOCKED`-based reservation logic.

**Webhooks** (`webhook-handlers.ts`): `checkout.session.completed` only
matters for Founding issuance — subscription-mode sessions are a no-op there
("do not treat `checkout.session.completed` as permanent proof of an active
subscription"). `customer.subscription.*` and `invoice.*` all re-fetch the
live subscription and delegate to one single subscription-sync path — there
is exactly one place Pro access is ever derived from.

**Launch discounts** (`discount-config.ts`): a pure overlay at
checkout-session-creation time, never a change to canonical Price IDs or
entitlement semantics. The client never sends a coupon/discount
percent/duration in any request — a dedicated test asserts an injected
discount field in the request body is silently ignored. Current discounts:
Founding 50% off (once), org first-purchase 50% off (once, gated by
`organizationLaunchDiscountClaims`). `LAUNCH_DISCOUNTS_ENABLED` defaults
false; a missing coupon ID for an enabled flag fails safe to "no discount,"
never blocks checkout.

## Admin Portal

`apps/web/src/app/admin/admin-nav.tsx` — current full section list (17
total, 13 always-visible + 4 gated behind `paymentsOnly`):

```
Overview, Customer & Revenue, Customers, Organizations, Scenarios,
Weekly Challenge, Analytics, Promotional Invites, Incident Passes,
Referrals, Admin Users, Privacy Requests, Benchmark
  [+ paymentsOnly:] Paid Entitlements, Stripe Subscriptions,
                     Founding Allocations, Webhook Events
```

Standard gate pattern, repeated on every admin page/route: `isAdminPortalEnabled()`
→ `getOrCreateCurrentUser()` → `loadAdminMembership(user)`. Mutations also
call `logAdminAction()` (`admin-audit.ts`) to write `adminAuditEvents` — never
logs raw tokens/secrets. See `03-auth-and-access.md` for the layout-level
nav-disclosure fix and its general lesson.

## Analytics (`apps/web/src/lib/server/analytics.ts`)

Full event vocabulary, 23 events:

```
page_view, homepage_view, try_free_incident_clicked, incident_view,
incident_acknowledged, incident_started, first_action_applied,
finish_clicked, incident_finished, signup_clicked, signup_completed,
assessment_viewed, assessment_started, assessment_finished,
company_inquiry_submitted, company_contact_opened, weekly_challenge_viewed,
weekly_challenge_started, weekly_challenge_finished, challenge_created,
challenge_link_opened, challenge_accepted, challenge_finished
```

`recordAnalyticsEvent(input)` wraps its insert in try/catch and only
`console.error`s on failure — analytics must never block the primary user
action. Aggregation functions, all range-filterable by `"7d"|"30d"|"all"`:

- `getAnalyticsOverview(range)` → pageViews, uniqueVisitors (distinct
  `coalesce(userId, anonymousSessionId)` on `page_view` events),
  incidentViews/Started/Finished, signupClicks, registrations, 3 computed %.
- `getAnalyticsFunnel(range)` → 8-stage ordered funnel (Incident Viewed →
  Acknowledged → Started → First Action → Finish Clicked → Finished →
  Signup Clicked → Registered).
- `getAnalyticsByScenario(range)` → per-scenario views/starts/finishes/
  finishRate, sorted by views descending.
- `getAnalyticsReferrers(range)` → top-20 referrer host counts.
- `getWeeklyChallengeStats(range)` → views/starts/finishes/
  challengesCreated/linksOpened/accepted.

**Privacy rule, enforced by the `analytics_events` schema comment itself**:
never record candidate reasoning, action values, scores, completion tiers,
or any hidden/sensitive scenario state. `context` jsonb is for small,
non-sensitive properties only (referrer host, button label — that kind of
thing).

### A real gap this project had, and how it was found

`weekly_challenge_finished` and `challenge_finished` were declared in
`ANALYTICS_EVENT_NAMES` and had admin UI already built to display their
counts — but nothing ever called `recordAnalyticsEvent` for them. The admin
stat always read 0 despite real completions. This was caught by the product
owner actually finishing challenges and noticing the number stayed at zero —
**not** by any test, because the tests that existed covered the linking logic
(`linkChallengedAttemptIfPending`) but never asserted an analytics row
actually landed. **Lesson**: when a feature plan lists analytics events,
verify each one actually fires with a real end-to-end check (query the
`analytics_events` table after exercising the flow), not just that the event
name exists in the vocabulary and the admin UI renders a count for it.
