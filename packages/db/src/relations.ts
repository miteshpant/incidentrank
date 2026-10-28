import { relations } from "drizzle-orm";
import {
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
  organizationAuditEvents,
  organizationInvitations,
  organizationMembers,
  organizations,
  paidEntitlements,
  promotionalInvites,
  rankSnapshots,
  referrals,
  scenarios,
  scenarioVersions,
  stripeCustomers,
  stripeSubscriptions,
  users,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  attempts: many(attempts),
  organizationMemberships: many(organizationMembers),
  assessmentCandidacies: many(assessmentCandidates),
  sentOrganizationInvitations: many(organizationInvitations),
  adminMemberships: many(adminUsers),
  incidentPasses: many(incidentPasses),
  createdPromotionalInvites: many(promotionalInvites),
  referralsAsReferrer: many(referrals, { relationName: "referrerUser" }),
  referralsAsReferred: many(referrals, { relationName: "referredUser" }),
  stripeCustomer: many(stripeCustomers),
  paidEntitlements: many(paidEntitlements),
  stripeSubscriptions: many(stripeSubscriptions),
  foundingEngineerAllocations: many(foundingEngineerAllocations),
  rankSnapshots: many(rankSnapshots),
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
  incidentPass: one(incidentPasses, {
    fields: [attempts.incidentPassId],
    references: [incidentPasses.id],
  }),
  actionGroups: many(attemptActionGroups),
  events: many(attemptEvents),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  invitations: many(organizationInvitations),
  assessments: many(assessments),
  scenarios: many(scenarios),
  auditEvents: many(organizationAuditEvents),
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

export const organizationAuditEventsRelations = relations(
  organizationAuditEvents,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationAuditEvents.organizationId],
      references: [organizations.id],
    }),
    actorUser: one(users, {
      fields: [organizationAuditEvents.actorUserId],
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

export const adminUsersRelations = relations(adminUsers, ({ one }) => ({
  user: one(users, {
    fields: [adminUsers.userId],
    references: [users.id],
  }),
  createdBy: one(users, {
    fields: [adminUsers.createdByUserId],
    references: [users.id],
  }),
}));

export const adminInvitesRelations = relations(adminInvites, ({ one }) => ({
  invitedBy: one(users, {
    fields: [adminInvites.invitedByUserId],
    references: [users.id],
  }),
  acceptedBy: one(users, {
    fields: [adminInvites.acceptedByUserId],
    references: [users.id],
  }),
}));

export const incidentPassesRelations = relations(
  incidentPasses,
  ({ one, many }) => ({
    user: one(users, {
      fields: [incidentPasses.userId],
      references: [users.id],
    }),
    scenario: one(scenarios, {
      fields: [incidentPasses.scenarioId],
      references: [scenarios.id],
    }),
    attempts: many(attempts),
    fundedByPromotionalInvite: many(promotionalInvites),
  }),
);

export const promotionalInvitesRelations = relations(
  promotionalInvites,
  ({ one }) => ({
    createdBy: one(users, {
      fields: [promotionalInvites.createdByUserId],
      references: [users.id],
    }),
    redeemedBy: one(users, {
      fields: [promotionalInvites.redeemedByUserId],
      references: [users.id],
    }),
    incidentPass: one(incidentPasses, {
      fields: [promotionalInvites.incidentPassId],
      references: [incidentPasses.id],
    }),
  }),
);

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(users, {
    fields: [referrals.referrerUserId],
    references: [users.id],
    relationName: "referrerUser",
  }),
  referred: one(users, {
    fields: [referrals.referredUserId],
    references: [users.id],
    relationName: "referredUser",
  }),
  referredIncidentPass: one(incidentPasses, {
    fields: [referrals.referredIncidentPassId],
    references: [incidentPasses.id],
  }),
  qualifyingAttempt: one(attempts, {
    fields: [referrals.qualifyingAttemptId],
    references: [attempts.id],
  }),
  rewardIncidentPass: one(incidentPasses, {
    fields: [referrals.rewardIncidentPassId],
    references: [incidentPasses.id],
  }),
}));

export const adminAuditEventsRelations = relations(
  adminAuditEvents,
  ({ one }) => ({
    adminUser: one(users, {
      fields: [adminAuditEvents.adminUserId],
      references: [users.id],
    }),
  }),
);

export const stripeCustomersRelations = relations(
  stripeCustomers,
  ({ one }) => ({
    user: one(users, {
      fields: [stripeCustomers.userId],
      references: [users.id],
    }),
  }),
);

export const paidEntitlementsRelations = relations(
  paidEntitlements,
  ({ one }) => ({
    user: one(users, {
      fields: [paidEntitlements.userId],
      references: [users.id],
    }),
  }),
);

export const stripeSubscriptionsRelations = relations(
  stripeSubscriptions,
  ({ one }) => ({
    user: one(users, {
      fields: [stripeSubscriptions.userId],
      references: [users.id],
    }),
  }),
);

export const rankSnapshotsRelations = relations(
  rankSnapshots,
  ({ one }) => ({
    user: one(users, {
      fields: [rankSnapshots.userId],
      references: [users.id],
    }),
    triggerAttempt: one(attempts, {
      fields: [rankSnapshots.triggerAttemptId],
      references: [attempts.id],
    }),
  }),
);

export const foundingEngineerAllocationsRelations = relations(
  foundingEngineerAllocations,
  ({ one }) => ({
    user: one(users, {
      fields: [foundingEngineerAllocations.userId],
      references: [users.id],
    }),
  }),
);
