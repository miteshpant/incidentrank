import "server-only";
import type {
  SendPromotionalInviteInput,
  SendReferralRewardInput,
  SendResult,
  TransactionalEmailService,
} from "./transactional-email-service";

/**
 * No-op adapter — logs instead of sending. Selected automatically
 * whenever RESEND_API_KEY is unset or TRANSACTIONAL_EMAILS_ENABLED is
 * false (see index.ts's factory), so dev/test never sends real email
 * unexpectedly (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §37.8).
 */
export class TestEmailService implements TransactionalEmailService {
  async sendPromotionalInvite(input: SendPromotionalInviteInput): Promise<SendResult> {
    console.log(`[TestEmailService] promotional invite -> ${input.to}: ${input.inviteUrl}`);
    return { ok: true };
  }

  async sendReferralReward(input: SendReferralRewardInput): Promise<SendResult> {
    console.log(`[TestEmailService] referral reward -> ${input.to}: ${input.passCount} pass(es)`);
    return { ok: true };
  }
}
