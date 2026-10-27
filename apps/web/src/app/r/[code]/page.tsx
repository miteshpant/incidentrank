import { SiteHeader } from "@/components/site-header";
import { ReferralClaim } from "./referral-claim";

export const instant = false;

export default async function ReferralPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
        <ReferralClaim code={code} />
      </section>
    </main>
  );
}
