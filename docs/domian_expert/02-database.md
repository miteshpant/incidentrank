# Database Schema (`packages/db/src/schema.ts`)

~50+ tables. Grouped logically below. Migrations: `pnpm --filter @incidentrank/db
db:generate` (drizzle-kit generate, produces a new numbered SQL file under
`packages/db/drizzle/`), `pnpm --filter @incidentrank/db db:migrate` (applies
pending migrations), `pnpm --filter @incidentrank/db db:seed` (seeds built-in
scenarios generically from the catalog, no per-slug code, plus 100 pre-seeded
Founding Engineer allocation slots). **Never run migrate/seed against prod —
local only, always.**

`packages/db/src/relations.ts` wires Drizzle's `db.query.*` relational API —
every table with FKs needs a matching `relations()` entry there, or nested
`with: {...}` queries against it will silently fail to resolve.

## Users / Auth

- **`users`** — one row per authenticated identity. `id` uuid PK,
  `authProviderId` text unique (the Clerk join key), `displayName` text,
  `leaderboardVisible` boolean default false. No "candidate" role column
  anywhere, anywhere in the schema — see "User vs Candidate" in
  `03-auth-and-access.md`.

## Organizations / Governance

- **`organizations`** — company account. `slug` unique, `status` enum
  (pending/active/suspended), suspend/reactivate audit columns.
- **`organizationMembers`** — `(organizationId, userId)` unique, `role` enum
  (owner/admin/member).
- **`organizationInvitations`** — `tokenHash`, `role`, `isRecoveryInvite`
  boolean, `expiresAt`/`acceptedAt`/`revokedAt`. No status enum — state is
  derived from which timestamp is set.
- **`organizationAuditEvents`** — org-level audit trail, `actorType` enum
  (platform_admin/organization_owner/organization_admin/system).

## Scenarios / Assessments

- **`scenarios`** — stable scenario identity, **no version column**. See full
  detail below.
- **`scenarioVersions`** — immutable numbered snapshot, org-owned scenarios
  only. `definitionJson` jsonb, `status` enum (draft/published), unique on
  `(scenarioId, version)`.
- **`assessments`** — one org's hiring assessment. `scenarioId` +
  `scenarioVersion` pinned at creation, `status` enum (draft/active/closed).
- **`assessmentCandidates`** — the candidate-context relationship, NOT a
  separate account type. `email`/`normalizedEmail`, `userId` nullable until
  claimed, `status` enum (invited/started/completed), `inviteTokenHash`
  unique, `attemptId` nullable FK. Unique on `(assessmentId,
  normalizedEmail)`.

## Attempts (the central transactional record)

- **`attempts`** — full detail below.
- **`attemptActionGroups`** — one "Apply Changes" click. `sequence`,
  `elapsedMs`, `reasoning` text nullable, `clientRequestId` unique-per-attempt
  idempotency key.
- **`attemptActionChanges`** — individual field changes inside one group.
  `controlKey`, `previousValueJson`/`newValueJson` jsonb.
- **`attemptEvents`** — persisted engine/system events, unique on
  `(attemptId, sequence)`.

## Admin / Platform Authority

- **`adminUsers`** — platform-wide admin authority. `role` enum (owner/admin).
  Two partial unique indexes: one on `userId WHERE revokedAt IS NULL` (one
  active admin row per user), one on `role WHERE role='owner'` (**at most one
  owner row ever**, ignoring `revokedAt` — bootstrap permanently closes even
  if the owner is later revoked).
- **`adminInvites`** — token-based admin-membership invite.
- **`adminAuditEvents`** — append-only sensitive-mutation log, never logs raw
  secrets/tokens.

## Promotional / Referrals / Incident Passes

- **`incidentPasses`** — one-scenario single-use entitlement primitive.
  `status` enum (available/bound/consumed/expired/revoked), `sourceType`
  enum (promo_invite/referral_reward/admin_grant) with a polymorphic
  `sourceId` (not a strict FK).
- **`promotionalInvites`** — admin-created email-targeted invite granting one
  pass. `tokenHash` unique, `status` enum
  (created/sent/redeemed/expired/revoked/send_failed).
- **`referrals`** — `referralCode` **plaintext, not hashed** (unlike every
  other token in this schema). `status` enum
  (created/claimed/qualified/rewarded/rejected/expired/revoked).
  `qualifyingAttemptId`/`rewardIncidentPassId` each partial-unique (not-null).

## Billing / Payments (Stripe)

- **`stripeCustomers`** — personal user↔Stripe-Customer mapping, both
  columns unique.
- **`paidEntitlements`** — the policy-level grant. `entitlementType` enum
  (pro/founding_lifetime), `status` enum
  (active/inactive/canceled/past_due/revoked), Stripe linkage columns,
  Phase 10E amount-captured columns (`amountTotalUsdCents`, `currency`,
  `discountAmountUsdCents`). Partial unique on `userId WHERE
  entitlementType='founding_lifetime'`.
- **`stripeSubscriptions`** — raw Stripe-state mirror, `stripeStatus` is the
  raw Stripe string, not a normalized enum.
- **`stripeWebhookEvents`** — idempotency ledger, `stripeEventId` unique.
- **`foundingEngineerAllocations`** — race-safe 100-slot capacity model.
  `slotNumber` unique, `status` enum (reserved/issued/released/expired).
  Partial unique on `userId WHERE status IN ('reserved','issued')` (one
  active reservation per user). Exactly 100 rows pre-seeded, never a counter.
- **`organizationStripeCustomers`** — structurally **separate** from personal
  `stripeCustomers`. Org credit purchases never flow through a member's
  personal Stripe Customer.
- **`organizationCreditLedger`** — sole authoritative source of org credit
  balance (SUM(quantity) over an org's rows). `transactionType` enum
  (purchase/assessment_started/admin_adjustment/refund/reversal/expiration).
  Two partial unique indexes guard idempotency: one purchase row per Stripe
  Checkout Session, one consumption row per attempt.
- **`organizationLaunchDiscountClaims`** — `organizationId` is a **plain**
  unique column (not partial) — at most one claim row per org, ever.

## Engineer Rank / Benchmark

- **`rankSnapshots`** — append-only Engineer Rank history. `rankBand` enum
  (developing/intermediate/senior/staff/senior_staff/principal), `provisional`
  boolean, `confidence` enum (low/medium/high). Absence of any row means "not
  enough evidence" — there is no zero-value placeholder row.
- **`benchmarkSubjects`** — pseudonymous subject id, `userId` unique. This
  FK survives account anonymization (deletion never mutates `users.id`).
- **`benchmarkAttemptFacts`** — 28-column fact row. Snapshotted
  `difficulty`/`category` (plain text, not an FK to the live scenario — so
  historical facts don't retroactively change if a scenario's metadata
  changes later), all 6 scoring dimensions as `real`, `rankBefore`/
  `rankAfter`.
- **`benchmarkActionFacts`** — per-action-group read projection.
  `systemStateBeforeJson`/`AfterJson` are explicitly allowlisted, never the
  full `finalStateJson`.
- **`benchmarkProjectionFailures`** — operational error log, written outside
  the attempt's own terminal-persistence transaction (so a benchmark
  materialization failure can never roll back the real attempt completion).

## Privacy / Legal

- **`legalAcceptances`** — append-only. `acceptanceType` enum
  (platform_terms/privacy_policy/candidate_assessment_notice/
  organization_business_terms), one-of-four version columns. Deliberately
  **no** IP/device-fingerprint column. Never deleted — it's the evidence
  consent was given.
- **`privacyRequests`** — mutable access/correction/deletion/other request,
  `status` enum (pending/completed).

## Weekly Challenge / Social

- **`weeklyChallenges`** — single active-at-a-time admin-selected free
  scenario. Partial unique on `active WHERE active=true`.
- **`challenges`** — 1:1 shareable challenge invite. `tokenHash` unique
  (only the hash is persisted, same pattern as invite tokens elsewhere),
  `challengerAttemptId` not-null, `challengedUserId`/`challengedAttemptId`
  nullable until accepted/finished.

## Analytics / Growth / Misc

- **`analyticsEvents`** — flat funnel-event table. `userId` is **nullable
  with NO foreign-key constraint** — deliberately, see below. `context` jsonb
  is a small bag for non-sensitive properties only.
- **`companyInquiries`** — B2B contact-form submissions. `ipHash` (SHA-256 of
  IP, rate-limiting only, never the raw IP).

---

## `attempts` — full column detail

```ts
export const attempts = pgTable("attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scenarioId: uuid("scenario_id").notNull().references(() => scenarios.id, { onDelete: "restrict" }),
  scenarioVersion: integer("scenario_version").notNull(),

  attemptType: attemptTypeEnum("attempt_type").notNull().default("practice"), // "practice" | "assessment"
  assessmentId: uuid("assessment_id").references(() => assessments.id, { onDelete: "restrict" }),

  incidentPassId: uuid("incident_pass_id").references(() => incidentPasses.id, { onDelete: "set null" }),
  weeklyChallengeId: uuid("weekly_challenge_id").references(() => weeklyChallenges.id, { onDelete: "set null" }),

  status: attemptStatusEnum("status").notNull().default("in_progress"), // "in_progress"|"completed"|"abandoned"
  outcome: attemptOutcomeEnum("outcome"), // "resolved"|"failed"|"declared_unstable"|"timed_out"
  startedAt: timestamp(...).notNull().defaultNow(),
  incidentStartedAt: timestamp(...),
  completedAt: timestamp(...),

  // Candidate-declared Finish fields — independent of `outcome`, never inferred from one another
  completionNote: text("completion_note"),
  completionDeclaredAt: timestamp(...),
  completionSimulationTimeMs: integer(...),
  completionTier: attemptCompletionTierEnum("completion_tier"), // "optimal"|"acceptable"
  finishRequestId: text("finish_request_id"), // client idempotency key

  score: integer("score"),
  recoveryScore: integer(...), customerImpactScore: integer(...), dataIntegrityScore: integer(...),
  reliabilityScore: integer(...), costEfficiencyScore: integer(...), operationalEfficiencyScore: integer(...),

  recoveryTimeMs: integer(...),
  revenueLossUsd: real(...),

  lastSimulationTimeMs: integer(...),       // Phase 4.1 resume checkpoint
  runtimeAnchoredAt: timestamp(...),         // Phase 5.1 server-authoritative clock anchor
  runtimeVersion: integer(...).notNull().default(0), // optimistic concurrency token

  peakSeverityRank: integer(...),
  peakInfrastructureCostUsd: real(...),
  peakKafkaLagMessages: integer(...),

  numberOfConfigurationChanges: integer(...),
  numberOfBeneficialChanges: integer(...),
  numberOfHarmfulChanges: integer(...),

  finalStateJson: jsonb("final_state_json"),

  createdAt: timestamp(...).notNull().defaultNow(),
}, (table) => [
  index(...).on(table.userId), index(...).on(table.scenarioId), index(...).on(table.assessmentId),
  index(...).on(table.incidentPassId), index(...).on(table.weeklyChallengeId),
  index("attempts_user_scenario_status_idx").on(table.userId, table.scenarioId, table.status),
  uniqueIndex("attempts_finish_request_idx").on(table.id, table.finishRequestId),
]);
```

Key invariant: **`status` answers only "is this attempt still active," never
"how did it end."** A completed attempt always has a non-null `outcome`;
`completed` is not a synonym for "succeeded" — `completed + declared_unstable`
is a normal, expected combination.

## `scenarios` — full column detail

```ts
export const scenarios = pgTable("scenarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  isActive: boolean(...).notNull().default(true),

  ownershipType: scenarioOwnershipTypeEnum("ownership_type").notNull().default("incidentrank"), // "incidentrank"|"organization"
  organizationId: uuid(...).references(() => organizations.id, { onDelete: "cascade" }), // null for incidentrank-owned
  visibility: scenarioVisibilityEnum(...).notNull().default("public"),
  status: scenarioStatusEnum(...).notNull().default("published"), // "draft"|"published"|"archived"

  structure: scenarioStructureEnum(...).notNull().default("linear"), // "linear"|"branching"|"parallel"|"cascading"
  isFree: boolean("is_free").notNull().default(false), // authoritative at every evaluatePracticeAccess call site
  isFreeOverriddenByAdmin: boolean(...).notNull().default(false), // Phase 10G seed-sync guard
  domain: scenarioDomainEnum("domain"), // nullable, 10-value enum
  releaseWeek: text("release_week"),
  publishedAt: timestamp(...),

  createdByUserId: uuid(...).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp(...), updatedAt: timestamp(...),
}, (table) => [
  uniqueIndex("scenarios_builtin_slug_idx").on(table.slug).where(sql`${table.ownershipType} = 'incidentrank'`),
  uniqueIndex("scenarios_org_slug_idx").on(table.organizationId, table.slug).where(sql`${table.ownershipType} = 'organization'`),
  index(...).on(table.organizationId),
]);
```

`scenarioDomainEnum` (10 values): `Databases & Storage, Messaging & Streaming,
Caching, Microservices & Dependencies, API & Traffic, Distributed Systems,
Deployments & Reliability, Infrastructure & Capacity, Security & Identity,
Data Pipelines`.

**Slug uniqueness scoping — important if you ever write a scenario lookup**:
two separate **partial** unique indexes, never one global index. A plain
composite `UNIQUE(organizationId, slug)` alone is insufficient because
Postgres treats NULL `organizationId` values as mutually non-conflicting.
Any scenario lookup by slug must therefore also filter on `ownershipType` —
confirmed this is exactly what `getActiveScenarioBySlug` and every other
real lookup in the codebase does; never write a bare `WHERE slug = ?` query.

Why `scenarios` has no version column: built-in version lives in source code
(`ScenarioDefinition.version`); org-scenario version lives in
`scenarioVersions.version`. Duplicating the concept a third time would need
synchronization logic for no benefit.

## Why `analyticsEvents.userId` has no FK constraint

Verbatim schema comment:

> "A single flat event table, deliberately not a data warehouse... `userId`
> is nullable and has NO foreign-key constraint on purpose — unlike every
> other user-scoped table in this schema, an analytics event must still be
> writable (and still exist for later anonymous-session analysis) even if
> the user row is later deleted via the privacy-deletion flow — this
> intentionally does NOT cascade or block on user deletion the way
> `legalAcceptances`/`privacyRequests` do."

**Known footgun this has caused**: test files that create throwaway users via
a mocked Clerk identity can leave orphaned `analytics_events` rows behind
after their own cleanup deletes the `users` row, because there's no cascade
to clean them up automatically. If you add a test that creates a user and
exercises any code path that fires `recordAnalyticsEvent`, clean up the
resulting `analytics_events` rows in your own `afterEach`, scoped by
`userId` — don't assume deleting the user is sufficient.
