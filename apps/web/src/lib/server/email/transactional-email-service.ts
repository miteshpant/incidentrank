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
}
