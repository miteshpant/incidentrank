import { SiteHeader } from "@/components/site-header";
import { AdminInviteAcceptance } from "./admin-invite-acceptance";

export const instant = false;

export default async function AdminInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
        <AdminInviteAcceptance token={token} />
      </section>
    </main>
  );
}
