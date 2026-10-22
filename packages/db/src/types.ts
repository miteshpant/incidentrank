import type {
  assessmentCandidates,
  assessments,
  attemptActionChanges,
  attemptActionGroups,
  attemptEvents,
  attempts,
  organizationInvitations,
  organizationMembers,
  organizations,
  scenarios,
  scenarioVersions,
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
