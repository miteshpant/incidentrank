import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { SignOutButton } from "@/components/sign-out-button";
import { IncidentPassPanel } from "@/components/incident-pass-panel";
import { EngineerRankPanel } from "@/components/engineer-rank-panel";
import { ProfileForm } from "./profile-form";

export async function ProfileContent() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return null; // middleware protects this route; unreachable in practice.
  }

  return (
    <>
      <ProfileForm user={user} />

      <EngineerRankPanel userId={user.id} />

      <IncidentPassPanel userId={user.id} />

      <div className="mt-10 border-t border-border pt-6">
        <SignOutButton />
      </div>
    </>
  );
}
