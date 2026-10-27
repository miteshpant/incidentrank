import "server-only";
import { Resend } from "resend";
import type {
  SendOrganizationOwnerInviteInput,
  SendOrganizationReactivatedNotificationInput,
  SendOrganizationSuspendedNotificationInput,
  SendPromotionalInviteInput,
  SendReferralRewardInput,
  SendResult,
  TransactionalEmailService,
} from "./transactional-email-service";

const SENDER = "IncidentRank <support@incidentrank.com>";

/**
 * Real Resend adapter. Reads process.env.RESEND_API_KEY directly — never
 * copied between env files by this codebase (phase8loc.md's "Important
 * secret rule"), never logged. `sent` here means Resend's API accepted
 * the send request; actual inbox delivery depends on the
 * support@incidentrank.com sending domain's SPF/DKIM/DMARC being
 * verified in Resend's dashboard, which is outside this codebase and not
 * assumed complete (see the Phase 8 completion report's email-readiness
 * section).
 */
export class ResendEmailService implements TransactionalEmailService {
  private readonly client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async sendPromotionalInvite(input: SendPromotionalInviteInput): Promise<SendResult> {
    try {
      const result = await this.client.emails.send({
        from: SENDER,
        to: input.to,
        subject: "You're invited to try an IncidentRank incident",
        text: [
          "You've been invited to try one IncidentRank production incident at no cost.",
          "",
          "You have one Incident Pass. Choose one premium incident to try at no cost.",
          "",
          `Choose your incident: ${input.inviteUrl}`,
          "",
          `This invitation is intended for ${input.to}.`,
        ].join("\n"),
      });
      if (result.error) {
        return { ok: false, error: result.error.message };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unknown send error" };
    }
  }

  async sendReferralReward(input: SendReferralRewardInput): Promise<SendResult> {
    try {
      const result = await this.client.emails.send({
        from: SENDER,
        to: input.to,
        subject: "You've earned a new Incident Pass",
        text: [
          `Your referral resolved their first IncidentRank incident — you've earned ${input.passCount === 1 ? "a new Incident Pass" : `${input.passCount} new Incident Passes`}.`,
          "",
          "Choose one premium incident to try at no cost.",
        ].join("\n"),
      });
      if (result.error) {
        return { ok: false, error: result.error.message };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unknown send error" };
    }
  }

  async sendOrganizationOwnerInvite(
    input: SendOrganizationOwnerInviteInput,
  ): Promise<SendResult> {
    try {
      const subject = input.isAdditionalOwner
        ? `You've been invited to become an owner of ${input.organizationName} on IncidentRank`
        : `You've been assigned as an owner of ${input.organizationName} on IncidentRank`;
      const intro = input.isAdditionalOwner
        ? `You've been invited to become an owner of ${input.organizationName} on IncidentRank.`
        : `IncidentRank has created an organization for ${input.organizationName}, and you've been invited as its owner.`;
      const result = await this.client.emails.send({
        from: SENDER,
        to: input.to,
        subject,
        text: [
          intro,
          "",
          "Sign in or create an account using this email address, then accept the invitation to activate your owner access.",
          "",
          `Accept your invitation: ${input.inviteUrl}`,
          "",
          `This invitation is intended for ${input.to}.`,
        ].join("\n"),
      });
      if (result.error) {
        return { ok: false, error: result.error.message };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unknown send error" };
    }
  }

  async sendOrganizationSuspendedNotification(
    input: SendOrganizationSuspendedNotificationInput,
  ): Promise<SendResult> {
    try {
      const result = await this.client.emails.send({
        from: SENDER,
        to: input.to,
        subject: "Your IncidentRank organization has been suspended",
        text: [
          `IncidentRank has suspended ${input.organizationName}.`,
          "",
          `Reason: ${input.reason}`,
          "",
          "Existing data remains available, but new assessments, invitations, and scenario changes are disabled until this is resolved.",
          "",
          "Contact support@incidentrank.com with any questions.",
        ].join("\n"),
      });
      if (result.error) {
        return { ok: false, error: result.error.message };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unknown send error" };
    }
  }

  async sendOrganizationReactivatedNotification(
    input: SendOrganizationReactivatedNotificationInput,
  ): Promise<SendResult> {
    try {
      const result = await this.client.emails.send({
        from: SENDER,
        to: input.to,
        subject: `${input.organizationName} has been reactivated on IncidentRank`,
        text: [
          `IncidentRank has reactivated ${input.organizationName}.`,
          "",
          "Normal organization functionality is available again.",
        ].join("\n"),
      });
      if (result.error) {
        return { ok: false, error: result.error.message };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unknown send error" };
    }
  }
}
