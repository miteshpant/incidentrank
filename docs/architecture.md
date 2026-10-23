# IncidentRank — Architecture

This document describes the architectural principles that constrain how IncidentRank
is built, starting in Phase 0 and carried forward through every later phase.

## 1. Deterministic Simulation

The simulation engine is deterministic.

Given the same:

```text
Scenario + State + Action + Elapsed Time
```

it must always produce the same:

```text
New State + Events
```

The simulator must never use randomness, current system time, external APIs, or
network requests internally. Any variability a scenario wants to express (e.g.
"provider latency increases over time") must be expressed as a pure function of
simulation time and state, not wall-clock time or `Math.random()`.

This determinism is what makes incident replay, rescoring, and auditing possible.

## 2. Simulator Independence

`packages/simulator` must not depend on:

- UI frameworks (React, Next.js)
- browser APIs
- persistence / database code
- authentication
- external APIs

It is a plain TypeScript library. It can be unit tested in isolation, run on a
server, run in a worker, or run in a test harness without booting a browser or a
web framework.

## 3. Event History

A candidate's attempt at an incident is represented as an immutable, ordered
sequence of candidate actions and the simulation events they produced.

This log-oriented model is what will eventually allow:

- replaying an incident step by step
- auditing what a candidate did and when
- rescoring an attempt if scoring logic changes
- analyzing candidate behavior across many attempts
- debugging unexpected simulator behavior by reproducing an exact run

Phase 0 only defines the shapes (`CandidateAction`, `SimulationEvent`) that make
this possible later — it does not yet persist or replay anything.

## 4. Outcome-Based Scoring

Scoring must evaluate measurable outcomes of the simulation, not whether the
candidate chose a predetermined "correct" action.

This is explicitly **not** how scoring will work:

```text
if candidate enables circuit breaker:
    +100 points
```

Instead, a candidate's decisions change system behavior inside the simulation,
and scoring will be computed from the resulting outcomes, such as:

- recovery time
- customer impact
- data integrity
- reliability
- infrastructure cost
- operational efficiency

This keeps the simulator and the scenario content honest: there is no hidden
answer key, only a system that responds to what the candidate actually does.

## 5. User vs. Candidate

A "candidate" is a relationship/context, not a distinct account type.

A single IncidentRank user may:

- practice incidents independently, with no company involved
- be a candidate for Company A
- simultaneously be a candidate for Company B

The architecture must not create separate candidate user accounts or force a
user to pick "candidate" vs. "practice" identities. Company-scoped candidacy is
future work, but the data model should treat it as an association on top of a
single user identity, not a fork of it.

## 6. Scenarios Are Authored, Not Simulated Infrastructure

IncidentRank does not mathematically model queueing theory, network physics,
database performance, or cloud capacity. `packages/simulator` is a
**scenario-agnostic rules engine**: it knows how to validate candidate
actions against a scenario's declared controls, evaluate a scenario's
ordered, declarative rules against the current configuration, track timed
events, accumulate authored cost/revenue/customer-impact bookkeeping, and
check authored success/failure conditions.

It has no knowledge of any specific scenario (e.g. "Payment Retry Storm").
All scenario-specific behavior — initial state, timed events, the rule
table, thresholds, cost rates — lives as declarative data in
`packages/scenarios`, not as imperative code or formulas inside the engine.

This keeps the product promise intact: a scenario author defines what
happens: the engine deterministically applies those authored rules and
consequences.

## 7. Candidate Reasoning Is Recorded, Not Evaluated

Candidate actions may include candidate-authored reasoning: a free-text
explanation of why the candidate made a given configuration change.

This reasoning:

- is stored with the attempt, attached to the candidate decision that
  produced it
- is visible in the live incident timeline and in replay/results
- does not affect deterministic scenario behavior in any way — it never
  reaches rule evaluation, success/failure conditions, or cost/revenue
  calculations
- does not currently affect scoring

No AI or LLM evaluates, scores, or labels candidate reasoning as correct or
incorrect. It is captured purely as an audit record of what the candidate
believed was happening and why they acted — valuable for later company
assessment review, never as an input to the simulation itself.

> IncidentRank records both what the engineer did and why they said they did it.

---

## Phase 0 scope

Phase 0 implements only the structural skeleton described above:

- `packages/simulator` — the `SimulationState`, `CandidateAction`,
  `SimulationEvent`, `SimulationResult` types, and a placeholder `simulate()`
  that advances simulation time deterministically and returns no events.
- `packages/scenarios` — the `ScenarioDefinition` type and metadata for the
  "Payment Retry Storm" scenario, with no system model behind it yet.
- `apps/web` — a landing page and an `/incidents` page listing scenarios as
  disabled/coming-soon cards.

No persistence, authentication, scoring, or real simulation logic exists yet.
Those are Phase 1+ concerns and must be built on top of, not around, the
principles above.

## Phase 1 scope

Phase 1 replaces the Phase 0 placeholder types with a real, scenario-agnostic
rules engine and the first complete scenario:

- `packages/simulator` — control/action validation, an ordered rule-matching
  engine, timed-event processing, authored cost/revenue accumulation, and
  success/failure sustain tracking. No formulas, no scenario-specific logic.
- `packages/scenarios/payment-retry-storm` — the full declarative Payment
  Retry Storm scenario: architecture topology, controls, initial metrics,
  timed provider degradation/recovery, an authored rule table covering
  multiple recovery and failure paths, revenue/cost configuration, and
  success/failure conditions.

Still no persistence, authentication, candidate UI, or 0–1000 scoring — this
phase proves the scenario is executable deterministically through automated
tests only.

## Phase 2 scope

Phase 2 builds the candidate-facing incident playground in `apps/web`: a
briefing screen, a live incident console (architecture, metrics, controls,
timeline), and a result screen, all driven entirely by the Phase 1 engine.
Attempt state lives in browser memory only (a `useReducer`-backed hook); no
persistence was introduced.

## Phase 2.1 scope

Phase 2.1 is a focused enhancement on top of Phase 2, adding two UI/attempt-level
features without touching `packages/simulator`'s behavior:

- **Candidate reasoning** — an optional free-text explanation attached to
  each Apply Changes decision, tracked as a `CandidateActionGroup` at the
  attempt level (not an engine concept). One group bundles every field
  changed in a single Apply click with the one reasoning entered for it.
  The engine's flat `CONFIG_CHANGED` event stream is unchanged and remains
  the authoritative record of what happened; action groups are an
  additional, UI-facing representation of *candidate decisions* layered on
  top of it.
- **Pre-incident countdown** — a UI-only countdown derived from
  `scenario.timedEvents[0].atMs` (the scenario's first timed event, which by
  construction is always its incident-start trigger) compared against
  `simulationTimeMs`. Controls remain locked (`Apply Changes` disabled)
  until `state.transitions.nextTimedEventIndex > 0`, i.e. until the engine
  itself has processed that first timed event. No scenario timing was
  changed or shifted; the countdown is pure presentation of existing engine
  state.

## Phase 3 scope

Phase 3 turns the in-memory Phase 2.1 playground into a persistent,
authenticated product: Clerk authentication, a PostgreSQL + Drizzle ORM
database (`packages/db`), a deterministic 0–1000 IncidentRank scoring
package (`packages/scoring`) computed purely from `ScoringInputs` (never
from candidate reasoning text — the type has no reasoning field), an
attempt lifecycle that persists at meaningful moments (attempt creation,
each action group, batched events, terminal completion — never every
simulation tick), attempt history and replay (`/attempts`,
`/attempts/[attemptId]`), a public leaderboard, and per-user privacy
controls (`leaderboardVisible`, default `false`). Payment Retry Storm
gained an `isFree` flag so it remains playable without signing in;
anonymous play never calls the persistence endpoints.

## Phase 4 scope

Phase 4 introduces the B2B assessment workflow on top of Phase 3's
authenticated persistence, without forking the user model or the
simulation engine.

### Core principle: Candidate is a relationship, not an account type

A user is never permanently a "candidate." `assessmentCandidates` is a pure
association row — `userId` (nullable until claimed) + `assessmentId` +
invitation state — layered on top of the single `users` identity
established in Phase 3. The same user can simultaneously have private
practice attempts, be a candidate for one organization's assessment, and
be an organization member of a different organization.

### New data model

```text
Practice Attempt     attempts.attemptType = "practice", assessmentId = null
Assessment Attempt   attempts.attemptType = "assessment", assessmentId = <assessment>

Organization          company account (id, name, slug unique)
OrganizationMember     user + organization + role (owner/admin/member)
Assessment             organization + scenario + scenarioVersion (pinned at
                        creation) + status (draft/active/closed)
AssessmentCandidate    assessment + email/normalizedEmail + userId (nullable
                        until claimed) + status (invited/started/completed)
                        + inviteTokenHash + attemptId (nullable until started)
```

`attempts`, `attemptActionGroups`, `attemptActionChanges`, and
`attemptEvents` are reused unchanged — an assessment attempt is a normal
`attempts` row with `attemptType = "assessment"` and `assessmentId` set,
persisted through the exact same API routes, the same
`useIncidentAttempt` hook, and the same scoring package as practice mode.
There is no second assessment-specific simulation or persistence system.

### Authorization boundary

> **Company access is scoped to assessment-linked attempts only.**

Every organization-scoped route/API call chains through
`loadOrganizationMembership` (organization membership, 404 if the slug
doesn't exist, 403 if the user isn't a member) and, for assessment/
candidate access, `loadOrgAssessment` / `loadOrgCandidate`
(`apps/web/src/lib/server/assessment-access.ts`), which additionally
verify the assessment belongs to that exact organization and the
candidate row belongs to that exact assessment before ever touching an
`attemptId`. A company can reach a candidate's attempt **only** by walking
organization → assessment → candidate → `candidate.attemptId` — that
chain is the only privilege-elevation path in the system. It is
structurally incapable of reaching:

- a candidate's private practice attempts (never linked to any assessment)
- a candidate's attempts under a different organization's assessments
- another organization's assessments or candidates entirely

Mutations (create assessment, invite candidate, close assessment)
additionally require `canMutate(role)` — owner or admin; `member` may only
view. Candidate-side access (accepting an invite, starting the assessment)
is identity-based, not organization-membership-based: the signed-in user
must be the exact `userId` claimed on the `assessment_candidates` row.

### Invite tokens

A cryptographically random opaque token (`randomBytes(32)`, base64url) is
generated per invitation. Only its SHA-256 hash is stored
(`assessmentCandidates.inviteTokenHash`); the plaintext is returned to the
inviter once, at creation time, and is never persisted or retrievable
again. **Documented tradeoff**: this POC does not implement token
rotation or expiry — a leaked invite link remains valid until the
assessment is closed. A future phase should add expiry and/or
single-use invalidation after acceptance.

### Candidate identity binding

When an invited candidate accepts, the signed-in user's Clerk **verified**
primary email (`emailAddresses` entry matching `primaryEmailAddressId`
with `verification.status === "verified"`) must case-insensitively match
the invitation's `normalizedEmail`. This is enforced server-side
(`api/assessment/invite/[token]/route.ts`) rather than inventing custom
matching logic, since Clerk's primary email is already verified at
sign-up/sign-in for the email auth strategy. Once claimed,
`assessment_candidates.userId` is set and is never reassigned to a
different user — an already-claimed invitation returns `409` for anyone
else.

## Phase 4.1 scope

Phase 4.1 is a focused reliability phase: assessment attempt resume, so a
candidate's browser refresh or temporary disconnect never restarts an
incident, loses actions/reasoning, or grants a second attempt.

### Deterministic Attempt Replay

```text
Scenario version
+
Persisted candidate actions
+
Persisted simulation elapsed time
=
Reconstructed incident state
```

`packages/simulator`'s `replayAttempt()` (`packages/simulator/src/replay.ts`)
is a pure function with no Next.js/Clerk/database dependency: given a
scenario definition, a target elapsed time, and the candidate's persisted
decisions (in original recorded order), it reconstructs state by calling
`createInitialState()` once and then repeatedly calling the existing
`simulate()` function — first advancing to each decision's timestamp, then
applying that decision's control changes, and finally advancing to the
target elapsed time. This is exactly the mechanism `simulate()` already
provides for one live tick/action; replay simply drives it from persisted
history instead of a live clock.

**Candidate actions are the only replay input.** Persisted system events
(`attempt_events`) are audit history/interviewer-timeline/debugging
information only — they are never replayed as commands. They are
naturally regenerated as a side effect of re-running the deterministic
scenario, and the Phase 4.1 test suite proves (via exact `toEqual`
equality against an uninterrupted run) that this regeneration is
byte-for-byte identical to the original run's event stream.

Resume always resolves the engine-executable scenario definition from the
*exact* `scenarioId`/`scenarioVersion` stored on the attempt
(`resolveSimulationDefinition` in
`apps/web/src/lib/server/scenario-registry.ts`), never "currently active
latest version." If that exact version cannot be resolved, resume fails
safely with a generic error rather than silently running a different
scenario.

### Elapsed-time checkpointing

`attempts.lastSimulationTimeMs` (nullable integer) is the resume
checkpoint. It is written via `PATCH /api/attempts/[attemptId]/checkpoint`
at meaningful moments only — never every 1-second tick:

- immediately upon becoming active (so a checkpoint always exists even if
  the candidate refreshes in the first instant)
- every 12 seconds while actively ticking
- whenever a candidate applies a change (an Apply Changes click is always
  a meaningful resume point)
- whenever the browser tab becomes hidden (`visibilitychange`), as a
  best-effort signal — never relied upon alone, since `beforeunload` is
  not guaranteed to fire

### Assessment clock policy

> Assessment simulation time pauses while the incident console is not
> actively running.

If a candidate refreshes at incident-elapsed `03:42`, they resume at
exactly `03:42` — never further along because time passed while the
browser was closed. This is the explicit Phase 4.1 POC policy, chosen to
avoid penalizing candidates for network/browser disruptions. A resumed
attempt shows a dedicated "Assessment in Progress — paused at `MM:SS`"
screen with an explicit "Resume Assessment" CTA; the clock never restarts
automatically before that click.

### Resume lifecycle

`GET /api/attempts/[attemptId]/resume` (ownership-checked via the
existing `loadOwnedAttempt`) calls `loadResumeData()`
(`apps/web/src/lib/server/attempt-resume.ts`), which wraps
`replayAttempt()` with the attempt's persisted action groups and
checkpoint, and returns the reconstructed engine state, regenerated
timeline events, the candidate's action groups (with reasoning), and the
next action-group/event sequence numbers to continue from. The client
(`useIncidentAttempt`'s `resumeSeed` parameter) adopts this directly into
a new `"paused"` phase — never re-creating the attempt, never
re-persisting historical action groups or events (the hook's internal
counters are seeded to continue exactly where the server left off). A
terminal (`resolved`/`failed`) attempt is never replayed as active — it
continues straight to the existing Phase 4 result/`AlreadyCompleted`
experience.

Closing an assessment blocks **new starts** only
(`assessment.status === "active"` check in the start route), never an
already-started candidate's resume — `loadResumeData()` is purely
attempt-scoped and never inspects assessment status at all.

### Invite expiration

`assessment_candidates.inviteExpiresAt` (set to 7 days after creation,
`INVITE_EXPIRY_MS` in `apps/web/src/lib/server/invite-token.ts`) is
checked by both the invite preview and accept routes — but only for
**unclaimed** invitations (`userId === null`). An already-claimed
candidate never depends on the token again, so expiry never affects
someone who already accepted. No token rotation was added.

## Phase 5 scope

Phase 5 lets an organization author its own private incident scenario
without writing TypeScript, so that the simulator described in
Section 6 above executes either a source-controlled scenario or a
database-authored one through the identical engine, with no second
incompatible simulation system.

### Concepts

- **Built-in Scenario** — `ownershipType: "incidentrank"`. Source-controlled
  TypeScript in `packages/scenarios` (Payment Retry Storm, Database
  Connection Saturation). Always `visibility: "public"`, never has an
  `organizationId`. Its version is `ScenarioDefinition.version`, a
  source-code field — bumping it is a reviewed code change, not a
  database write.
- **Organization Scenario** — `ownershipType: "organization"`. Authored
  through the UI, stored as JSON, always `visibility: "private"`,
  always scoped to exactly one `organizationId`.
- **Scenario Version** (`scenario_versions` table) — an immutable,
  numbered snapshot of an organization scenario's definition
  (`scenarioId`, `version`, `definitionJson`, `status`). Unique on
  `(scenarioId, version)`.
- **Scenario Draft** — a `scenario_versions` row with `status: "draft"`.
  The only version row that may ever be mutated in place. A scenario
  has at most one draft at a time.
- **Published Scenario [Version]** — a `scenario_versions` row with
  `status: "published"` and a stamped `publishedAt`. Once published, a
  version row is never updated again.
- **Archived Scenario** — a `scenarios` row with `status: "archived"`.
  Excluded from new-assessment selection; its existing `scenario_versions`
  rows, and any assessment/attempt already pinned to one, are completely
  unaffected — archiving a scenario never deletes or hides a version a
  live assessment depends on.

### Why `scenarios` carries no version column

This went through two rounds of deliberate design correction before
landing here, and the reasoning is worth preserving: an earlier draft
considered repurposing a `scenarios.version` column as "latest
published," but that creates two sources of truth for the same concept
(the column, and the actual max published row in `scenario_versions`)
that must stay in sync. Instead:

```text
scenarios            — stable identity only: slug, ownership,
                        organization, visibility, status. No version.

Built-in scenario     ScenarioDefinition.version (source) is authoritative.
Organization scenario scenario_versions.version (DB) is authoritative.
```

The resolver (`resolveSimulationDefinition` /
`resolveCurrentVersion` in `apps/web/src/lib/server/scenario-registry.ts`)
explicitly branches on a scenario's `ownershipType` rather than forcing
both cases through one storage shape. Fake `scenario_versions` rows are
deliberately never created for built-in scenarios to make the model
look uniform — that would blur the distinction between code-owned and
DB-authored content and create synchronization work between TypeScript
and the database for no real benefit.

`attempts.scenarioVersion` / `assessments.scenarioVersion` remain plain
integers, exactly as in Phase 4/4.1 — pinning an attempt or assessment
to "scenario X, version N" is unchanged as a concept. What changes is
only how that integer is *resolved* into an executable definition,
which now depends on the referenced scenario's `ownershipType`.

### Scenario lifecycle

```text
Create Draft
    ↓
Edit
    ↓
Validate
    ↓
Preview
    ↓
Publish v1
    ↓
Used by Assessment
    ↓
Edit
    ↓
Create v2 Draft
    ↓
Publish v2
```

> **Published scenario versions are immutable.**

> **Assessments always reference an immutable scenario version.**

Editing a published scenario never mutates it: it creates a new draft
version (`version: latestPublished.version + 1`) seeded from the
published definition. The previously published version, and every
assessment pinned to it, is completely unaffected — an assessment
created against v1 stays on v1 forever, even after v2 is published and
becomes the default for new assessments.

### Authoring data flow

```text
DB-authored scenario (AuthoredScenario JSON)
       ↓
validateAuthoredScenario()   — structural validation, never throws
       ↓
compileAuthoredScenario()    — pure, no React/Clerk/DB dependency
       ↓
ScenarioDefinition            — identical shape a built-in scenario produces
       ↓
existing simulator (packages/simulator)
```

Both functions live in `packages/scenarios/src/authoring/`. The
authored schema (10 UI sections, 9 of which are data — Preview &
Publish is UI-only) deliberately restricts rule conditions to a
structured, closed operator set (no code, no string eval, no arbitrary
expressions) and requires every publishable scenario to have a
fallback rule, so a scenario can never reach undefined behavior.
Publishing re-validates and re-compiles before flipping any status, so
an invalid executable definition can never be published.

`compileAuthoredScenario()` never includes scoring bands or dimension
weights in its output — this is enforced structurally by the compiler,
not filtered out afterward, which is what makes the candidate-safe
payload guarantee below hold for scoring specifically.

### Generic candidate UI

A shared `CandidateUIDescriptor` (`packages/scenarios/src/candidate-ui.ts`)
describes which metrics, controls, and architecture components a
candidate should see and how to format them. Both
`paymentRetryStormCandidateUI` (a hand-written descriptor migrated from
the original hardcoded UI) and `authoredScenarioToCandidateUI()`
(derived automatically from an authored document) produce this same
shape, which is what lets one set of generic React components
(`GenericMetricsPanel`, `GenericComponentPanel`, `GenericTimelinePanel`
in `apps/web/src/components/scenario-console/`) render any scenario —
built-in or organization-authored — without scenario-specific UI code.

### Candidate-safe payload: a known limitation, not a solved problem

Phase 5 keeps the pre-existing client-side simulation architecture (the
browser runs the simulator locally against the full compiled
`ScenarioDefinition`) so both built-in and organization-authored
scenarios execute through one identical model. Within that constraint,
`/api/assessment/[assessmentId]/scenario` is careful about what it
sends:

**Never sent to the candidate browser:**
- scoring bands or dimension weights (never compiled into the
  definition at all — see above)
- the raw authored document or author notes
- any authoring metadata not required to execute the simulation

**Currently inspectable by the candidate browser, because the
client-side engine needs it to run the incident:**
- the full authored rule table (conditions and effects)
- success/failure conditions and their thresholds
- timed-event definitions
- any other simulation logic the client engine requires

**This must be read as a known assessment-integrity limitation.**
Phase 5 does **not** claim hidden rules are protected from candidates —
this is not a secure candidate-safe payload implementation, and should
never be described as one. It generalizes an exposure that already
existed for Payment Retry Storm since Phase 1 (its rules were always
fully inspectable client-side) to organization-authored scenarios,
rather than introducing a new one.

> **Future architectural requirement — Server-authoritative simulation:**
> candidate clients send actions and receive only resulting
> state/events; rule definitions remain server-side at all times, never
> reaching the browser. This is explicitly out of scope for Phase 5.

### Authorization/privacy boundary

Organization-scenario access follows the same shape as the Phase 4
assessment boundary (Section "Authorization boundary" above):
`loadOrgScenario()` (`apps/web/src/lib/server/scenario-access.ts`)
verifies both organization membership and that the scenario's
`organizationId` matches, returning 404 otherwise — structurally
incapable of reaching a built-in scenario (which never has an
`organizationId`) or another organization's scenario. `canMutate(role)`
(owner/admin) gates every write (create, save draft, publish, archive,
create-new-draft); `member` may load the same editor and see full
published content, but only ever in a forced-disabled, read-only
render — never a separate, parallel view to keep in sync.

Scoring for a signed-in attempt is resolved exclusively server-side in
`/api/attempts/[attemptId]/complete`, branching on the attempt's
scenario's `ownershipType` — the client never computes or receives
scoring for a persisted attempt, for either built-in or
organization-authored scenarios.

## Phase 5.1 scope

Phase 5.1 closes the candidate-safe-payload limitation Phase 5
explicitly disclosed: for company assessments, **the candidate browser
no longer receives the executable scenario definition at all.**

> **Company assessments execute authoritatively on the server.**

> **Candidate clients never receive scenario rules, hidden outcome
> thresholds, or scoring configuration.**

### Three runtimes, one engine

`packages/simulator` remains the only place scenario behavior is ever
computed — Phase 5.1 does not introduce a second engine. What changes
per runtime is only *where* `simulate()` is called and *what* is sent
to the browser:

```text
Practice Runtime         Author Preview Runtime      Assessment Runtime
(attemptType: practice)  (org author's own scenario)  (attemptType: assessment)

Browser runs simulate()  Browser runs simulate()      Server runs simulate()
Full ScenarioSimulation   Full ScenarioSimulationDefinition   Candidate-safe
Definition sent client-   sent — the author owns the         RuntimeView only —
side (unchanged since     scenario and is allowed to         rules/conditions/
Phase 1/2.1)              inspect rules/effects/scoring       scoring never leave
                          (debug panel shows matched rule)    the server
```

Practice and author preview deliberately keep their existing
client-side simulation path — the spec's explicit scope is company
assessments first, and complicating preview to mirror candidate
security would blur the real distinction: an author previewing their
own scenario is not a candidate-privacy boundary (see Phase 5's
"Preview implementation").

### The RuntimeView: candidate-safe by construction

`packages/simulator/src/runtime-view.ts` exports `RuntimeView` — a type
with fields for `architecture`, `controls`, `state`, `events` (only
already-occurred events), `status`, and `incidentStartMs` only. It has
no field for `rules`, `timedEvents`, `successCondition`,
`failureCondition`, `scoring`, `actionClassifications`, or
`revenueLossRatePerMinute` — a handler that returns a `RuntimeView`
cannot leak any of them, because there is nowhere in the shape to put
them. `toRuntimeView(scenario, state, events)` projects full engine
state down to this shape; it is the only thing ever serialized into an
assessment runtime API response.

### Server-authoritative assessment runtime

`apps/web/src/lib/server/assessment-runtime.ts` is the single module
that mutates assessment attempt state:

- `bootstrapRuntime(attempt)` — reconstructs current state via
  `replayAttempt()` (the same deterministic replay Phase 4.1
  introduced) to the attempt's persisted checkpoint, and returns a
  `RuntimeView`. Used for both the initial mount and every
  refresh/return — there is no separate "resume" code path, since
  server-held state is always authoritative.
- `advanceRuntime(attemptId, attempt)` — server-authoritative time
  advancement. The server computes the allowed elapsed delta from its
  own stored `runtimeAnchoredAt` timestamp (`now - runtimeAnchoredAt`,
  capped at 30s per call), never from a client-supplied value — a
  candidate manipulating their browser clock or request payload cannot
  fast-forward or rewind the incident. A null `runtimeAnchoredAt` means
  the runtime clock is paused; advancing is then a pure no-op,
  enforcing Phase 4.1's "simulation time pauses while the console is
  not actively running" policy server-side rather than merely by the
  client not ticking.
- `submitAction(attempt, clientRequestId, changes, reasoning)` —
  applies a candidate's control changes through `simulate()`,
  validates each change against the scenario's own control
  definitions, and persists the resulting action group/events/
  checkpoint inside one database transaction.
- `resumeRuntimeClock` / `pauseRuntimeClock` — toggle
  `runtimeAnchoredAt`, called on explicit "Resume Assessment" and on
  `visibilitychange` respectively.

### Candidate action API

```text
POST /api/attempts/[attemptId]/actions
  { actionRequestId, changes: [{ controlKey, value }], reasoning }
       ↓
verify attempt ownership (identity-based, never org membership)
       ↓
reconstruct authoritative current state (replay)
       ↓
validate each control/value against the scenario's own definitions
       ↓
apply changes via simulate() — the only place behavior is computed
       ↓
persist action group + changes + events, in one transaction
       ↓
return RuntimeView only
```

### Timing model

```text
GET  /api/attempts/[attemptId]/runtime    bootstrap/resume (read-only)
POST /api/attempts/[attemptId]/advance    server-authoritative time step
POST /api/attempts/[attemptId]/actions    candidate action submission
POST /api/attempts/[attemptId]/pause      { action: "pause" | "resume" }
```

The client polls `advance` every 4 seconds while the console is
mounted, active, and the tab is visible — not once per simulated
second. The server is the only thing that decides how much simulation
time may legitimately pass; the client never predicts or locally
extrapolates elapsed time between polls, it only renders whatever
`RuntimeView` the last response carried.

### Idempotency and concurrency

`attempt_action_groups.clientRequestId` (nullable, unique per
`attemptId`) is the candidate's own idempotency key
(`POST /actions`'s `actionRequestId`) — never the reasoning text or a
timestamp, both of which are unsuitable identity (reasoning can
legitimately repeat; a timestamp does not survive a genuine retry of
the same logical request). A resubmission carrying the same key is
treated as already-applied, not applied a second time.

`submitAction` wraps sequence assignment, the action-group insert, its
changes, and the attempt's `runtimeVersion` bump inside one database
transaction that takes a row lock (`SELECT ... FOR UPDATE`) on the
attempt for its duration — two concurrent submissions (a double-click,
two open tabs, a network retry) cannot both read the same "next
sequence" value and race to insert it; the second transaction blocks
on the lock until the first commits, then proceeds against its
already-updated state.

`advanceRuntime` uses `attempts.runtimeVersion` as an optimistic token
instead: it reads the value, computes a result, and writes
`WHERE runtime_version = <value read>`. A write that affects zero rows
means a concurrent advance/action already moved the attempt forward
first; the caller re-reads and retries (bounded, falling back to
returning current state) rather than double-applying a delta or moving
elapsed time backwards.

### What a candidate assessment attempt can still resolve to

Terminal transitions (resolved/failed) are detected and scored
server-side, inside the same `advanceRuntime`/`submitAction` call that
produced them — never by the browser deciding an assessment is
complete. The existing scoring helper
(`apps/web/src/lib/server/scoring-helper.ts`, shared with the
pre-5.1 completion route) is the one place scoring bands are read,
branching on `ownershipType` exactly as before; Phase 5.1 did not
change scoring itself, only who may ever trigger and observe it being
computed.

## Phase 5.2 scope

Phase 5.2 makes organizations usable by real hiring teams: before this
phase, the organization creator became its owner, but there was no
product-supported way for a second person to join. Phase 5.2 adds
invitations, acceptance, roles, role changes, member removal, and a
Members UI — nothing beyond membership collaboration.

### Concepts

- **Organization** — unchanged since Phase 4: a company account
  (`id`, `name`, `slug`).
- **OrganizationMember** — unchanged since Phase 4: the association row
  (`organizationId` + `userId` + `role`) that grants a user access to an
  organization. A user keeps their single IncidentRank identity; this is
  never a separate account type.
- **OrganizationInvitation** (new, Phase 5.2) — a person invited to
  *join an organization's hiring team*. An opaque-token row
  (`organizationId`, `email`/`normalizedEmail`, `role`, `tokenHash`,
  `invitedByUserId`, `expiresAt`, `acceptedAt`, `revokedAt`) that becomes
  an `OrganizationMember` row only once a matching authenticated user
  accepts it.
- **AssessmentCandidate** — unchanged since Phase 4: a person invited to
  *take a hiring assessment* for a company. Structurally unrelated to
  `OrganizationInvitation`/`OrganizationMember` — see below.

> **Assessment candidates and organization members are independent
> relationships.**

`assessment_candidates` and `organization_invitations`/
`organization_members` are three separate tables with no foreign key
between the candidate-side and membership-side concepts. Completing an
assessment as a candidate — however many times, for however many
organizations — never creates, modifies, or implies any
`organization_members` row. The only way a user gains organization
access is accepting an `OrganizationInvitation` explicitly sent to them
by an existing owner/admin. This was true before Phase 5.2 (a candidate
could never administer the hiring organization's assessments), but
Phase 5.2 is the first phase to give the reverse direction — joining a
hiring team — a real, tested implementation rather than leaving it
entirely unreachable.

### Membership flow

```text
Organization Owner/Admin
        ↓
Invite by Email (role: admin | member — never owner directly)
        ↓
Opaque Invite Token (SHA-256 hash stored, plaintext shown once)
        ↓
Authenticated Matching User (verified Clerk email == invitation email)
        ↓
OrganizationMember (created + invitation marked accepted, atomically)
```

Invitations can only target `admin` or `member` — never `owner`
directly. Owner promotion happens only after membership already exists
(`changeMemberRole`, owner-only), mirroring the spec's explicit
constraint and keeping the invitation surface simple.

### Invitation security

`organization_invitations.tokenHash` reuses the exact security pattern
`assessment_candidates.inviteTokenHash` already established: a
cryptographically random opaque token (`generateInviteToken`,
`packages`-shared via `apps/web/src/lib/server/invite-token.ts`) is
generated per invitation; only its SHA-256 hash is ever stored; the
plaintext is returned to the inviter once, at creation time, in the
API response and the Members page's "Copy Invitation Link" control, and
is never persisted or retrievable again. The same `normalizeEmail`
(trim + lowercase, deliberately not Gmail-dot/plus-alias-aware) and
7-day expiry convention (`ORG_INVITE_EXPIRY_MS`, mirroring
`INVITE_EXPIRY_MS`) are reused rather than reinvented.

Invitation state is derived from timestamps, not a separate status
column, per the spec's "prefer fewer redundant state columns" guidance:

```text
acceptedAt != null → accepted
revokedAt  != null → revoked
now > expiresAt    → expired
otherwise          → pending
```

`acceptedAt` is checked first, so an invitation that was accepted and
later force-revoked or whose token later expires is still reported as
`"accepted"` — once accepted, the `organization_members` row is
authoritative and the invitation becomes purely historical. "At most
one active pending invitation per organization/email" is enforced at
the application layer (`createOrgInvitation` scans for an existing
pending+unexpired row before inserting), not a static DB unique
constraint — a static constraint would incorrectly block legitimately
re-inviting someone whose earlier invitation expired or was revoked.

### Acceptance

`acceptOrgInvitation(token, user, verifiedEmail)` mirrors the
assessment-candidate accept route's identity-matching mechanism
exactly: the signed-in user's **verified** Clerk primary email must
case-insensitively match the invitation's `normalizedEmail`. Membership
creation and marking the invitation accepted happen inside one database
transaction — a reader can never observe "invitation accepted" without
the corresponding `organization_members` row existing, or vice versa.
A duplicate acceptance by the same already-member user returns the
existing membership idempotently rather than erroring or creating a
second row; acceptance by a different user than the one who already
claimed it is rejected with the same safe "already accepted" response
the candidate-invite flow uses, never silently reassigning ownership of
the invitation.

### Role matrix

```text
owner
  → full organization administration
  → invite/remove members
  → change member roles (including promote-to-owner and demote-from-owner)
  → manage assessments, manage scenarios

admin
  → manage assessments, manage scenarios
  → invite members (role: admin or member)
  → remove member (not admin, not owner)
  → cannot change anyone's role

member
  → view organization, assessments/results, published scenario details
  → no mutations
```

`canInviteMembers`, `canManageMember`, and `canChangeRole`
(`apps/web/src/lib/server/organization-auth.ts`) are the three explicit,
independently-testable policy functions every membership-mutating route
calls — role checks are never scattered inline through routes. Role
changes are owner-only across the board; there is no partial
admin-can-change-some-roles carve-out, keeping the permission model as
simple as the spec requests.

### Last-owner invariant

> An organization must always have at least one owner.

Enforced server-side, unconditionally, inside `changeMemberRole` and
`removeMember` — never left to disabled UI controls alone. Before
demoting or removing a member currently holding `owner`, both functions
count the organization's current owners; if the count is `1`, the
mutation is rejected (`"last_owner"`) regardless of who the actor is,
including the owner acting on themselves. The only way to replace a
sole owner is: promote a different member to owner first (now two
owners exist), then demote or remove the original — at every
intermediate step, the organization has at least one owner.

### Privacy

Every membership/invitation function takes `organizationId` from an
already-authorized `loadOrganizationMembership` result, never a
client-supplied value trusted directly — the same boundary pattern
`loadOrgAssessment`/`loadOrgScenario` already established. Looking up
or mutating a specific invitation or member additionally re-checks that
row's own `organizationId` matches, so an organization can never list,
revoke, promote, or remove another organization's invitations or
members even if it somehow obtained a valid-looking id for one — the
lookup itself returns "not found," not merely "forbidden."

## Phase 6 scope

Phase 6 takes the built-in scenario catalog from 2 hand-wired scenarios
to 20 (the full launch set is spec'd at ~100; Phase 6 proves the
architecture scales to that without further engine or UI changes), and
turns `/incidents` from a static list into a searchable, filterable
library with a real free/paid access model. Two things had to converge
for 20 (or 100) scenarios to be addable as pure content: one generic
scoring engine, and one data-driven catalog that every consumer
(registry, seeding, library UI, scoring dispatch) reads from instead of
branching on scenario slug.

### One generic scoring engine, not one scorer per scenario

Before Phase 6, Payment Retry Storm had its own hand-written scoring
function (`packages/scoring/src/payment-retry-storm.ts`) — a second,
parallel way of computing a score that every new built-in scenario would
otherwise need to reinvent. Phase 6 generalizes the *authored* scenario
scoring engine (`packages/scenarios/src/authoring/score.ts`,
`scoreAuthoredAttempt`, introduced in Phase 5 for organization-authored
scenarios) into the **only** scoring engine in the system, and migrates
Payment Retry Storm onto it declaratively
(`packages/scenarios/src/payment-retry-storm/scoring.ts`). The original
hand-written scorer is kept as a byte-for-byte reference oracle in
`packages/scoring/src/payment-retry-storm-equivalence.test.ts` — 8 exact-
equivalence cases proving the declarative config reproduces it exactly —
rather than deleted outright, so the migration's correctness is provable
rather than asserted.

```text
AuthoredScoringConfig
  dimensions: [{ dimension, maxPoints, measure, bands | penalties,
                  naturalRecoveryOverride?, terminalOverrides? }]
  naturalRecoveryCondition?
       ↓
scoreAuthoredAttempt(config, ScoringInputs)   — the one scoring function
       ↓
0–1000 score + per-dimension breakdown
```

`AuthoredScoringMeasure` is a closed set (`recoveryTimeSeconds`,
`revenueLossUsd`, `dataIntegrity`, `criticalTimeRatio`,
`costIncreaseRatio`, `harmfulChangeCount`, `configurationChangeCount`) —
every dimension bands or penalizes against one of these, never a
scenario-specific formula. `terminalOverrides: { failed?, unresolved? }`
gives each dimension an explicit, author-controlled score for an attempt
that never successfully resolved, replacing what was previously a
sentinel-value hack (`if (resolvedAtMs === null) return 0`) with a real,
validated schema field. This generalization is what makes "scenario #21
needs no scoring code" true: every new scenario's `scoring.ts` is pure
declarative data read by the same function every other scenario's
`scoring.ts` is read by.

> **A scoring regression this phase's own verification caught**: giving
> every dimension a `terminalOverrides.unresolved: 0` is correct in
> isolation, but if a scenario's baseline (no action) and harmful (the
> plausible-but-wrong action) paths both end up unresolved, both get
> zeroed identically on the dimensions that override carries — collapsing
> a well-authored "harmful action should score clearly worse than doing
> nothing" teaching point into a 10–15-point difference carried entirely
> by the `operationalEfficiency` penalty. This affected 7 of the 20
> launch scenarios and was fixed by tuning each scenario's own
> `terminalOverrides`/bands/penalties and, in two cases, its rules —
> see `docs/implementation_plan/outputs/phase6-completion-report.md` for
> the full per-scenario breakdown. This is a content-authoring failure
> mode specific to how a scenario's bands/overrides are tuned, not an
> engine defect — the schema already has the tools (`terminalOverrides`,
> distinct `failed`/`unresolved` values, authored rule values that make a
> harmful path *measurably* worse rather than just differently labeled)
> to avoid it. Phase 6 treats this as a standing verification concern for
> every future scenario's scoring config, not a one-time fix.

### The built-in scenario catalog: one map, not N branches

`BUILT_IN_SCENARIO_CATALOG` (`packages/scenarios/src/library/catalog.ts`)
is a single `Record<slug, { definition, candidateUI, scoring }>` that
every data-driven consumer resolves against:

```text
BUILT_IN_SCENARIO_CATALOG
       ├─ scenario-registry.ts   — isPlayableBuiltinScenario, version resolution
       ├─ seed.ts                — DB seeding (packages/db)
       ├─ library-browser.tsx    — /incidents search/filter/sort
       ├─ [slug]/page.tsx        — practice route + locked-state rendering
       └─ scoring dispatch       — scoreAttempt resolves config from here,
                                    never a slug switch statement
```

Adding scenario #21 means adding one entry to this map — no new route,
no new scoring branch, no new seeding code. `packages/db/src/seed.ts`
iterates `listBuiltInScenarioEntries(catalog)` generically; it has no
knowledge of any individual scenario's slug. This was proven directly:
re-running `pnpm db:seed` after authoring all 18 new scenarios (and again
after the scoring-fix pass) required zero code changes and produced
"Seed complete (20 built-in scenario(s))" both times.

### Scoped slug uniqueness

Built-in and organization-owned scenarios share one `scenarios.slug`
column but must never collide *within* their own ownership scope while
remaining free to reuse a slug *across* scopes (an organization should be
able to name their own private scenario `payment-retry-storm` without
colliding with the built-in one). A single global unique index can't
express this — Postgres partial unique indexes can:

```sql
UNIQUE (slug)                    WHERE ownership_type = 'incidentrank'
UNIQUE (organization_id, slug)   WHERE ownership_type = 'organization'
```

(`packages/db/drizzle/0006_kind_dracula.sql`.) `scenario-registry.ts`'s
`isPlayableBuiltinScenario` checks `ownershipType === "incidentrank"`
explicitly rather than inferring it from the slug alone — this is also
the fix for a real privacy bug the Phase 6 work surfaced: an
organization-owned scenario that happened to share a slug pattern with a
built-in one could otherwise be served through the public built-in
route.

### Practice access: one function, no fake entitlements

```text
evaluatePracticeAccess({ isFree }) -> { allowed: true }
                                     | { allowed: false, reason: "paid_scenario_locked" }
```

(`apps/web/src/lib/practice-access.ts`, isomorphic — the same function
the library UI's lock badge and every server-side enforcement point both
call, so they cannot drift apart.) Per spec: there is no billing or
entitlement system yet. Free scenarios are always playable, including
anonymous/signed-out candidates; paid scenarios are locked for everyone
in practice mode, signed in or not, until a real personal-entitlement
system exists. The function deliberately does not grow a fake
entitlement to make testing more convenient — see "Local-dev-only paid
unlock" below for how that need is actually met.

This is **practice** access only. Company-assigned assessment attempts
never call this function at all — assessment entitlement is the
completely separate authorization path established in Phase 4
(organization → assessment → candidate →`candidate.attemptId`), which
has no concept of `isFree` and never consults the catalog's pricing.
Per spec, this means a candidate assigned a paid scenario through an
assessment can complete it normally, and remains unable to start that
same scenario independently in practice mode afterward — proven by
`apps/web/src/lib/server/paid-scenario-assessment-override.test.ts`.

### Local-dev-only paid unlock

A developer running the app locally needs to exercise paid-scenario
practice flows without a real entitlement system existing yet. Rather
than inventing a fake entitlement inside `evaluatePracticeAccess` itself
(which would blur the one real policy function with a test convenience,
and risk leaking into a deployed environment), this is a narrow,
separately-gated override:

```text
DEV_UNLOCK_PAID_SCENARIOS=true
       +
NODE_ENV !== "production"
       +
request Host header is localhost / 127.0.0.1 / ::1
       ↓
evaluatePracticeAccess(scenario, { devUnlockPaid: true })
```

(`apps/web/src/lib/server/dev-unlock.ts`.) All three conditions are
required — the env flag alone is not trusted, because an env var can be
set by mistake on a deployed preview/staging environment; the host check
means that mistake still unlocks nothing there. The three practice-access
call sites (`POST /api/attempts`, `POST /api/attempts/score-preview`, and
the `/incidents/[slug]` server component) each compute this flag from
their own request/headers and pass it through as an explicit opt — it is
never a hidden global. The library browser's "🔒 Paid" badge intentionally
does **not** read this flag: the scenario is still genuinely paid
product-wise, so the badge stays honest even while a developer's own
`/incidents/[slug]` session is unlocked underneath it.

### Scenario library: search, filter, sort, URL state

`/incidents` (`apps/web/src/app/incidents/library-browser.tsx`) reads and
writes its entire filter state as query parameters — category,
difficulty, access (all/free/paid), tags (OR within the group), text
search (name/description/category/tags), progress status for signed-in
users, and sort — so the page is shareable, bookmarkable, and survives a
refresh with no client-side global state required. Filter groups combine
with AND semantics; multi-select values within one group (e.g. multiple
tags) combine with OR, matching the spec's documented behavior exactly.

Practice progress (`apps/web/src/lib/server/practice-progress.ts`,
`getPracticeProgressBySlug()`) is scoped to `attemptType: "practice"`
only — assessment attempts, scored or not, never affect a card's "Best:
N / M attempts" display or the signed-in "Completed" filter. A
signed-out visitor sees no progress indicator at all rather than an
empty/zero one, and the function never creates an account merely from
browsing the library.

Organization-owned scenarios are structurally excluded from every public
library surface (search, filters, the catalog itself) — they were never
part of `BUILT_IN_SCENARIO_CATALOG` to begin with, so there is no filter
or query to bypass; privacy here is a type-level absence, not a runtime
check.

## Phase 6.1 scope

Every scenario through Phase 6 ends an incident the moment the engine's
own `successCondition` is sustained long enough — resolution is purely
mechanical. Phase 6.1 adds a second completion mode where the candidate,
not the engine, decides when to stop:

### Completion Modes

```text
automatic           — the engine resolves the incident itself once
                       successCondition is sustained; unchanged since
                       Phase 1
candidate_declared  — the engine only TRACKS whether successCondition
                       (and, optionally, a named acceptableCondition) is
                       currently sustained; it never writes "resolved"
                       on its own. Only an explicit Finish declaration
                       can end the incident as resolved.
```

A scenario opts in via `completion: { mode: "candidate_declared",
acceptableCondition? }` on its `ScenarioSimulationDefinition`
(`packages/simulator/src/types.ts`); omitting `completion` entirely
defaults to `automatic`, so every scenario authored before Phase 6.1
compiles and behaves identically with no changes.

> **Candidate completion is a final assessment decision, not a hint
> request.**

If "Finish Incident" merely answered "not stable yet, keep going," a
candidate could reverse-engineer the hidden success criteria by
repeatedly probing it. Finish is irreversible per attempt — at most one
declaration, ever (enforced by a unique `(attemptId, finishRequestId)`
index, see Idempotency below) — and the dialog that triggers it
deliberately never indicates whether the current state looks acceptable
(`apps/web/src/components/scenario-console/finish-incident-dialog.tsx`).

### Candidate-declared lifecycle

```text
Incident Starts
     ↓
Candidate Decisions           (control changes, same as automatic mode)
     ↓
System Evolves                (engine tracks sustain state every tick,
     ↓                         never auto-resolves for this mode)
Candidate Declares Finished   (POST .../finish or .../finish-preview)
     ↓
Server Evaluates Final State  (replay persisted actions, evaluate
     ↓                         completion eligibility from tracked state)
Resolved OR Declared Unstable
```

> **Failure conditions remain automatic even in candidate-declared
> scenarios.**

`failureCondition` is evaluated unconditionally every tick regardless of
completion mode (`packages/simulator/src/tick.ts`) — a candidate_declared
scenario that crosses its failure threshold completes automatically via
`POST /api/attempts/:attemptId/complete`, with no Finish click involved.
Finish can never override an already-authoritative failure: if the
replayed state's `status` is `"failed"` when Finish is called, the
outcome is `declared_unstable` at the attempt-outcome level, never
silently converted to `resolved`.

### One engine-tracked sustain state, one gated write

`tick.ts`'s existing "condition true continuously since timestamp X"
tracking (`TransitionTrackingState.consecutiveSuccessSeconds`,
`consecutiveAcceptableSeconds`) runs **unconditionally for every
scenario**, regardless of completion mode — it resets to `0` the instant
the condition goes false, exactly as before Phase 6.1. The only change
introduced by Phase 6.1 is that the final write which flips
`state.status` to `"resolved"` is skipped when
`completionMode === "candidate_declared"`. Finish reads this same
already-tracked state (`evaluateCompletionEligibility`,
`packages/simulator/src/completion.ts`) rather than re-implementing
success-condition evaluation a second time — there is exactly one
"is the system stable" evaluator in the codebase, shared by the engine's
own tick loop and by Finish. This also means "was stable earlier,
regressed, then Finish is clicked" requires no special-casing: the
regression tick already reset the counter to `0` before Finish ever
runs, so `evaluateCompletionEligibility` correctly reports ineligible —
Finish asks whether the system is stable *now*, never whether it was
stable at some earlier point.

### Two-tier completion: optimal vs. acceptable

A candidate_declared scenario may additionally define
`acceptableCondition` — a second, explicitly authored, genuinely-safe
bar distinct from the full `successCondition`. Finish resolves if
*either* condition is currently sustained: `successCondition` sustained →
`completionTier: "optimal"`; else `acceptableCondition` sustained →
`completionTier: "acceptable"`; else `declared_unstable`.
`acceptableCondition` is reserved for scenarios with a real engineering
tradeoff — a state that is safe to hand back but deliberately imperfect
(e.g. Consumer Rebalance Storm's blue-green deploy strategy, which clears
the throughput/latency bars but settles for a lower stable-time ratio
than the fully-optimal fix) — never a lowered version of the same bar
chosen for score-spacing convenience. Of the 20 built-in scenarios, two
define an `acceptableCondition`: Consumer Rebalance Storm and Kafka
Partition Skew (see classification table below).

Kafka Partition Skew's tiers additionally required a new engine-level
capability: a candidate-visible `orderingMode: "preserved" | "degraded"`
state field, set directly by whichever recovery rule matched (salted-key
→ `"preserved"`; round-robin → `"degraded"`), so the completion
conditions — and scoring — can tell apart two tradeoffs that previously
collapsed into the same throughput/lag numbers. This is never inferred
indirectly inside the scorer from "which control value was chosen"; the
simulator state itself carries the authoritative signal.

### Finish Incident API design

Server-authoritative for every context — signed-in practice,
assessment, and anonymous practice alike; only persistence/auth differs:

```text
Signed-in practice / Assessment   →  POST /api/attempts/:attemptId/finish
                                      (persisted attempt; loads pinned
                                      scenario version, replays action
                                      history, evaluates, persists)

Anonymous practice                →  POST /api/attempts/finish-preview
                                      (stateless; client sends scenario
                                      slug/version + replayable action
                                      groups + elapsed time, never a
                                      claimed final state/status/score)
```

The client never sends `{status: "resolved", score: 910}` for Finish —
only an idempotency key, an optional completion note, and (for the
stateless anonymous path) its own replayable public action history. The
server independently replays through the exact same
`packages/simulator` engine every other runtime uses and decides the
outcome; `finishAttempt` and `finish-preview`'s route handler share one
completion-decision core (`evaluateCandidateDeclaredFinish`,
`packages/simulator/src/completion.ts`) rather than two independent
implementations. The pre-6.1 `/complete` route is narrowed to represent
only automatic terminal events (engine-detected success for automatic
scenarios, or failure for any mode) — it explicitly rejects a
candidate_declared scenario's `resolved` claim with a 400, since only
Finish may produce that outcome for such a scenario.

Both the assessment server runtime (`advanceRuntime`/`submitAction` in
`apps/web/src/lib/server/assessment-runtime.ts`) and the practice client
hook (`apps/web/src/lib/use-incident-attempt.ts`) share the same
`isLocallyTerminal(state, completionMode)` predicate
(`packages/simulator/src/completion.ts`) to decide whether a tick result
counts as a terminal event without Finish — automatic mode: resolved or
failed; candidate_declared mode: failed only. This is the one place
"should this stop ticking without a Finish click" is decided, reused by
every runtime rather than reimplemented per runtime.

> **The key invariant: client simulation = UX / immediate feedback;
> server replay at Finish = authority.** If client and server ever
> disagree, the server wins.

### Completion idempotency and concurrency

`finishAttempt` mirrors `submitAction`'s transaction + row-lock pattern:
a client-generated `finishRequestId` is checked against the
freshly-row-locked attempt **inside** the transaction, before the
terminal check — so a genuinely retried request (same key, the first
attempt already succeeded) is recognized as idempotent even if the
caller's local `attempt` snapshot is stale, and a concurrent request
racing an already-authoritative automatic failure is rejected rather
than silently overwriting it. Both `/complete` (automatic) and
`finishAttempt` (candidate declaration) converge on one shared
persistence primitive (`persistTerminalAttempt`,
`apps/web/src/lib/server/terminal-attempt.ts`) scoped to
`WHERE status = 'in_progress'`, so "completed, one outcome, score
persisted exactly once" is enforced in exactly one place regardless of
which trigger reached it first.

### Attempt lifecycle split from incident outcome

```ts
type AttemptStatus  = "in_progress" | "completed" | "abandoned";
type IncidentOutcome = "resolved" | "failed" | "declared_unstable"
                      | "timed_out" | null;
```

`status` means only "has this attempt ended," never "did it succeed" —
`completed + declared_unstable` is a normal, common state, not an edge
case. Invariant: `in_progress → outcome=null`; `completed → outcome`
required; `abandoned → outcome=null`. `apps/web/src/lib/
attempt-lifecycle.ts` exports `isAttemptActive`/`isAttemptTerminal`/
`isIncidentResolved` predicates used everywhere instead of raw
status/outcome checks.

### Completion-note persistence

`completionNote` (nullable text), `completionDeclaredAt` (nullable
timestamp), `completionSimulationTimeMs` (nullable integer), and
`completionTier` live as columns on `attempts`, independent of
`outcome` — never inferred from each other. All four are `null` for
every non-Finish path (automatic resolution, automatic failure,
abandonment, still-in-progress).

> **Candidate completion notes are recorded but never scored.** The
> note is persisted for hiring-manager/practice-result display only;
> `scoreAuthoredAttempt` has no parameter through which note text could
> reach it.

### Scoring convergence for candidate-declared outcomes

The generic scorer (`packages/scenarios/src/authoring/score.ts`) was
built when every scenario resolved automatically and `resolvedAtMs` was
always reliable — `terminalOverrides`, `recoveryTimeSeconds`, and
`criticalTimeRatio` all key off it. Finish never mutates engine state, so
`state.resolvedAtMs` stays `null` even for a genuinely resolved
declaration. `extractScoringInputs` (`packages/simulator/src/scoring.ts`)
gained an optional `resolvedAtMsOverride`: when Finish determines
`outcome: "resolved"`, it derives a scoring-only timestamp from the
**accepted tier's own sustained-since instant**
(`state.simulationTimeMs − consecutiveSuccessSeconds × 1000` for
`"optimal"`, or the `consecutiveAcceptableSeconds` counter for
`"acceptable"`) — never the wall-clock moment the candidate happened to
click Finish. `declared_unstable` outcomes get no synthetic timestamp at
all and fall through to the existing `terminalOverrides.unresolved`
bucket — the same bucket a plain "never resolved" automatic attempt
already used, deliberately not a third `declaredUnstable` override key.

A `declared_unstable` attempt still earns normal credit on any dimension
with no `unresolved` override (customer impact, data integrity, cost
efficiency, operational efficiency typically have none) — only
recovery/reliability, which do define one, are zeroed.

Rewarding Kafka Partition Skew's `orderingMode` tradeoff required a
second, genuinely generic extension rather than a scenario-specific one:
`ScoringInputs` gained `finalStringValues: Record<string, string>` (a
sibling of the existing `finalNumericValues`, populated the same way),
and `AuthoredScoringMeasure` gained two parameterized forms —
`{ type: "finalStringEquals" | "finalStringNotEquals", field, value }` —
so any scenario's string-valued state can drive a band or penalty
declaratively. The shared scorer still has zero scenario-specific code;
it understands generic typed state, never "Kafka," "ordering," or any
other scenario concept by name.

### Assessment parity

The server-authoritative assessment runtime needed the identical
candidate_declared gate practice already had: `advanceRuntime` and
`submitAction` (`apps/web/src/lib/server/assessment-runtime.ts`) both
call `isLocallyTerminal` before persisting a terminal result, so
sustained success for a candidate_declared scenario leaves an assessment
attempt `in_progress` exactly as it does in practice — only a real
`POST .../finish` call (the same endpoint and the same `finishAttempt`
function practice uses) can resolve it. `RuntimeView`
(`packages/simulator/src/runtime-view.ts`) gained a `completionMode`
field so the assessment console knows whether to render the Finish
control — deliberately static scenario metadata, never a live
eligibility signal; the underlying sustain-tracking state itself is
never serialized to any client, assessment or practice.

### Scenario classification: automatic vs. candidate-declared

Every one of the 20 built-in scenarios was reviewed against its actual
authored rules (not its title or difficulty) using one governing
question: *does "when to stop" require genuine stabilization judgment,
or is there an objectively clean recovery event?*

```text
candidate_declared (7)              automatic (13)
───────────────────────             ──────────────────────────────
Payment Retry Storm                 Kafka Consumer Lag
Database Connection Saturation      Autoscaling Failure
Poison Message Loop                 Cascading Service Failure
Kafka Partition Skew                Database Lock Contention
Consumer Rebalance Storm            Downstream Dependency Failure
Authentication Service Degradation  Read Replica Lag
Rate Limit Failure                  Slow Query Regression
                                     Third-Party API Latency
                                     Thundering Herd
                                     Memory Leak
                                     Bad Configuration Rollout
                                     Deployment Regression
                                     Cache Stampede
```

Rationale, by scenario:

- **Payment Retry Storm** — candidate_declared, no acceptable tier. The
  payment provider recovers on its own schedule regardless of candidate
  action; Finish tests whether the candidate recognizes durable vs.
  natural recovery before declaring done, not a tier choice. The two
  partial-mitigation states (82–92% checkout success) still represent
  8–18% of traffic actively failing — not a safe handback, so only the
  full successCondition is Finish-eligible to `resolved`.
- **Database Connection Saturation** — candidate_declared, no acceptable
  tier. A pool-only mitigation looks stable but silently reverts under a
  later batch-job escalation; the scenario was redesigned to expose a
  genuinely observable precursor signal (rising `queuedConnections`)
  before that escalation rather than relying on a hidden timer, per the
  fairness principle below.
- **Poison Message Loop** — candidate_declared, no acceptable tier.
  Every reachable stable state is binary (fully recovered, slower-but-
  fully-recovered, or still actively broken) — no genuine safe-but-
  imperfect middle state exists.
- **Kafka Partition Skew** — candidate_declared, **with** an acceptable
  tier. Round-robin partitioning fully resolves throughput/lag but
  sacrifices per-tenant ordering — a real, named, bounded tradeoff
  (`orderingMode: "degraded"`), not a weaker fix.
- **Consumer Rebalance Storm** — candidate_declared, **with** an
  acceptable tier. The blue-green deploy strategy clears the
  throughput/status bars but settles for an 85% stable-time ratio
  against the optimal 90% bar — a genuine, bounded tradeoff, distinct
  from the strictly weaker `rolling-batched` partial (2,600 throughput,
  below even the acceptable bar).
- **Authentication Service Degradation** — candidate_declared, no
  acceptable tier. Only one genuinely safe state exists (full capacity
  scaling); the scenario's real teaching point is a security-bypass trap
  that looks numerically healthy while `authServiceStatus` goes
  critical — "is this actually safe," not a tier choice.
- **Rate Limit Failure** — candidate_declared, no acceptable tier. Both
  partial-mitigation tiers (14% and 28% still violating the provider's
  limit) are "less-bad," not "safe" — the same reasoning that rejected a
  Payment Retry Storm acceptable tier.
- All 13 **automatic** scenarios have an objectively clean recovery
  event with no legitimate safe-but-imperfect middle state worth testing
  stabilization judgment against — including **Kafka Consumer Lag**,
  reclassified from an initial candidate_declared proposal back to
  automatic after a state audit found its apparent "unsafe-commit
  tradeoff" tier was simply unsafe on both of its own metrics, not a
  real tradeoff.

### Fairness: delayed escalations need an observable precursor

A hidden timer with zero observable lead-up before it fires tests
whether the candidate knows the scenario author's hidden script, not
whether they can reason about a production system. Every
candidate_declared scenario with a delayed/second-wave trigger was
audited for this: Database Connection Saturation's pool-only mitigation
previously looked indefinitely stable with no warning before silently
reverting at a fixed hidden time, and was fixed by adding a genuinely
rising, candidate-visible `queuedConnections` metric during the lead-up
window — never an explicit named countdown. Every other candidate_
declared scenario's delayed trigger was confirmed to be either narrative-
only (never read by any rule) or structurally unreachable once a
candidate has taken any real mitigating action.

### Post-Incident Practice Explanation

Candidates can see, per action, why it was classified beneficial/
neutral/harmful and what the scenario author intended — but only after a
signed-in practice attempt is terminal, and never during an assessment
(even a completed one). This closes the product requirement to "explain
what happened with each candidate action" after practice, without
leaking the hidden evaluator into anything live.

`ActionClassificationRule`/`AuthoredActionClassification` gained two
optional fields: `id` (a stable identity for the rule — intentionally
neutral, e.g. `acr_1`, never self-descriptive of the authored logic) and
`feedback: { title, explanation }` (the educational text). Both are
presentation metadata only: never read by `simulate()`/resolution logic,
never affecting scoring.

The leak boundary is enforced structurally, not by a client-side
"don't render yet" gate:

- `classifyAction()` itself never returns feedback text — only
  `{ outcome, matchedRuleId }` — because it runs **client-side** during
  live practice ticks (the practice console calls `simulate()` directly
  in the browser). Anything this function returned would already be in
  the browser's bundle/runtime state before any server boundary existed.
- `matchedRuleId`/feedback are never written into `CONFIG_CHANGED`
  event metadata, so they never reach persisted events or any live
  client state at all.
- A new pure function, `reviewAttempt()`, independently replays an
  attempt's persisted action groups and re-runs classification at the
  exact triggers/state present when each action was originally applied
  — never by inferring from final state, since `whenTriggerEquals`-gated
  rules can match differently at different points in time.
- A server-only helper, `reviewPracticeAttemptFeedback()`, gates on
  `attemptType === "practice"` and `isAttemptTerminal()` before calling
  `reviewAttempt()`, then maps the result to a narrow DTO with no field
  a hidden rule id could occupy.
- `GET /api/attempts/:attemptId/review` is the only endpoint that ever
  returns feedback text — fetched by the result screen only once
  mounted (already terminal), and only for a persisted practice attempt.
  Assessment screens were never wired to this endpoint at all.

```text
active practice (browser)     -> classification only, for existing
                                  numberOfBeneficialChanges/
                                  numberOfHarmfulChanges bookkeeping
completed practice review     -> classification + authored title +
  (server, terminal-only)        explanation, resolved via independent
                                  server-side replay + reclassification
assessments (any state)       -> never returns educational feedback
hiring-manager view           -> unchanged: action history, reasoning,
                                  outcome, score — no feedback text
```

Payment Retry Storm's `actionClassifications` carry real authored
feedback for all five rules, matching the product spec's own example
("Reduced retry amplification... lowering retries reduced pressure on
the degraded payment provider") — a concrete, verifiable instance of the
feature, not just an unused schema capability.

### Important constraints carried forward

Phase 6.1 deliberately does **not** introduce: LLM evaluation of
completion notes, natural-language scoring, AI judgment of candidate
reasoning, browser surveillance, webcam/microphone monitoring, arbitrary
scripting, freeform infrastructure commands, shell access, collaborative
incident response, billing, or scenarios 21–40. This phase is scoped to
richer decision semantics and closing quality gaps in the existing 20
scenarios — not an expansion of what candidates can do or what the
platform observes.
