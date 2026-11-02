"use client";

import { useState } from "react";

/**
 * Minimal copy-to-clipboard link display, mirroring
 * ReferralLinkSection's exact <code> + Copy button pattern — the only
 * difference is this one receives an already-known URL (the Weekly
 * Challenge's own incident page) rather than fetching a generated token
 * first.
 */
export function CopyableLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(url).then(() => setCopied(true));
  }

  return (
    <div className="mt-3 flex items-center gap-3">
      <code className="break-all rounded-md border border-border bg-background px-3 py-2 text-xs">
        {url}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded-md border border-border px-3 py-2 font-mono text-xs transition-colors hover:border-foreground/40"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
