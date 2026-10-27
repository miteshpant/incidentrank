import "server-only";
import { isTransactionalEmailsEnabled } from "../feature-flags";
import { ResendEmailService } from "./resend-email-service";
import { TestEmailService } from "./test-email-service";
import type {
  SendOrganizationOwnerInviteInput,
  SendOrganizationReactivatedNotificationInput,
  SendOrganizationSuspendedNotificationInput,
  SendPromotionalInviteInput,
  SendReferralRewardInput,
  SendResult,
  TransactionalEmailService,
} from "./transactional-email-service";

export type {
  SendOrganizationOwnerInviteInput,
  SendOrganizationReactivatedNotificationInput,
  SendOrganizationSuspendedNotificationInput,
  SendPromotionalInviteInput,
  SendReferralRewardInput,
  SendResult,
  TransactionalEmailService,
};

/**
 * Selects the real Resend adapter only when the feature flag is on AND a
 * key is actually configured; otherwise falls back to the no-op test
 * adapter. This is the one place that decision is made — every call site
 * uses sendPromotionalInviteEmail/sendReferralRewardEmail below rather
 * than constructing an adapter itself.
 */
function getEmailService(): TransactionalEmailService {
  const apiKey = process.env.RESEND_API_KEY;
  if (isTransactionalEmailsEnabled() && apiKey) {
    return new ResendEmailService(apiKey);
  }
  return new TestEmailService();
}

export async function sendPromotionalInviteEmail(
  input: SendPromotionalInviteInput,
): Promise<SendResult> {
  return getEmailService().sendPromotionalInvite(input);
}

export async function sendReferralRewardEmail(
  input: SendReferralRewardInput,
): Promise<SendResult> {
  return getEmailService().sendReferralReward(input);
}

export async function sendOrganizationOwnerInviteEmail(
  input: SendOrganizationOwnerInviteInput,
): Promise<SendResult> {
  return getEmailService().sendOrganizationOwnerInvite(input);
}

export async function sendOrganizationSuspendedNotificationEmail(
  input: SendOrganizationSuspendedNotificationInput,
): Promise<SendResult> {
  return getEmailService().sendOrganizationSuspendedNotification(input);
}

export async function sendOrganizationReactivatedNotificationEmail(
  input: SendOrganizationReactivatedNotificationInput,
): Promise<SendResult> {
  return getEmailService().sendOrganizationReactivatedNotification(input);
}
