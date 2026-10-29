import { SiteHeader } from "@/components/site-header";
import { PRIVACY_BODY, PRIVACY_TITLE, PRIVACY_VERSION } from "@/content/legal/privacy";

/**
 * Phase 10D (phasse10d.md §15). Always reachable, never gated — see
 * terms/page.tsx's header comment for the plain-preformatted-text
 * rendering rationale (self-authored static content, not markdown/HTML).
 */
export default function PrivacyPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <article className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">{PRIVACY_TITLE}</h1>
        <p className="mt-2 font-mono text-xs text-muted">Version {PRIVACY_VERSION}</p>
        <pre className="mt-8 whitespace-pre-wrap text-sm leading-relaxed font-sans">
          {PRIVACY_BODY}
        </pre>
      </article>
    </main>
  );
}
