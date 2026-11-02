import { SiteHeader } from "@/components/site-header";
import { ChallengeComparison } from "./challenge-comparison";

export const instant = false;

export default async function ChallengeComparePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <section className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <ChallengeComparison token={token} />
      </section>
    </main>
  );
}
