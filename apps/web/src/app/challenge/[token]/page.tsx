import { SiteHeader } from "@/components/site-header";
import { ChallengeAcceptance } from "./challenge-acceptance";

export const instant = false;

export default async function ChallengeLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
        <ChallengeAcceptance token={token} />
      </section>
    </main>
  );
}
