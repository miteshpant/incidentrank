import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { SignOutButton } from "@/components/sign-out-button";
import { ProfileForm } from "./profile-form";

export async function ProfileContent() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return null; // middleware protects this route; unreachable in practice.
  }

  return (
    <>
      <ProfileForm user={user} />

      <div className="mt-10 border-t border-border pt-6">
        <SignOutButton />
      </div>
    </>
  );
}
