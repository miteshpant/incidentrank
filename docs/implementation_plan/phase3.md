# IncidentRank — Phase 3: Accounts, Attempts, Scores and Leaderboard

Before making any changes:

1. Read the root `README.md`.
2. Read `docs/architecture.md`.
3. Read `docs/scenarios/payment-retry-storm.md`.
4. Review the completed Phase 2 and Phase 2.1 implementation.
5. Treat the README as the product source of truth.
6. Do not begin company/organization functionality.
7. Do not add AI or LLM features.
8. Do not build scenario authoring.
9. Do not change Payment Retry Storm behavior unless a real persistence/scoring integration bug requires it.

Phase 0, Phase 1, Phase 2, and Phase 2.1 are complete.

The goal of Phase 3 is to turn IncidentRank from an in-memory playground into a persistent user product.

Users should be able to:

- create/sign into an IncidentRank account
- complete practice incidents
- save attempts
- receive a 0–1000 IncidentRank score
- view their attempt history
- retry incidents
- see a public leaderboard
- choose whether their leaderboard identity is visible publicly

This phase is still practice-only.

Do NOT build companies or candidate assessments yet.

---

# Authentication

Use a third-party authentication provider.

Preferred:

**Clerk**

Use current stable packages compatible with the existing Next.js version.

Support at minimum:

- email authentication
- Google authentication if straightforward with Clerk configuration

Do not build password storage or auth logic ourselves.

IncidentRank's database should store a local user row linked to the external auth identity.

Conceptually:

```text
User
----------------
id
authProviderId
displayName
createdAt
updatedAt
leaderboardVisible
```

Do not create a permanent "candidate" role.

A user is simply a user.

---

# Database

Use PostgreSQL.

Preferred ORM:

**Drizzle**

Keep the database model deliberately small.

Add only what Phase 3 requires.

Do not introduce Redis, Kafka, Elasticsearch, or additional storage systems.

---

# Core Data Model

At minimum create:

```text
users
scenarios
attempts
attempt_action_groups
attempt_action_changes
attempt_events
```

You may make small naming/schema changes if justified.

---

# User

Conceptually:

```ts
User {
  id
  authProviderId
  displayName
  leaderboardVisible
  createdAt
  updatedAt
}
```

`authProviderId` must be unique.

---

# Scenario

Persist identity/version information for playable scenarios.

Do NOT duplicate the entire scenario definition into the database yet.

The source-controlled scenario package remains the executable source of truth.

Conceptually:

```ts
Scenario {
  id
  slug
  version
  name
  isActive
  createdAt
}
```

For Phase 3 seed:

```text
payment-retry-storm
version 1
```

Versioning is important.

An attempt should always record which scenario version it used.

---

# Attempt

An attempt represents one user's complete run of a scenario.

Conceptually:

```ts
Attempt {
  id

  userId
  scenarioId
  scenarioVersion

  status
  startedAt
  incidentStartedAt
  completedAt

  score

  recoveryScore
  customerImpactScore
  dataIntegrityScore
  reliabilityScore
  costEfficiencyScore
  operationalEfficiencyScore

  recoveryTimeMs
  revenueLossUsd

  peakSeverityRank
  peakInfrastructureCostUsd
  peakKafkaLagMessages

  numberOfConfigurationChanges
  numberOfBeneficialChanges
  numberOfHarmfulChanges

  finalStateJson

  createdAt
}
```

Use JSON only where storing structured snapshot data is genuinely useful.

Do not store everything as one giant JSON blob.

---

# Immutable Attempt History

A major IncidentRank principle is:

> Attempts should be replayable.

Persist:

1. candidate decision groups
2. individual changes inside each group
3. system/engine timeline events

Do not store only the final score.

---

# Candidate Decision Groups

Persist the Phase 2.1 `CandidateActionGroup` concept.

Conceptually:

```ts
AttemptActionGroup {
  id
  attemptId

  sequence
  elapsedMs

  reasoning

  createdAt
}
```

Reasoning remains optional.

---

# Action Changes

Each group contains one or more configuration changes.

Conceptually:

```ts
AttemptActionChange {
  id
  actionGroupId

  sequence

  controlKey
  previousValue
  newValue
}
```

Values may use a small JSON-compatible representation if required because controls contain strings/numbers/booleans.

Preserve ordering.

---

# Engine Events

Persist engine/system events separately.

Conceptually:

```ts
AttemptEvent {
  id
  attemptId

  sequence
  elapsedMs

  type
  message
  metadataJson
}
```

Do not evaluate candidate reasoning here.

---

# Attempt Lifecycle

When a signed-in user clicks:

**Acknowledge Incident**

create a new attempt.

Status:

```text
in_progress
```

As the scenario progresses, keep state in the browser as today.

Do NOT write to the database every second.

Persistence should occur around meaningful events.

Recommended:

- attempt created at start
- candidate action groups persisted after successful Apply
- associated engine events persisted
- terminal result persisted when resolved/failed

If useful, selected meaningful system events may be persisted as they occur.

Avoid excessive database writes for every clock tick.

---

# Refresh / Abandoned Attempts

For Phase 3, we do NOT need sophisticated resume support.

If the page refreshes mid-attempt, it is acceptable to mark the attempt abandoned or leave it `in_progress`.

However, do not silently count abandoned attempts as completed leaderboard attempts.

Document the current behavior.

Resume/reconnect can come later.

---

# IncidentRank Score

Phase 3 introduces the first actual:

```text
0–1000
```

IncidentRank score.

The score must be deterministic and based entirely on objective attempt data.

No AI.

No LLM.

No subjective text evaluation.

Candidate reasoning does NOT affect score.

---

# Score Dimensions

Use the existing product weighting:

```text
Recovery                  300
Customer Impact           200
Data Integrity            200
Reliability               150
Cost Efficiency           100
Operational Efficiency     50
                         ----
                         1000
```

---

# Payment Retry Storm Scoring

Create a scenario-specific scoring definition/function.

The generic scoring framework may be reusable, but do not over-generalize.

Payment Retry Storm already exposes the necessary raw scoring inputs.

Score using authored thresholds/bands.

Do NOT invent system-performance equations.

---

# Recovery — 300 points

Use time from incident start to incident resolution.

Example authored bands:

```text
<= 2:30          300
<= 3:30          275
<= 5:00          240
<= 7:00          200
<= 10:00         150
<= 15:00         80
natural recovery 40
failed            0
```

Use interpolated values within bands only if it keeps code simple and understandable.

Discrete bands are acceptable.

---

# Customer Impact — 200 points

Use cumulative estimated revenue loss.

Example:

```text
<= $20,000       200
<= $30,000       180
<= $50,000       150
<= $80,000       110
<= $120,000       70
<= $168,000       30
> $168,000         0
```

Failed attempts may score very low here depending on recorded loss.

---

# Data Integrity — 200 points

Payment Retry Storm currently does not model actual duplicate/lost transactions in depth.

For this scenario, begin with:

```text
base = 200
```

Apply authored penalties for actions/state paths explicitly associated with data-integrity risk, if such metadata already exists or can be added cleanly.

If the current scenario does NOT provide a legitimate data-integrity signal:

do NOT fabricate one.

Instead temporarily award the full 200 points and document:

> Payment Retry Storm v1 does not yet differentiate data-integrity outcomes.

This dimension becomes more meaningful in future scenarios such as Duplicate Payment Incident.

Do not change scenario behavior merely to create scoring variance.

---

# Reliability — 150 points

Use authored outcome signals such as:

- resolved vs failed
- time spent critical
- harmful configuration effects
- stability of final state

Example:

```text
resolved with stable state         up to 150
resolved after prolonged critical  lower
natural recovery                   significantly lower
failed                             0
```

Keep rules explicit and documented.

---

# Cost Efficiency — 100 points

Use:

```text
initial infrastructure cost
peak infrastructure cost
final infrastructure cost
```

Example:

```text
no cost increase          100
<= 10% increase            90
<= 25% increase            70
<= 50% increase            40
> 50% increase             10
```

A candidate should not be rewarded for brute-force scaling.

---

# Operational Efficiency — 50 points

Use objective action history.

Potential factors:

- number of configuration changes
- harmful changes
- unnecessary churn

Example:

```text
0 harmful changes         strong
1 harmful change          moderate penalty
2+ harmful changes        larger penalty
many total changes        small additional penalty
```

Do NOT evaluate the written reasoning.

A concise successful path should generally score better than random configuration thrashing.

---

# Failed Attempts

Failed attempts should still receive a score.

Do NOT automatically make all dimensions zero.

For example, a candidate might fail but still demonstrate good cost discipline.

However:

```text
Recovery = 0
Reliability = 0 or near 0
```

would be expected.

Overall failed scores should naturally be substantially below successful attempts.

---

# Score Transparency

On the result screen show:

```text
IncidentRank

847 / 1000
```

Then dimension breakdown:

```text
Recovery                   270 / 300
Customer Impact            170 / 200
Data Integrity             200 / 200
Reliability                125 / 150
Cost Efficiency             62 / 100
Operational Efficiency      20 / 50
```

Do not hide the components behind a mysterious algorithm.

Users should understand broadly where their score came from.

---

# Practice Result Screen

Upgrade the current Phase 2.1 result screen.

Show:

1. IncidentRank score
2. score breakdown
3. recovery statistics
4. candidate decision history
5. candidate reasoning
6. system outcome
7. Try Again
8. Back to Incidents
9. View Attempt History

Do not give an AI-written explanation yet.

---

# Attempt Review

Add:

```text
/attempts
```

Authenticated users can see their attempts.

Example:

```text
Payment Retry Storm

Attempt        Score      Outcome       Recovery
Oct 19         847        Resolved      3:22
Oct 19         721        Resolved      6:14
Oct 18         411        Failed        3:21
```

Sort newest first.

---

# Attempt Detail

Add:

```text
/attempts/[attemptId]
```

Show:

- scenario
- date
- score
- score breakdown
- result stats
- candidate decision groups
- reasoning
- system event timeline

This page is the first persistent "replay record."

Full animated playback is NOT required.

Chronological reconstruction is enough.

---

# Public Leaderboard

Add a leaderboard for:

**Payment Retry Storm**

Possible route:

```text
/incidents/payment-retry-storm/leaderboard
```

or:

```text
/leaderboard
```

Choose the cleaner product structure.

Leaderboard should use each user's:

> best completed practice attempt

Do not show every attempt.

Example:

```text
Rank   Engineer       Score     Recovery

1      Sarah K.       934       2:41
2      Alex R.        912       3:03
3      Mitesh P.      887       3:22
```

Tie breaking:

1. higher score
2. lower recovery time
3. lower revenue loss
4. earlier completion timestamp

Document it.

---

# Leaderboard Privacy

Users should control whether they appear publicly.

Add user setting:

```text
Show me on public leaderboards
```

Default:

```text
false
```

If false:

the user's score still saves normally but is excluded from public leaderboard queries.

The user's own attempt history remains visible to them.

---

# Display Name

Allow a logged-in user to have a display name.

For Phase 3:

- default from Clerk profile when available
- allow editing locally in IncidentRank profile/settings

Do not expose email addresses publicly.

Leaderboard displays:

```text
displayName
```

only.

---

# Basic Profile / Settings

Add a minimal authenticated page such as:

```text
/profile
```

or:

```text
/settings
```

Support:

- display name
- public leaderboard visibility
- sign out

Do not build a complex social profile yet.

---

# Free-Tier Tracking

We have a future business model where engineers receive:

```text
3 practice incidents free
```

Do NOT add payment enforcement yet.

But structure the data so we can later count:

```text
completed practice scenarios
```

Do not implement $99 billing in this phase.

No Stripe yet.

---

# Practice Attempts vs Future Assessments

Prepare the attempt schema for future company assessments.

Add nullable context such as:

```text
attemptType:
practice
assessment
```

and optionally:

```text
assessmentId nullable
```

But Phase 3 should create only:

```text
practice
```

attempts.

Do not build assessments yet.

This prevents a schema migration headache in Phase 4.

---

# Security / Authorization

A user may access:

```text
/attempts/[attemptId]
```

only if they own that practice attempt.

Do not trust attempt IDs from the browser.

Perform authorization server-side.

Public leaderboard exposes only intentionally public fields.

Do not expose:

- reasoning
- full timelines
- email
- auth provider identifiers

through leaderboard queries.

---

# Database Seed / Migration

Create migrations.

Add a reliable development setup.

Seed the Payment Retry Storm scenario identity/version if necessary.

Document:

```text
database setup
migration command
seed command
```

in README or development docs.

Do not add production cloud deployment infrastructure yet.

---

# Tests

Add tests at appropriate layers.

At minimum:

## Scoring

Test known Phase 1/2 run outcomes.

Strong mitigation should score substantially higher than:

- no intervention
- harmful mitigation

Alternative reasonable mitigation should also score well.

The exact scores should be deterministic.

---

## Score bounds

Every score:

```text
0 <= score <= 1000
```

Every dimension must remain within its max.

---

## Reasoning excluded from score

Same action sequence with different reasoning text must produce exactly the same score.

---

## Attempt persistence

A completed attempt saves:

- final score
- breakdown
- action groups
- action changes
- events
- reasoning
- result statistics

---

## Attempt authorization

User A cannot load User B's private attempt detail.

---

## Leaderboard

Only:

- completed
- practice
- public-visible users

are included.

Best attempt per user only.

---

## Leaderboard tie-breaking

Verify documented ordering.

---

## Private user

A user with leaderboard visibility disabled does not appear.

---

## Retry

A second attempt creates a new record rather than modifying the first.

---

## Scenario version

Attempt records scenario version.

---

# Existing Tests

Do not weaken or remove existing Phase 0/1/2/2.1 tests.

The existing deterministic scenario behavior remains authoritative.

---

# Migration Principle

Do not move incident behavior into the database.

The database stores:

- identities
- attempts
- results
- histories

The source-controlled scenario definition still drives execution.

Future scenario-authoring functionality will change this architecture later.

For Phase 3, keep it simple.

---

# Validation

Before declaring Phase 3 complete:

Run:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All must pass.

Also perform these manual flows.

---

# Manual Flow A — New User

1. Sign up/sign in.
2. Start Payment Retry Storm.
3. Complete incident.
4. Verify score appears.
5. Verify attempt appears in history.
6. Open attempt detail.
7. Verify reasoning and event history persisted.

---

# Manual Flow B — Retry

1. Retry Payment Retry Storm.
2. Complete with different actions.
3. Verify both attempts exist.
4. Verify records are immutable.
5. Verify leaderboard uses only best attempt.

---

# Manual Flow C — Leaderboard Privacy

1. Enable public leaderboard.
2. Verify user appears.
3. Disable public leaderboard.
4. Verify user disappears.
5. Verify personal attempt history remains unchanged.

---

# Manual Flow D — Score Quality

Compare:

- strong mitigation
- alternative mitigation
- no intervention
- failed harmful mitigation

Verify score ordering feels sensible.

If scoring produces surprising rankings:

do not silently tune numbers.

Document the issue and report the comparison.

---

# Completion Report

Return:

1. files created/modified
2. auth integration
3. database schema
4. migrations
5. attempt lifecycle
6. persistence strategy
7. score formula/bands
8. sample scores for strong/alternative/no-action/harmful runs
9. routes added
10. attempt history behavior
11. attempt detail behavior
12. leaderboard query/ranking rules
13. privacy implementation
14. tests added
15. total passing tests
16. typecheck/lint/test/build results
17. Manual Flow A result
18. Manual Flow B result
19. Manual Flow C result
20. Manual Flow D result
21. any deviations
22. any product/UX concerns

Do not begin Phase 4.

Stop when Phase 3 is complete.