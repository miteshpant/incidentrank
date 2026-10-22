import { SiteHeader } from "@/components/site-header";
import { MembersView } from "./members-view";

// Always per-user, per-organization data — never a meaningful static version.
export const instant = false;

export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <MembersView slug={slug} />
      </section>
    </main>
  );
}
