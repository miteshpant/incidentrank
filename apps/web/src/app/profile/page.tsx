import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { ProfileContent } from "./profile-content";

// Always per-user data — never a meaningful static version.
export const instant = false;

export default function ProfilePage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-2 text-sm text-muted">
          Manage your display name and leaderboard visibility.
        </p>

        <Suspense fallback={<p className="mt-10 text-sm text-muted">Loading…</p>}>
          <ProfileContent />
        </Suspense>
      </section>
    </main>
  );
}
