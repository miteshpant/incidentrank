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
