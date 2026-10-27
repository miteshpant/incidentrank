"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Preview {
  valid: string[];
  duplicate: string[];
  invalid: string[];
}

/**
 * The two-step bulk-invite flow (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §7.1/§7.2): paste one or
 * many emails, optional campaign label, preview the
 * valid/duplicate/invalid split, then explicitly confirm before any
 * invite/pass is actually created or sent — "Admin confirms before
 * sending."
 */
export function NewPromoInviteForm() {
  const router = useRouter();
  const [emailsText, setEmailsText] = useState("");
  const [campaign, setCampaign] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  function parseEmails(): string[] {
    return emailsText
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }

  function handlePreview(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/promotional-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: parseEmails(),
          campaign: campaign.trim() || null,
          confirm: false,
        }),
      });
      const data = (await response.json()) as { preview?: Preview; error?: string };
      if (!response.ok || !data.preview) {
        setError(data.error ?? "Failed to preview invites");
        return;
      }
      setPreview(data.preview);
    });
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/promotional-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: parseEmails(),
          campaign: campaign.trim() || null,
          confirm: true,
        }),
      });
      const data = (await response.json()) as {
        created?: { status: string }[];
        error?: string;
      };
      if (!response.ok || !data.created) {
        setError(data.error ?? "Failed to send invites");
        return;
      }
      const sent = data.created.filter((c) => c.status === "sent").length;
      const failed = data.created.filter((c) => c.status !== "sent").length;
      setResult({ sent, failed });
      setPreview(null);
      setEmailsText("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      {!preview ? (
        <form onSubmit={handlePreview} className="flex flex-col gap-3">
          <div>
            <label htmlFor="promo-emails" className="font-mono text-xs uppercase tracking-wide text-muted">
              Recipient Emails
            </label>
            <textarea
              id="promo-emails"
              value={emailsText}
              onChange={(e) => setEmailsText(e.target.value)}
              rows={4}
              placeholder="one@example.com, two@example.com&#10;three@example.com"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="promo-campaign" className="font-mono text-xs uppercase tracking-wide text-muted">
              Campaign (optional)
            </label>
            <input
              id="promo-campaign"
              type="text"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-[#dc2626]">{error}</p>}
          <button
            type="submit"
            disabled={isPending || parseEmails().length === 0}
            className="self-start rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Checking…" : "Preview Recipients"}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-wide text-muted">Preview</p>
          <p className="text-sm">
            {preview.valid.length} valid · {preview.duplicate.length} duplicate ·{" "}
            {preview.invalid.length} invalid
          </p>
          {preview.invalid.length > 0 && (
            <p className="text-xs text-[#dc2626]">Invalid: {preview.invalid.join(", ")}</p>
          )}
          {preview.duplicate.length > 0 && (
            <p className="text-xs text-muted">Duplicate (skipped): {preview.duplicate.join(", ")}</p>
          )}
          {error && <p className="text-sm text-[#dc2626]">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={isPending}
              className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending || preview.valid.length === 0}
              className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Sending…" : `Send ${preview.valid.length} Invite(s)`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className="mt-3 text-sm text-foreground">
          {result.sent} sent{result.failed > 0 ? `, ${result.failed} failed` : ""}.
        </p>
      )}
    </div>
  );
}
