import { SiteHeader } from "@/components/site-header";
import { PromoInviteAcceptance } from "./promo-invite-acceptance";

// Uses client-side auth state (useAuth) to decide sign-in vs accept —
// never a meaningful static version, same reasoning as the assessment
// invite page.
export const instant = false;

export default async function PromoInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
        <PromoInviteAcceptance token={token} />
      </section>
    </main>
  );
}
