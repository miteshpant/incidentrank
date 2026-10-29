import { SiteHeader } from "@/components/site-header";
import { TERMS_BODY, TERMS_TITLE, TERMS_VERSION } from "@/content/legal/terms";

/**
 * Phase 10D (phasse10d.md §14). Always reachable — signed-in or signed-out,
 * gated or not — never behind requireCurrentLegalAcceptance (a user must
 * be able to read the Terms before accepting them). Rendered as plain
 * preformatted text rather than parsed markdown/HTML — this is
 * self-authored static content, not user input, and avoids introducing a
 * markdown dependency or an HTML-injection surface for a document this
 * simple.
 */
export default function TermsPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <article className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">{TERMS_TITLE}</h1>
        <p className="mt-2 font-mono text-xs text-muted">Version {TERMS_VERSION}</p>
        <pre className="mt-8 whitespace-pre-wrap text-sm leading-relaxed font-sans">
          {TERMS_BODY}
        </pre>
      </article>
    </main>
  );
}
