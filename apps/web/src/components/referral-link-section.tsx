"use client";

import { useState, useTransition } from "react";

const STATUS_LABEL: Record<string, string> = {
  created: "Invited",
  claimed: "Joined",
  qualified: "Completed",
  rewarded: "Completed — Reward earned",
  rejected: "Rejected",
  expired: "Expired",
  revoked: "Revoked",
};

interface ReferralRow {
  id: string;
  status: string;
  claimed: boolean;
  rewarded: boolean;
}

interface ReferralLinkSectionProps {
  eligible: boolean;
  existingCode: boolean;
  referrals: ReferralRow[];
}

/**
 * Referral link copy/display + coarse progress list (docs/
 * implementation_plan/phase8_admin_promotional_access_referrals.md §14/
 * §22 — never score/tier/reasoning, only Invited/Joined/Completed/Reward
 * earned, per §27's privacy rule enforced upstream in
 * incident-pass-panel.tsx's query, which never selects a referred
 * attempt's score columns at all).
 */
export function ReferralLinkSection({ eligible, existingCode, referrals }: ReferralLinkSectionProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleGetLink() {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/referrals/code", { method: "POST" });
      const data = (await response.json()) as { code?: string; error?: string };
      if (!response.ok || !data.code) {
        setError(data.error ?? "Failed to create referral link");
        return;
      }
      setUrl(`${window.location.origin}/r/${data.code}`);
    });
  }

  function handleCopy() {
    if (!url) return;
    void navigator.clipboard.writeText(url).then(() => setCopied(true));
  }

  if (!eligible) return null;

  return (
    <div className="mt-6 border-t border-border pt-6">
      <h3 className="font-mono text-xs uppercase tracking-wide text-muted">Invite another engineer</h3>
      <p className="mt-2 text-sm text-muted">
        If they successfully complete their first IncidentRank incident, you&apos;ll earn another
        Incident Pass.
      </p>

      {error && <p className="mt-2 text-sm text-[#dc2626]">{error}</p>}

      {!url ? (
        <button
          type="button"
          onClick={handleGetLink}
          disabled={isPending}
          className="mt-3 rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Loading…" : existingCode ? "Show Referral Link" : "Copy Referral Link"}
        </button>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <code className="break-all rounded-md border border-border bg-background px-3 py-2 text-xs">
            {url}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-md border border-border px-3 py-2 font-mono text-xs transition-colors hover:border-foreground/40"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {referrals.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {referrals.map((referral) => (
            <li
              key={referral.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="font-mono text-xs text-muted">
                {STATUS_LABEL[referral.status] ?? referral.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
