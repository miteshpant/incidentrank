import type {
  adminAuditEvents,
  adminInvites,
  adminUsers,
  assessmentCandidates,
  assessments,
  attemptActionChanges,
  attemptActionGroups,
  attemptEvents,
  attempts,
  foundingEngineerAllocations,
  incidentPasses,
  organizationInvitations,
  organizationMembers,
  organizations,
  paidEntitlements,
  promotionalInvites,
  referrals,
  scenarios,
  scenarioVersions,
  stripeCustomers,
  stripeSubscriptions,
  stripeWebhookEvents,
  users,
} from "./schema";

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Scenario = typeof scenarios.$inferSelect;
export type NewScenario = typeof scenarios.$inferInsert;

export type ScenarioVersion = typeof scenarioVersions.$inferSelect;
export type NewScenarioVersion = typeof scenarioVersions.$inferInsert;

export type Attempt = typeof attempts.$inferSelect;
export type NewAttempt = typeof attempts.$inferInsert;

export type AttemptActionGroup = typeof attemptActionGroups.$inferSelect;
export type NewAttemptActionGroup = typeof attemptActionGroups.$inferInsert;

export type AttemptActionChange = typeof attemptActionChanges.$inferSelect;
export type NewAttemptActionChange = typeof attemptActionChanges.$inferInsert;

export type AttemptEvent = typeof attemptEvents.$inferSelect;
export type NewAttemptEvent = typeof attemptEvents.$inferInsert;

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;

export type OrganizationInvitation = typeof organizationInvitations.$inferSelect;
export type NewOrganizationInvitation = typeof organizationInvitations.$inferInsert;

export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;

export type AssessmentCandidate = typeof assessmentCandidates.$inferSelect;
export type NewAssessmentCandidate = typeof assessmentCandidates.$inferInsert;

export type AdminUser = typeof adminUsers.$inferSelect;
export type NewAdminUser = typeof adminUsers.$inferInsert;

export type AdminInvite = typeof adminInvites.$inferSelect;
export type NewAdminInvite = typeof adminInvites.$inferInsert;

export type IncidentPass = typeof incidentPasses.$inferSelect;
export type NewIncidentPass = typeof incidentPasses.$inferInsert;

export type PromotionalInvite = typeof promotionalInvites.$inferSelect;
export type NewPromotionalInvite = typeof promotionalInvites.$inferInsert;

export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;

export type AdminAuditEvent = typeof adminAuditEvents.$inferSelect;
export type NewAdminAuditEvent = typeof adminAuditEvents.$inferInsert;

export type StripeCustomer = typeof stripeCustomers.$inferSelect;
export type NewStripeCustomer = typeof stripeCustomers.$inferInsert;

export type PaidEntitlement = typeof paidEntitlements.$inferSelect;
export type NewPaidEntitlement = typeof paidEntitlements.$inferInsert;

export type StripeSubscription = typeof stripeSubscriptions.$inferSelect;
export type NewStripeSubscription = typeof stripeSubscriptions.$inferInsert;

export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type NewStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;

export type FoundingEngineerAllocation =
  typeof foundingEngineerAllocations.$inferSelect;
export type NewFoundingEngineerAllocation =
  typeof foundingEngineerAllocations.$inferInsert;
