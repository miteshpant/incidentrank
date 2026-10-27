import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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

// Phase 10A: invitations may target owner/admin/member. Owner invitations
// are first-class — authorization over WHO may issue one (an existing
// organization owner, or an IncidentRank platform admin provisioning a
// new organization's initial owner) is enforced by the caller
// (organization-auth.ts's canInviteRole / organization-provisioning.ts),
// never by this enum itself. See apps/web/src/lib/server/
// org-membership.ts.
export const organizationInvitationRoleEnum = pgEnum(
  "organization_invitation_role",
  ["owner", "admin", "member"],
);

// Phase 10A: organization lifecycle. `pending` = created by an
// IncidentRank admin, initial-owner onboarding not yet complete (no
// accepted owner invitation). `active` = normal functionality available.
// `suspended` = data intact, operational mutations blocked server-side
// (see requireActiveOrganization in organization-auth.ts); already-started
// candidate attempts are unaffected (see docs/implementation_plan/
// phase10a.md §18). `closed` is deliberately NOT included — Phase 10A
// defers it; see the Phase 10A completion report.
export const organizationStatusEnum = pgEnum("organization_status", [
  "pending",
  "active",
  "suspended",
]);

// Phase 10A: who/what performed an organization_audit_events action.
// Distinct from adminAuditEvents' implicit "always an admin" actor —
// organization-level events can originate from a platform admin acting on
// the org, an org owner/admin acting within it, or the system itself
// (e.g. automatic pending->active transition on owner-invite acceptance).
export const organizationActorTypeEnum = pgEnum("organization_actor_type", [
  "platform_admin",
  "organization_owner",
  "organization_admin",
  "system",
]);

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

// Phase 8: platform-wide (not organization-scoped) admin authority. Owner
// is the single bootstrap identity (see docs/implementation_plan/
// phase8_admin_promotional_access_referrals.md §4); admin is every
// subsequently-invited member. Distinct from organizationRoleEnum, which
// is scoped to one organization — this enum governs the IncidentRank
// admin portal itself.
export const adminRoleEnum = pgEnum("admin_role", ["owner", "admin"]);

export const adminInviteStatusEnum = pgEnum("admin_invite_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);

export const promotionalInviteStatusEnum = pgEnum(
  "promotional_invite_status",
  ["created", "sent", "redeemed", "expired", "revoked", "send_failed"],
);

// Phase 8: what created an Incident Pass. Polymorphic — incidentPasses.
// sourceId points at a row in a different table depending on this value
// (promotionalInvites.id, referrals.id, or null for an ad-hoc admin
// grant with no originating row) — see the comment on incidentPasses
// below for why sourceId is a plain uuid rather than a strict FK.
export const incidentPassSourceTypeEnum = pgEnum("incident_pass_source_type", [
  "promo_invite",
  "referral_reward",
  "admin_grant",
]);

export const incidentPassStatusEnum = pgEnum("incident_pass_status", [
  "available",
  "bound",
  "consumed",
  "expired",
  "revoked",
]);

export const referralStatusEnum = pgEnum("referral_status", [
  "created",
  "claimed",
  "qualified",
  "rewarded",
  "rejected",
  "expired",
  "revoked",
]);

// Phase 9 — paid entitlements (Stripe). entitlementType is the catalog-wide
// grant kind; paidEntitlementStatusEnum is IncidentRank's own policy-level
// status (never a raw mirror of Stripe's subscription status strings — see
// stripeSubscriptions below for that).
export const paidEntitlementTypeEnum = pgEnum("paid_entitlement_type", [
  "pro",
  "founding_lifetime",
]);

export const paidEntitlementStatusEnum = pgEnum("paid_entitlement_status", [
  "active",
  "inactive",
  "canceled",
  "past_due",
  "revoked",
]);

export const stripeWebhookProcessingStatusEnum = pgEnum(
  "stripe_webhook_processing_status",
  ["received", "processing", "processed", "failed"],
);

export const foundingAllocationStatusEnum = pgEnum(
  "founding_allocation_status",
  ["reserved", "issued", "released", "expired"],
);

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
//
// Phase 10A: organizations are provisioned by an IncidentRank platform
// admin only (apps/web/src/lib/server/organization-provisioning.ts) — an
// ordinary authenticated user can no longer create one. `status` defaults
// to "active" so existing (pre-Phase-10A, self-service-created) rows
// backfill correctly with no manual migration step; new admin-provisioned
// organizations explicitly set status: "pending" at creation, moving to
// "active" only once the invited initial owner accepts (see
// org-membership.ts's acceptOrgInvitation).
// ─────────────────────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  status: organizationStatusEnum("status").notNull().default("active"),
  createdByAdminUserId: uuid("created_by_admin_user_id").references(
    () => adminUsers.id,
    { onDelete: "set null" },
  ),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendedByAdminUserId: uuid("suspended_by_admin_user_id").references(
    () => adminUsers.id,
    { onDelete: "set null" },
  ),
  suspensionReason: text("suspension_reason"),
  reactivatedAt: timestamp("reactivated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("organizations_slug_idx").on(table.slug),
  index("organizations_status_idx").on(table.status),
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

  // Phase 10A: marks a platform-admin-issued owner-recovery invitation
  // (organization-provisioning.ts's inviteOwnerRecovery) — distinct from
  // a routine initial/additional owner invite. Acceptance of a recovery
  // invite is the one case permitted even while the organization is
  // suspended (see acceptOrgInvitation's suspension carve-out in
  // org-membership.ts and phase10a.md §15/§36).
  isRecoveryInvite: boolean("is_recovery_invite").notNull().default(false),

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
// Phase 10A: organization-level audit trail. Mirrors adminAuditEvents'
// shape (generic action/targetType/targetId/metadataJson, trivially
// extensible with new action-string values, no schema change needed per
// new event type) but adds organizationId scoping and actorType, since an
// organization's events can originate from a platform admin acting on it,
// an org owner/admin acting within it, or the system itself (e.g. the
// automatic pending->active transition on initial-owner acceptance).
// actorUserId always stores the acting users.id, never adminUsers.id —
// actorType is what distinguishes "acted as platform admin" from "acted
// as org owner," consistent with how every other table in this schema
// references users for "who did this," never a role table.
//
// Action-string vocabulary (reuse these exactly, never invent per-caller
// variants): owner_invited, owner_added, owner_removed, admin_invited,
// member_invited, role_changed, scenario_created, scenario_updated,
// scenario_archived, assessment_created, candidate_invited,
// organization_suspended, organization_reactivated,
// owner_recovery_invited.
// ─────────────────────────────────────────────────────────────────────────

export const organizationAuditEvents = pgTable("organization_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  actorType: organizationActorTypeEnum("actor_type").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  index("organization_audit_events_organization_id_idx").on(
    table.organizationId,
  ),
  index("organization_audit_events_target_idx").on(
    table.targetType,
    table.targetId,
  ),
  index("organization_audit_events_created_at_idx").on(table.createdAt),
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

  // Phase 8: the Incident Pass that funded this attempt's start, if any —
  // null for free-scenario attempts, assessment attempts, and any attempt
  // predating Phase 8. Prevents one pass from funding two attempts (the
  // pass-consumption transaction sets this and flips the pass to
  // "consumed" atomically) and is the exact-lineage anchor referral
  // qualification checks against (referrals.referredIncidentPassId must
  // equal this column, not merely "same user", before a reward can
  // issue — see persistTerminalAttempt). Set null on delete rather than
  // restrict: a pass record may outlive the attempt it funded without
  // blocking cleanup.
  incidentPassId: uuid("incident_pass_id").references(
    (): AnyPgColumn => incidentPasses.id,
    { onDelete: "set null" },
  ),

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
  index("attempts_incident_pass_id_idx").on(table.incidentPassId),
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

// ─────────────────────────────────────────────────────────────────────────
// Phase 8 — Admin bootstrap, promotional access & referral growth loop.
// See docs/implementation_plan/phase8_admin_promotional_access_referrals.md
// (binding spec) and docs/implementation_plan/phase8loc.md (corrections,
// which take precedence wherever the two disagree).
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// Admin users — platform-wide IncidentRank admin authority. Authorization
// requires BOTH a verified @incidentrank.com email AND an active row here
// (revokedAt IS NULL) — domain alone never grants access (phase8loc.md
// Step 2B). A user may hold at most one *active* admin row at a time
// (partial unique index below); a revoked-then-reinstated history is
// preserved rather than deleted, so admin-audit lineage stays intact.
// Every authorization query MUST filter revokedAt IS NULL explicitly —
// see loadAdminMembership in apps/web/src/lib/server/admin-auth.ts.
// ─────────────────────────────────────────────────────────────────────────

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: adminRoleEnum("role").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  index("admin_users_user_id_idx").on(table.userId),
  uniqueIndex("admin_users_active_user_idx")
    .on(table.userId)
    .where(sql`${table.revokedAt} IS NULL`),
  // DB-level bootstrap race guard (phase8loc.md Step 2A): at most one
  // "owner" row may ever exist, full stop — not just one *active* owner.
  // Two simultaneous first-bootstrap requests both attempting to insert
  // role='owner' race on this index; exactly one INSERT succeeds, the
  // other hits a unique-violation and is treated as "already bootstrapped"
  // rather than creating a second owner. Deliberately ignores revokedAt:
  // bootstrap is a one-time event that must stay permanently closed even
  // if that owner is later revoked, never "ensure an owner always exists."
  uniqueIndex("admin_users_single_owner_idx")
    .on(table.role)
    .where(sql`${table.role} = 'owner'`),
]);

// ─────────────────────────────────────────────────────────────────────────
// Admin invites — mirrors organizationInvitations' token-based invite
// pattern (opaque random token, only its SHA-256 hash stored), scoped to
// granting platform admin membership rather than org membership. Email
// must end in @incidentrank.com at creation time — enforced in
// apps/web/src/lib/server/admin-invites.ts, not at the DB layer.
// ─────────────────────────────────────────────────────────────────────────

export const adminInvites = pgTable("admin_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  role: adminRoleEnum("role").notNull(),
  tokenHash: text("token_hash").notNull(),
  invitedByUserId: uuid("invited_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  status: adminInviteStatusEnum("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("admin_invites_token_hash_idx").on(table.tokenHash),
  index("admin_invites_status_idx").on(table.status),
]);

// ─────────────────────────────────────────────────────────────────────────
// Incident passes — the entitlement primitive: one pass authorizes exactly
// one premium-scenario attempt. Lifecycle: available -> bound (user
// selects a scenario) -> consumed (that scenario's attempt actually
// starts) -> never movable to a different scenario once bound. sourceId
// is a plain uuid, not a strict FK, because it polymorphically points at
// promotionalInvites.id or referrals.id depending on sourceType (or is
// null for an admin_grant with no originating row) — a single FK column
// cannot reference two different tables conditionally. The unique index
// on (sourceType, sourceId) is the DB-level backstop (phase8loc.md Step
// 1A) guaranteeing one promo invite or one referral reward can never
// produce two passes, even under a concurrent-request race.
// ─────────────────────────────────────────────────────────────────────────

export const incidentPasses = pgTable("incident_passes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sourceType: incidentPassSourceTypeEnum("source_type").notNull(),
  sourceId: uuid("source_id"),
  scenarioId: uuid("scenario_id").references(() => scenarios.id, {
    onDelete: "set null",
  }),
  status: incidentPassStatusEnum("status").notNull().default("available"),
  grantedAt: timestamp("granted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  boundAt: timestamp("bound_at", { withTimezone: true }),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  index("incident_passes_user_id_idx").on(table.userId),
  index("incident_passes_status_idx").on(table.status),
  index("incident_passes_scenario_id_idx").on(table.scenarioId),
  uniqueIndex("incident_passes_source_idx")
    .on(table.sourceType, table.sourceId)
    .where(sql`${table.sourceId} IS NOT NULL`),
]);

// ─────────────────────────────────────────────────────────────────────────
// Promotional invites — a founder/admin-created, email-targeted invite
// granting exactly one Incident Pass on redemption. Mirrors
// assessmentCandidates/organizationInvitations' token-hash pattern.
// incidentPassId is set once the invite's pass has been granted
// (redemption is atomic: mark redeemed + grant pass together).
// ─────────────────────────────────────────────────────────────────────────

export const promotionalInvites = pgTable("promotional_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  normalizedEmail: text("normalized_email").notNull(),
  tokenHash: text("token_hash").notNull(),
  campaign: text("campaign"),
  status: promotionalInviteStatusEnum("status").notNull().default("created"),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  redeemedByUserId: uuid("redeemed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  incidentPassId: uuid("incident_pass_id").references(() => incidentPasses.id, {
    onDelete: "set null",
  }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("promotional_invites_token_hash_idx").on(table.tokenHash),
  index("promotional_invites_normalized_email_idx").on(table.normalizedEmail),
  index("promotional_invites_status_idx").on(table.status),
  index("promotional_invites_campaign_idx").on(table.campaign),
  index("promotional_invites_created_at_idx").on(table.createdAt),
  index("promotional_invites_redeemed_by_user_id_idx").on(
    table.redeemedByUserId,
  ),
]);

// ─────────────────────────────────────────────────────────────────────────
// Referrals — a referrer's shareable code and its lineage through to a
// reward. referredIncidentPassId is the pass granted to the referred user
// at claim time; qualifyingAttemptId/rewardIncidentPassId are set only
// once that *specific* pass funds a resolved acceptable/optimal attempt
// (see persistTerminalAttempt's referral-qualification step) — a referred
// user's unrelated attempt (funded by a different pass, or free) must
// never qualify this referral. This exact-lineage requirement is binding
// per phase8loc.md's "Referral qualification must follow pass lineage"
// correction. The unique indexes on qualifyingAttemptId/
// rewardIncidentPassId are the final concurrency backstop: even a
// duplicate/replayed terminal-persistence callback can produce at most
// one reward.
// ─────────────────────────────────────────────────────────────────────────

export const referrals = pgTable("referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Plaintext, not hashed — unlike invite tokens, a referral code is not
  // a credential that grants anything by itself (claimReferral always
  // re-runs full eligibility checks) and the referrer needs to be able
  // to repeatedly view/copy their own link from their profile, which a
  // one-way hash would make impossible.
  referralCode: text("referral_code").notNull(),
  referrerUserId: uuid("referrer_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  referredUserId: uuid("referred_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  status: referralStatusEnum("status").notNull().default("created"),
  referredIncidentPassId: uuid("referred_incident_pass_id").references(
    () => incidentPasses.id,
    { onDelete: "set null" },
  ),
  qualifyingAttemptId: uuid("qualifying_attempt_id").references(
    () => attempts.id,
    { onDelete: "set null" },
  ),
  rewardIncidentPassId: uuid("reward_incident_pass_id").references(
    () => incidentPasses.id,
    { onDelete: "set null" },
  ),
  clickedAt: timestamp("clicked_at", { withTimezone: true }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
  rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("referrals_code_idx").on(table.referralCode),
  uniqueIndex("referrals_qualifying_attempt_idx")
    .on(table.qualifyingAttemptId)
    .where(sql`${table.qualifyingAttemptId} IS NOT NULL`),
  uniqueIndex("referrals_reward_pass_idx")
    .on(table.rewardIncidentPassId)
    .where(sql`${table.rewardIncidentPassId} IS NOT NULL`),
  index("referrals_referrer_user_id_idx").on(table.referrerUserId),
  index("referrals_referred_user_id_idx").on(table.referredUserId),
  index("referrals_status_idx").on(table.status),
]);

// ─────────────────────────────────────────────────────────────────────────
// Admin audit events — append-only log of sensitive admin mutations
// (invite created/sent/revoked, pass granted/revoked, admin invited/role-
// changed/revoked, referral manually revoked). Never stores raw secrets
// (tokens/codes) — see logAdminAction in apps/web/src/lib/server/
// admin-audit.ts.
// ─────────────────────────────────────────────────────────────────────────

export const adminAuditEvents = pgTable("admin_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminUserId: uuid("admin_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  index("admin_audit_events_admin_user_id_idx").on(table.adminUserId),
  index("admin_audit_events_target_idx").on(
    table.targetType,
    table.targetId,
  ),
  index("admin_audit_events_created_at_idx").on(table.createdAt),
]);

// ─────────────────────────────────────────────────────────────────────────
// Phase 9 — Stripe payments. stripeCustomers is the DB-authoritative
// user<->Stripe-Customer mapping (phase9.md §9): one user maps to at most
// one Stripe Customer, created idempotently and reused on every future
// checkout. Never use email alone as identity — always resolve through
// this table.
// ─────────────────────────────────────────────────────────────────────────

export const stripeCustomers = pgTable("stripe_customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("stripe_customers_user_id_idx").on(table.userId),
  uniqueIndex("stripe_customers_stripe_customer_id_idx").on(
    table.stripeCustomerId,
  ),
]);

// ─────────────────────────────────────────────────────────────────────────
// Paid entitlements — the policy-level grant the rest of the application
// reads (phase9.md §10, §19): "does this user have Pro or Founding access
// right now" is answered from THIS table alone, never by re-deriving it
// from stripeSubscriptions or a live Stripe API call on every request.
// Synchronized from verified Stripe webhook events only (see
// apps/web/src/lib/server/stripe/webhook-handlers.ts) — never written from
// the checkout-success redirect page. Architecturally separate from
// incidentPasses: a catalog-wide, possibly time-bound grant, not a
// one-scenario single-use pass.
// ─────────────────────────────────────────────────────────────────────────

export const paidEntitlements = pgTable("paid_entitlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  entitlementType: paidEntitlementTypeEnum("entitlement_type").notNull(),
  status: paidEntitlementStatusEnum("status").notNull(),
  source: text("source").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripePriceId: text("stripe_price_id"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  // Null for founding_lifetime (never expires) and for a pro entitlement
  // whose period end is not yet known.
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  index("paid_entitlements_user_id_idx").on(table.userId),
  index("paid_entitlements_status_idx").on(table.status),
  index("paid_entitlements_entitlement_type_idx").on(table.entitlementType),
  // A user may hold at most one FOUNDING entitlement ever (phase9.md
  // §26/§49's "same user cannot receive two Founding entitlements") —
  // partial unique index scoped to entitlementType so a user can still
  // separately hold a pro entitlement without conflict.
  uniqueIndex("paid_entitlements_one_founding_per_user_idx")
    .on(table.userId)
    .where(sql`${table.entitlementType} = 'founding_lifetime'`),
]);

// ─────────────────────────────────────────────────────────────────────────
// Stripe subscriptions — the raw Stripe-state mirror for Pro subscriptions
// (phase9.md §11), kept deliberately separate from paidEntitlements: this
// table stores Stripe's own status strings/period dates verbatim for
// operational visibility and webhook reconciliation; paidEntitlements
// stores IncidentRank's derived access policy. Do not derive access
// decisions from this table directly.
// ─────────────────────────────────────────────────────────────────────────

export const stripeSubscriptions = pgTable("stripe_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id").notNull(),
  stripePriceId: text("stripe_price_id").notNull(),
  stripeProductId: text("stripe_product_id").notNull(),
  stripeStatus: text("stripe_status").notNull(),
  currentPeriodStart: timestamp("current_period_start", {
    withTimezone: true,
  }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("stripe_subscriptions_subscription_id_idx").on(
    table.stripeSubscriptionId,
  ),
  index("stripe_subscriptions_user_id_idx").on(table.userId),
  index("stripe_subscriptions_customer_id_idx").on(table.stripeCustomerId),
  index("stripe_subscriptions_status_idx").on(table.stripeStatus),
]);

// ─────────────────────────────────────────────────────────────────────────
// Stripe webhook events — the idempotency ledger (phase9.md §12). Every
// verified webhook attempts `INSERT ... ON CONFLICT (stripe_event_id) DO
// NOTHING` as its reservation step; zero rows returned means this exact
// event was already seen and must be acknowledged without re-processing.
// Stripe may legitimately deliver the same event more than once.
// ─────────────────────────────────────────────────────────────────────────

export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  stripeEventId: text("stripe_event_id").notNull(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  processingStatus: stripeWebhookProcessingStatusEnum("processing_status")
    .notNull()
    .default("received"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("stripe_webhook_events_event_id_idx").on(table.stripeEventId),
  index("stripe_webhook_events_processing_status_idx").on(
    table.processingStatus,
  ),
]);

// ─────────────────────────────────────────────────────────────────────────
// Founding Engineer allocations — the race-safe capacity model for the
// first-100 cap (phase9.md §22/§23). Exactly 100 rows are pre-seeded
// (slotNumber 1..100, userId null, status 'released') by the db:seed
// script; a reservation claims the lowest free slot via `UPDATE ...
// WHERE slot_number = (SELECT ... WHERE status IN ('released','expired')
// ORDER BY slot_number LIMIT 1 FOR UPDATE SKIP LOCKED)`. This guarantees
// at most 100 rows are ever in ('reserved','issued') simultaneously
// without an advisory lock or a separate counter to keep in sync, and
// gives a free, directly-queryable "N remaining" count for the pricing
// page. Never delete or add rows outside the one-time seed — capacity
// changes only ever move a slot between these four statuses.
// ─────────────────────────────────────────────────────────────────────────

export const foundingEngineerAllocations = pgTable(
  "founding_engineer_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slotNumber: integer("slot_number").notNull(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: foundingAllocationStatusEnum("status").notNull().default(
      "released",
    ),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    reservedAt: timestamp("reserved_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("founding_engineer_allocations_slot_number_idx").on(
      table.slotNumber,
    ),
    index("founding_engineer_allocations_status_idx").on(table.status),
    index("founding_engineer_allocations_user_id_idx").on(table.userId),
    // A user may hold at most one active (reserved or issued) allocation
    // at a time — the application-level "existing reservation" reuse
    // logic (phase9.md §39) relies on this never being violated.
    uniqueIndex("founding_engineer_allocations_one_active_per_user_idx")
      .on(table.userId)
      .where(sql`${table.status} IN ('reserved', 'issued')`),
  ],
);
