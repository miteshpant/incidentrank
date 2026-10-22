"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const { signOut } = useClerk();
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        void signOut(() => router.push("/"));
      }}
      className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
    >
      Sign out
    </button>
  );
}
