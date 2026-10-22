import { relations } from "drizzle-orm";
import {
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

export const usersRelations = relations(users, ({ many }) => ({
  attempts: many(attempts),
  organizationMemberships: many(organizationMembers),
  assessmentCandidacies: many(assessmentCandidates),
  sentOrganizationInvitations: many(organizationInvitations),
}));

export const scenariosRelations = relations(scenarios, ({ one, many }) => ({
  attempts: many(attempts),
  assessments: many(assessments),
  versions: many(scenarioVersions),
  organization: one(organizations, {
    fields: [scenarios.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [scenarios.createdByUserId],
    references: [users.id],
  }),
}));

export const scenarioVersionsRelations = relations(
  scenarioVersions,
  ({ one }) => ({
    scenario: one(scenarios, {
      fields: [scenarioVersions.scenarioId],
      references: [scenarios.id],
    }),
    createdBy: one(users, {
      fields: [scenarioVersions.createdByUserId],
      references: [users.id],
    }),
  }),
);

export const attemptsRelations = relations(attempts, ({ one, many }) => ({
  user: one(users, {
    fields: [attempts.userId],
    references: [users.id],
  }),
  scenario: one(scenarios, {
    fields: [attempts.scenarioId],
    references: [scenarios.id],
  }),
  assessment: one(assessments, {
    fields: [attempts.assessmentId],
    references: [assessments.id],
  }),
  actionGroups: many(attemptActionGroups),
  events: many(attemptEvents),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  invitations: many(organizationInvitations),
  assessments: many(assessments),
  scenarios: many(scenarios),
}));

export const organizationMembersRelations = relations(
  organizationMembers,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationMembers.organizationId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [organizationMembers.userId],
      references: [users.id],
    }),
  }),
);

export const organizationInvitationsRelations = relations(
  organizationInvitations,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationInvitations.organizationId],
      references: [organizations.id],
    }),
    invitedBy: one(users, {
      fields: [organizationInvitations.invitedByUserId],
      references: [users.id],
    }),
  }),
);

export const assessmentsRelations = relations(assessments, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [assessments.organizationId],
    references: [organizations.id],
  }),
  scenario: one(scenarios, {
    fields: [assessments.scenarioId],
    references: [scenarios.id],
  }),
  createdBy: one(users, {
    fields: [assessments.createdByUserId],
    references: [users.id],
  }),
  candidates: many(assessmentCandidates),
}));

export const assessmentCandidatesRelations = relations(
  assessmentCandidates,
  ({ one }) => ({
    assessment: one(assessments, {
      fields: [assessmentCandidates.assessmentId],
      references: [assessments.id],
    }),
    user: one(users, {
      fields: [assessmentCandidates.userId],
      references: [users.id],
    }),
    attempt: one(attempts, {
      fields: [assessmentCandidates.attemptId],
      references: [attempts.id],
    }),
  }),
);

export const attemptActionGroupsRelations = relations(
  attemptActionGroups,
  ({ one, many }) => ({
    attempt: one(attempts, {
      fields: [attemptActionGroups.attemptId],
      references: [attempts.id],
    }),
    changes: many(attemptActionChanges),
  }),
);

export const attemptActionChangesRelations = relations(
  attemptActionChanges,
  ({ one }) => ({
    actionGroup: one(attemptActionGroups, {
      fields: [attemptActionChanges.actionGroupId],
      references: [attemptActionGroups.id],
    }),
  }),
);

export const attemptEventsRelations = relations(attemptEvents, ({ one }) => ({
  attempt: one(attempts, {
    fields: [attemptEvents.attemptId],
    references: [attempts.id],
  }),
}));
