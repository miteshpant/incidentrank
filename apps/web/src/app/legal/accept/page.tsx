import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { getCurrentAcceptanceStatus } from "@/lib/server/legal-acceptance";
import { LegalAcceptForm } from "./legal-accept-form";

/**
 * Phase 10D (phasse10d.md §18/§19). Signed-out visitors are redirected to
 * sign in by proxy.ts's own route matcher (this path is not in the
 * public-route allowlist there is none to add to, since this page itself
 * requires auth to know who is accepting) — here we only need to handle
 * "already accepted" (skip straight through) and "no user" (shouldn't
 * normally happen once signed in, but fail safe rather than crash).
 */
export default async function LegalAcceptPage() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    redirect("/");
  }

  const status = await getCurrentAcceptanceStatus(user.id);
  if (status.allCurrent) {
    redirect("/profile");
  }

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Before you continue</h1>
        <p className="mt-3 text-sm text-muted">
          Please review and accept our Terms of Service and Privacy Policy to continue using IncidentRank.
        </p>
        <LegalAcceptForm />
      </section>
    </main>
  );
}
