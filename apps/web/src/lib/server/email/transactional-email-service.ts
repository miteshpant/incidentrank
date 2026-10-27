import "server-only";

export type SendResult = { ok: true } | { ok: false; error: string };

export interface SendPromotionalInviteInput {
  to: string;
  inviteUrl: string;
}

export interface SendReferralRewardInput {
  to: string;
  passCount: number;
}

/**
 * Phase 10A: one method serves both the initial-owner invitation
 * (organization just created by an IncidentRank admin) and an additional
 * owner invitation (an existing owner inviting a co-owner) — the two
 * cases differ only in subject-line wording (docs/implementation_plan/
 * phase10a.md §9 vs §12), expressed via isAdditionalOwner rather than two
 * near-duplicate methods.
 */
export interface SendOrganizationOwnerInviteInput {
  to: string;
  organizationName: string;
  inviteUrl: string;
  isAdditionalOwner: boolean;
}

export interface SendOrganizationSuspendedNotificationInput {
  to: string;
  organizationName: string;
  reason: string;
}

export interface SendOrganizationReactivatedNotificationInput {
  to: string;
  organizationName: string;
}

/**
 * Provider-agnostic boundary (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §26 / phase8loc.md Step
 * 12). Never throws — every implementation returns a SendResult so
 * callers can set promotionalInvites.status = "send_failed" cleanly
 * rather than needing a try/catch at every call site. `sent` (the
 * caller's interpretation of `{ok: true}`) means the provider accepted
 * the API request, NOT that the email was delivered — there is no
 * webhook-based delivery tracking in this phase (phase8loc.md Step 12A).
 */
export interface TransactionalEmailService {
  sendPromotionalInvite(input: SendPromotionalInviteInput): Promise<SendResult>;
  sendReferralReward(input: SendReferralRewardInput): Promise<SendResult>;
  sendOrganizationOwnerInvite(input: SendOrganizationOwnerInviteInput): Promise<SendResult>;
  sendOrganizationSuspendedNotification(
    input: SendOrganizationSuspendedNotificationInput,
  ): Promise<SendResult>;
  sendOrganizationReactivatedNotification(
    input: SendOrganizationReactivatedNotificationInput,
  ): Promise<SendResult>;
}
