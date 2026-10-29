import "server-only";
import type {
  SendOrganizationOwnerInviteInput,
  SendOrganizationReactivatedNotificationInput,
  SendOrganizationSuspendedNotificationInput,
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
 *
 * Phase 10D data-minimization: never logs a raw email address or a
 * full invite URL (which embeds an unhashed, bearer-credential token)
 * — only non-sensitive identifiers, matching admin-audit.ts's "never
 * log raw tokens" rule.
 */
export class TestEmailService implements TransactionalEmailService {
  async sendPromotionalInvite(input: SendPromotionalInviteInput): Promise<SendResult> {
    void input;
    console.log("[TestEmailService] promotional invite sent");
    return { ok: true };
  }

  async sendReferralReward(input: SendReferralRewardInput): Promise<SendResult> {
    console.log(`[TestEmailService] referral reward sent (${input.passCount} pass(es))`);
    return { ok: true };
  }

  async sendOrganizationOwnerInvite(
    input: SendOrganizationOwnerInviteInput,
  ): Promise<SendResult> {
    console.log(
      `[TestEmailService] organization owner invite sent (${input.isAdditionalOwner ? "additional" : "initial"}) for org "${input.organizationName}"`,
    );
    return { ok: true };
  }

  async sendOrganizationSuspendedNotification(
    input: SendOrganizationSuspendedNotificationInput,
  ): Promise<SendResult> {
    console.log(
      `[TestEmailService] organization suspended notification sent for org "${input.organizationName}" (${input.reason})`,
    );
    return { ok: true };
  }

  async sendOrganizationReactivatedNotification(
    input: SendOrganizationReactivatedNotificationInput,
  ): Promise<SendResult> {
    console.log(
      `[TestEmailService] organization reactivated notification sent for org "${input.organizationName}"`,
    );
    return { ok: true };
  }
}
