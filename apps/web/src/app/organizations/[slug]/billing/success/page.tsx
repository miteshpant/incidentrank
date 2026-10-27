import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOrganizationMembership } from "@/lib/server/organization-auth";
import { getOrganizationCreditBalance } from "@/lib/server/organization-credits";

export const instant = false;

/**
 * Billing success redirect landing page (docs/implementation_plan/
 * phase10b.md §18/§59). Purely informational — NEVER mutates the
 * ledger from here. Verified webhook processing is the sole
 * authoritative source of truth; this page just reads the current
 * balance, which will already reflect the purchase if the webhook has
 * processed by the time the browser redirects back, or won't yet if
 * webhook delivery is still in flight (normal, expected race — a
 * refresh will show the updated balance once it lands).
 */
export default async function OrganizationBillingSuccessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <SuccessContent slug={slug} />
        </Suspense>
      </section>
    </main>
  );
}

async function SuccessContent({ slug }: { slug: string }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const result = await loadOrganizationMembership(slug, user);
  if (!result.ok) notFound();

  const balance = await getOrganizationCreditBalance(result.organization.id);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Payment received</h1>
      <p className="mt-4 text-sm text-muted">
        We&rsquo;re confirming your assessment credits. This usually takes just a few seconds.
      </p>
      <p className="mt-6 rounded-md border border-border bg-surface p-4 text-sm">
        Current available balance: <span className="font-mono">{balance.available}</span>{" "}
        assessment credit{balance.available === 1 ? "" : "s"}.
      </p>
      <Link
        href={`/organizations/${slug}/billing`}
        className="mt-6 inline-block rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        Back to billing
      </Link>
    </>
  );
}
