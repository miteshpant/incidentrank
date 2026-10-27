import { afterEach, describe, expect, it, vi } from "vitest";
import { sendPromotionalInviteEmail, sendReferralRewardEmail } from "./index";

/**
 * Confirms the Phase 8 email factory's selection logic (docs/
 * implementation_plan/phase8_admin_promotional_access_referrals.md §26,
 * phase8loc.md Step 12/13): the test/no-op adapter is used whenever
 * TRANSACTIONAL_EMAILS_ENABLED is off or no RESEND_API_KEY is
 * configured — dev/test must never send real email unexpectedly. Does
 * not test the real ResendEmailService's network call (no live API key
 * in this test environment) — that's covered by live QA.
 */
describe("email factory", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the no-op adapter (resolves ok) when TRANSACTIONAL_EMAILS_ENABLED is false", async () => {
    vi.stubEnv("TRANSACTIONAL_EMAILS_ENABLED", "false");
    vi.stubEnv("RESEND_API_KEY", "re_fake_key_for_test");

    const result = await sendPromotionalInviteEmail({
      to: "someone@example.com",
      inviteUrl: "https://incidentrank.com/invite/token",
    });

    expect(result.ok).toBe(true);
  });

  it("uses the no-op adapter when RESEND_API_KEY is unset, even if the flag is on", async () => {
    vi.stubEnv("TRANSACTIONAL_EMAILS_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "");

    const result = await sendReferralRewardEmail({
      to: "someone@example.com",
      passCount: 1,
    });

    expect(result.ok).toBe(true);
  });
});
