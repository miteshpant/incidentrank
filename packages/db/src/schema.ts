import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Phase 6.1: attempt lifecycle, separated from incident outcome (below).
// `status` answers only "is this attempt still active" — never "how did it
// end." A `completed` attempt always has a non-null `outcome`; `completed`
// is not a synonym for "succeeded" (e.g. completed + declared_unstable is
// a normal, expected combination). See attemptOutcomeEnum and
// apps/web/src/lib/server/attempt-lifecycle.ts's isAttemptActive/
// isAttemptTerminal/isIncidentResolved predicates, which every call site
// should use instead of comparing this enum directly.
export const attemptStatusEnum = pgEnum("attempt_status_v2", [
  "in_progress",
  "completed",
  "abandoned",
]);

// Phase 6.1: how an incident ended, independent of attempt lifecycle.
// Null while `status = "in_progress"` or `status = "abandoned"`; always
// non-null when `status = "completed"`. `declared_unstable` is a candidate
// explicitly declaring completion (Finish Incident) while the system was
// not in an acceptable/stabilized state — distinct from `failed` (an
// automatic, authored failure condition was met) so hiring review can tell
// "the system catastrophically failed" apart from "the candidate chose to
// stop too early." `timed_out` is reserved for an optional future
// maxDurationMs scenario field; no scenario currently uses it.
export const attemptOutcomeEnum = pgEnum("attempt_outcome", [
  "resolved",
  "failed",
  "declared_unstable",
  "timed_out",
]);

// Phase 6.1: which completion tier a resolved candidate-declared attempt
// achieved — "optimal" (the scenario's successCondition was sustained) or
// "acceptable" (a looser, scenario-authored acceptableCondition was
// sustained: a deliberate, safe-but-imperfect handback state). Null for
// every non-resolved outcome and for automatic-completion scenarios, which
// have no acceptableCondition concept at all.
export const attemptCompletionTierEnum = pgEnum("attempt_completion_tier", [
  "optimal",
  "acceptable",
]);

export const attemptTypeEnum = pgEnum("attempt_type", [
  "practice",
  "assessment",
]);

export const organizationRoleEnum = pgEnum("organization_role", [
  "owner",
  "admin",
  "member",
]);

// Invitations may only target admin/member — never owner directly. Owner
// promotion happens only after membership already exists (see
// apps/web/src/lib/server/org-membership.ts).
export const organizationInvitationRoleEnum = pgEnum(
  "organization_invitation_role",
  ["admin", "member"],
);

export const assessmentStatusEnum = pgEnum("assessment_status", [
  "draft",
  "active",
  "closed",
]);

export const assessmentCandidateStatusEnum = pgEnum(
  "assessment_candidate_status",
  ["invited", "started", "completed"],
);

export const scenarioOwnershipTypeEnum = pgEnum("scenario_ownership_type", [
  "incidentrank",
  "organization",
]);

export const scenarioVisibilityEnum = pgEnum("scenario_visibility", [
  "public",
  "private",
]);

export const scenarioStatusEnum = pgEnum("scenario_status", [
  "draft",
  "published",
  "archived",
]);

export const scenarioVersionStatusEnum = pgEnum("scenario_version_status", [
  "draft",
  "published",
]);

// ─────────────────────────────────────────────────────────────────────────
// Users — one row per authenticated identity. No "candidate" role: a user
// is simply a user, per docs/architecture.md principle 5.
// ─────────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authProviderId: text("auth_provider_id").notNull(),
  displayName: text("display_name").notNull(),
  leaderboardVisible: boolean("leaderboard_visible").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("users_auth_provider_id_idx").on(table.authProviderId),
]);

// ─────────────────────────────────────────────────────────────────────────
// Organizations — a company account. A user is never permanently a
// "candidate"; candidacy is a relationship between a user, an organization,
// and an assessment (see assessmentCandidates below), per
// docs/architecture.md principle 5.
// ─────────────────────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("organizations_slug_idx").on(table.slug),
]);

// ─────────────────────────────────────────────────────────────────────────
// Organization members — who may administer an organization and at what
// role. A user keeps their single IncidentRank identity; this is purely an
// association row, never a separate account.
// ─────────────────────────────────────────────────────────────────────────

export const organizationMembers = pgTable("organization_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: organizationRoleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  index("organization_members_organization_id_idx").on(table.organizationId),
  index("organization_members_user_id_idx").on(table.userId),
  uniqueIndex("organization_members_org_user_idx").on(
    table.organizationId,
    table.userId,
  ),
]);

// ─────────────────────────────────────────────────────────────────────────
// Organization invitations — a person invited to join an organization's
// hiring team, distinct from assessment_candidates (a person invited to
// *take* an assessment). Mirrors assessment_candidates' invite-token
// security pattern exactly (opaque random token, only its SHA-256 hash
// stored) but is a structurally separate table: an invited team member is
// never an assessment candidate and vice versa — see
// docs/architecture.md's "AssessmentCandidate != OrganizationMember"
// principle.
//
// No `status` enum: state is derived from timestamps (acceptedAt/
// revokedAt/expiresAt), per the Phase 5.2 spec's "prefer fewer redundant
// state columns" guidance — see isInvitationPending/isInvitationExpired
// etc. in org-membership.ts.
//
// No DB-level uniqueness constraint on (organizationId, normalizedEmail):
// a person may legitimately be invited again after an earlier invitation
// expires or is revoked, so a static unique index would incorrectly block
// that. "At most one active pending invitation per org+email" is instead
// enforced at the application layer (createOrgInvitation checks for an
// existing pending+unexpired row before inserting) — see org-membership.ts.
// ─────────────────────────────────────────────────────────────────────────

export const organizationInvitations = pgTable("organization_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  email: text("email").notNull(),
  normalizedEmail: text("normalized_email").notNull(),
  role: organizationInvitationRoleEnum("role").notNull(),

  tokenHash: text("token_hash").notNull(),

  invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),

  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  index("organization_invitations_organization_id_idx").on(table.organizationId),
  index("organization_invitations_org_email_idx").on(
    table.organizationId,
    table.normalizedEmail,
  ),
  uniqueIndex("organization_invitations_token_hash_idx").on(table.tokenHash),
]);

// ─────────────────────────────────────────────────────────────────────────
// Scenarios — stable scenario identity. Deliberately has no `version`
// column:
//
//   - ownershipType "incidentrank" (built-in, e.g. Payment Retry Storm):
//     the scenario package is the sole source of truth for both content
//     AND version — see ScenarioDefinition.version in packages/scenarios.
//     This table never stores rule/control data for these scenarios.
//   - ownershipType "organization" (Phase 5 company-authored scenarios):
//     `scenarioVersions` below is the sole source of truth for both
//     content (definitionJson) and version number.
//
// Duplicating the version concept across two or three places would need
// synchronization logic for no real benefit. Resolve "current version" by
// branching on ownershipType: read ScenarioDefinition.version for
// built-ins, or MAX(scenarioVersions.version) WHERE status='published' for
// organization-owned scenarios.
// ─────────────────────────────────────────────────────────────────────────

export const scenarios = pgTable("scenarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),

  ownershipType: scenarioOwnershipTypeEnum("ownership_type")
    .notNull()
    .default("incidentrank"),
  // Null for incidentrank-owned scenarios; required for organization-owned.
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  visibility: scenarioVisibilityEnum("visibility").notNull().default("public"),
  status: scenarioStatusEnum("status").notNull().default("published"),

  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  // Slug uniqueness is scoped per ownership namespace, not global — see
  // docs/implementation_plan/phase6.md and this migration's own comment
  // history: an organization's private scenario slug and an
  // IncidentRank-owned built-in scenario's slug may legitimately
  // coincide (e.g. an org names its own scenario "Database Connection
  // Saturation" independently of IncidentRank's built-in one of the
  // same name). A single global unique index on `slug` alone would make
  // that an unresolvable collision. Two partial unique indexes instead
  // enforce two independent namespaces:
  //   - built-in scenarios stay globally unique by slug (safe: they are
  //     source-controlled via BUILT_IN_SCENARIO_CATALOG, never created
  //     through user input — also enforced in application code via a
  //     test asserting every catalog slug is unique).
  //   - organization-owned scenarios are unique only within their own
  //     organization — (organizationId, slug), never slug alone.
  // A plain composite UNIQUE(organizationId, slug) does NOT by itself
  // give built-ins global uniqueness, since Postgres unique constraints
  // treat NULL organizationId values as mutually non-conflicting — hence
  // the explicit first index below rather than relying on the second
  // alone.
  uniqueIndex("scenarios_builtin_slug_idx")
    .on(table.slug)
    .where(sql`${table.ownershipType} = 'incidentrank'`),
  uniqueIndex("scenarios_org_slug_idx")
    .on(table.organizationId, table.slug)
    .where(sql`${table.ownershipType} = 'organization'`),
  index("scenarios_organization_id_idx").on(table.organizationId),
]);

// ─────────────────────────────────────────────────────────────────────────
// Scenario versions — the durable, authoritative version record for
// organization-owned scenarios only (see the comment on `scenarios`
// above). A row here is the single source of truth for both
// `definitionJson` and `version`, mirroring how ScenarioDefinition.version
// is authoritative for built-in scenarios. `compileAuthoredScenario`
// (packages/scenarios) turns `definitionJson` into a simulator-compatible
// ScenarioSimulationDefinition. A company may freely edit its one "draft"
// row; publishing stamps `publishedAt`, flips `status` to "published", and
// that row must never be mutated again — editing a published scenario
// creates a new draft row with the next version number instead (see
// docs/architecture.md). The `(scenarioId, version)` pair is exactly what
// `attempts.scenarioVersion`/`assessments.scenarioVersion` pin against,
// the same pinning contract built-in scenarios already use against
// ScenarioDefinition.version. Built-in (incidentrank-owned) scenarios
// never get rows here — deliberately: a placeholder row would blur the
// distinction between code-owned and DB-authored content for no benefit.
// ─────────────────────────────────────────────────────────────────────────

export const scenarioVersions = pgTable("scenario_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  scenarioId: uuid("scenario_id")
    .notNull()
    .references(() => scenarios.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),

  definitionJson: jsonb("definition_json").notNull(),

  status: scenarioVersionStatusEnum("status").notNull().default("draft"),

  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("scenario_versions_scenario_version_idx").on(
    table.scenarioId,
    table.version,
  ),
  index("scenario_versions_scenario_id_idx").on(table.scenarioId),
]);

// ─────────────────────────────────────────────────────────────────────────
// Attempts — one user's complete run of a scenario version. `scenarioId` +
// `scenarioVersion` is pinned at creation and never changed, exactly as
// before Phase 5; only how that pair is *resolved* now branches on the
// referenced scenario's ownershipType (ScenarioDefinition.version lookup
// for built-ins, scenarioVersions row lookup for organization-owned) — see
// resolveSimulationDefinition in apps/web/src/lib/server/scenario-registry.
// ─────────────────────────────────────────────────────────────────────────

export const attempts = pgTable("attempts", {
  id: uuid("id").primaryKey().defaultRandom(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  scenarioId: uuid("scenario_id")
    .notNull()
    .references(() => scenarios.id, { onDelete: "restrict" }),
  scenarioVersion: integer("scenario_version").notNull(),

  attemptType: attemptTypeEnum("attempt_type").notNull().default("practice"),
  assessmentId: uuid("assessment_id").references(() => assessments.id, {
    onDelete: "restrict",
  }),

  status: attemptStatusEnum("status").notNull().default("in_progress"),
  // Null while status is "in_progress" or "abandoned"; always set once
  // status becomes "completed". See attemptOutcomeEnum above.
  outcome: attemptOutcomeEnum("outcome"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  incidentStartedAt: timestamp("incident_started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),

  // Phase 6.1: the candidate-declared "Finish Incident" completion
  // declaration, persisted directly on the attempt row rather than a
  // separate table — Finish is irreversible, so there is at most one
  // declaration per attempt ever (see docs/implementation_plan/
  // phase6.1.md). All four columns below are null for: automatic
  // completion, an automatic failure, abandonment, or an attempt still in
  // progress. They are deliberately independent of `outcome` — never
  // inferred from one another. completionSimulationTimeMs is the
  // authoritative simulation-elapsed-time at the moment of declaration
  // (not wall-clock); completionTier is set only when outcome="resolved"
  // for a candidate_declared scenario, distinguishing a full
  // successCondition match ("optimal") from a looser authored
  // acceptableCondition match ("acceptable").
  completionNote: text("completion_note"),
  completionDeclaredAt: timestamp("completion_declared_at", { withTimezone: true }),
  completionSimulationTimeMs: integer("completion_simulation_time_ms"),
  completionTier: attemptCompletionTierEnum("completion_tier"),
  // Client-generated idempotency key for POST /api/attempts/[attemptId]/
  // finish, mirroring attemptActionGroups.clientRequestId's existing
  // pattern. A retried Finish request carrying the same key returns the
  // already-computed terminal result rather than re-evaluating/re-scoring.
  finishRequestId: text("finish_request_id"),

  score: integer("score"),
  recoveryScore: integer("recovery_score"),
  customerImpactScore: integer("customer_impact_score"),
  dataIntegrityScore: integer("data_integrity_score"),
  reliabilityScore: integer("reliability_score"),
  costEfficiencyScore: integer("cost_efficiency_score"),
  operationalEfficiencyScore: integer("operational_efficiency_score"),

  recoveryTimeMs: integer("recovery_time_ms"),
  revenueLossUsd: real("revenue_loss_usd"),

  // Checkpoint for deterministic resume (Phase 4.1): the last known
  // simulation-elapsed-time the candidate had reached. Written on apply-
  // changes, periodically, on visibility change, and on completion — never
  // every tick. Combined with the persisted action groups and the pinned
  // scenarioId/scenarioVersion, this is sufficient to reconstruct engine
  // state via packages/simulator's replayAttempt(). Null for attempts that
  // predate this phase or have not yet reached an active tick.
  lastSimulationTimeMs: integer("last_simulation_time_ms"),

  // Phase 5.1 (server-authoritative assessment runtime): the real-world
  // instant the server last advanced this attempt's authoritative elapsed
  // time. Never trusted from the client — the server computes how much
  // simulation time may legitimately pass as
  // min(now - runtimeAnchoredAt, a hard per-request cap), so a candidate
  // cannot fast-forward an incident by manipulating their browser clock
  // or request payload. Null while the runtime clock is paused (briefing,
  // between visits, or after a terminal result) — a null anchor means "no
  // time should be added on next advance," not "advance from epoch."
  runtimeAnchoredAt: timestamp("runtime_anchored_at", { withTimezone: true }),

  // Optimistic concurrency token for the server runtime. Every mutating
  // runtime operation (action, advance) reads this value, computes its
  // result, then writes with `WHERE runtime_version = <value read>`,
  // incrementing it by one. A write that affects zero rows means another
  // request mutated the attempt first — the caller re-reads and retries
  // (or the request is simply rejected as stale), so two concurrent
  // mutations against the same attempt can never silently clobber one
  // another or apply the same action twice from a race rather than a
  // retry. Unrelated to `lastSimulationTimeMs`/resume, which remain
  // read-only inputs to replay.
  runtimeVersion: integer("runtime_version").notNull().default(0),

  peakSeverityRank: integer("peak_severity_rank"),
  peakInfrastructureCostUsd: real("peak_infrastructure_cost_usd"),
  peakKafkaLagMessages: integer("peak_kafka_lag_messages"),

  numberOfConfigurationChanges: integer("number_of_configuration_changes"),
  numberOfBeneficialChanges: integer("number_of_beneficial_changes"),
  numberOfHarmfulChanges: integer("number_of_harmful_changes"),

  finalStateJson: jsonb("final_state_json"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  index("attempts_user_id_idx").on(table.userId),
  index("attempts_scenario_id_idx").on(table.scenarioId),
  index("attempts_assessment_id_idx").on(table.assessmentId),
  index("attempts_user_scenario_status_idx").on(
    table.userId,
    table.scenarioId,
    table.status,
  ),
  // Finish idempotency: a retried request carrying the same key must
  // resolve to the exact same already-persisted row, never a second one.
  uniqueIndex("attempts_finish_request_idx").on(
    table.id,
    table.finishRequestId,
  ),
]);

// ─────────────────────────────────────────────────────────────────────────
// Assessments — one organization's hiring assessment, bound to exactly one
// scenario version at creation time so later scenario changes never alter
// an already-created hiring assessment.
// ─────────────────────────────────────────────────────────────────────────

export const assessments = pgTable("assessments", {
  id: uuid("id").primaryKey().defaultRandom(),

  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  scenarioId: uuid("scenario_id")
    .notNull()
    .references(() => scenarios.id, { onDelete: "restrict" }),
  scenarioVersion: integer("scenario_version").notNull(),

  status: assessmentStatusEnum("status").notNull().default("draft"),

  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  index("assessments_organization_id_idx").on(table.organizationId),
  index("assessments_scenario_id_idx").on(table.scenarioId),
]);

// ─────────────────────────────────────────────────────────────────────────
// Assessment candidates — the candidate-context relationship (User +
// Assessment + Organization). Never a separate candidate account. The
// invite token is stored as a hash; the plaintext is returned to the
// inviter exactly once at creation time and never persisted (see
// docs/architecture.md and the Phase 4 completion report for the security
// tradeoff this implies for this POC).
// ─────────────────────────────────────────────────────────────────────────

export const assessmentCandidates = pgTable("assessment_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),

  assessmentId: uuid("assessment_id")
    .notNull()
    .references(() => assessments.id, { onDelete: "cascade" }),

  email: text("email").notNull(),
  normalizedEmail: text("normalized_email").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

  status: assessmentCandidateStatusEnum("status").notNull().default("invited"),

  inviteTokenHash: text("invite_token_hash").notNull(),
  // Phase 4.1: simple expiration, no rotation. Set at invitation creation
  // (default 7 days out). Checked by the preview/accept routes; irrelevant
  // once a candidate has claimed the invitation (userId set) — an accepted
  // candidate never depends on the token again.
  inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }).notNull(),

  invitedAt: timestamp("invited_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),

  attemptId: uuid("attempt_id").references(() => attempts.id, {
    onDelete: "set null",
  }),
}, (table) => [
  index("assessment_candidates_assessment_id_idx").on(table.assessmentId),
  index("assessment_candidates_user_id_idx").on(table.userId),
  uniqueIndex("assessment_candidates_invite_token_hash_idx").on(
    table.inviteTokenHash,
  ),
  uniqueIndex("assessment_candidates_assessment_email_idx").on(
    table.assessmentId,
    table.normalizedEmail,
  ),
]);

// ─────────────────────────────────────────────────────────────────────────
// Candidate decision groups — the persisted form of the Phase 2.1
// CandidateActionGroup. Reasoning is optional and never affects scoring.
// ─────────────────────────────────────────────────────────────────────────

export const attemptActionGroups = pgTable("attempt_action_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  attemptId: uuid("attempt_id")
    .notNull()
    .references(() => attempts.id, { onDelete: "cascade" }),

  sequence: integer("sequence").notNull(),
  elapsedMs: integer("elapsed_ms").notNull(),

  reasoning: text("reasoning"),

  // Phase 5.1: client-generated idempotency key for the server-authoritative
  // action endpoint (POST /api/attempts/[attemptId]/actions). Null for
  // action groups persisted by the pre-5.1 client-simulated path (practice,
  // preview), which has no retry-safety requirement since nothing server-
  // side re-derives sequence from it. A retried action submission carrying
  // the same clientRequestId hits this unique constraint and is treated as
  // "already applied" rather than applied a second time.
  clientRequestId: text("client_request_id"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  index("attempt_action_groups_attempt_id_idx").on(table.attemptId),
  uniqueIndex("attempt_action_groups_attempt_sequence_idx").on(
    table.attemptId,
    table.sequence,
  ),
  uniqueIndex("attempt_action_groups_attempt_client_request_idx").on(
    table.attemptId,
    table.clientRequestId,
  ),
]);

// ─────────────────────────────────────────────────────────────────────────
// Individual configuration changes inside one action group.
// ─────────────────────────────────────────────────────────────────────────

export const attemptActionChanges = pgTable("attempt_action_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  actionGroupId: uuid("action_group_id")
    .notNull()
    .references(() => attemptActionGroups.id, { onDelete: "cascade" }),

  sequence: integer("sequence").notNull(),

  controlKey: text("control_key").notNull(),
  previousValueJson: jsonb("previous_value_json").notNull(),
  newValueJson: jsonb("new_value_json").notNull(),
}, (table) => [
  index("attempt_action_changes_action_group_id_idx").on(table.actionGroupId),
]);

// ─────────────────────────────────────────────────────────────────────────
// Engine/system events — persisted separately from candidate decisions.
// Reasoning is never evaluated here or anywhere else.
// ─────────────────────────────────────────────────────────────────────────

export const attemptEvents = pgTable("attempt_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  attemptId: uuid("attempt_id")
    .notNull()
    .references(() => attempts.id, { onDelete: "cascade" }),

  sequence: integer("sequence").notNull(),
  elapsedMs: integer("elapsed_ms").notNull(),

  type: text("type").notNull(),
  message: text("message").notNull(),
  metadataJson: jsonb("metadata_json"),
}, (table) => [
  index("attempt_events_attempt_id_idx").on(table.attemptId),
  uniqueIndex("attempt_events_attempt_sequence_idx").on(
    table.attemptId,
    table.sequence,
  ),
]);
