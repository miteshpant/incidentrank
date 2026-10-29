import { SiteHeader } from "@/components/site-header";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { listPrivacyRequestsForUser } from "@/lib/server/privacy-requests";
import { PrivacyRequestForm } from "./privacy-request-form";
import { DeleteAccountSection } from "./delete-account-section";

// Always per-user data — never a meaningful static version.
export const instant = false;

export default async function PrivacySettingsPage() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return null; // middleware protects this route; unreachable in practice.
  }

  const requests = await listPrivacyRequestsForUser(user.id);

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
        <p className="mt-2 text-sm text-muted">
          Request access to, correction of, or deletion of your personal information. See our{" "}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>{" "}
          for details.
        </p>

        <div className="mt-10">
          <PrivacyRequestForm
            existingRequests={requests.map((r) => ({
              id: r.id,
              requestType: r.requestType,
              status: r.status,
              requestedAt: r.requestedAt.toISOString(),
            }))}
          />
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <DeleteAccountSection />
        </div>
      </section>
    </main>
  );
}
