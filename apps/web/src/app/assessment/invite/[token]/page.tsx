import { SiteHeader } from "@/components/site-header";
import { InviteAcceptance } from "./invite-acceptance";

// Uses client-side auth state (useAuth) to decide sign-in vs accept —
// never a meaningful static version.
export const instant = false;

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
        <InviteAcceptance token={token} />
      </section>
    </main>
  );
}
