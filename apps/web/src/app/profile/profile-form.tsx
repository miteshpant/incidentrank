"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@incidentrank/db";

interface ProfileFormProps {
  user: User;
}

export function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [leaderboardVisible, setLeaderboardVisible] = useState(
    user.leaderboardVisible,
  );
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  function save(updates: { displayName?: string; leaderboardVisible?: boolean }) {
    setSavedMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (response.ok) {
        setSavedMessage("Saved.");
        router.refresh();
      } else {
        setSavedMessage("Could not save. Try again.");
      }
    });
  }

  return (
    <div className="mt-10 flex flex-col gap-8">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save({ displayName });
        }}
      >
        <label htmlFor="displayName" className="font-mono text-xs text-muted">
          Display Name
        </label>
        <div className="flex gap-2">
          <input
            id="displayName"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={100}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={isPending || displayName.trim().length === 0}
            className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
        <p className="text-xs text-muted">
          Shown on the public leaderboard if visible. Your email is never
          shown publicly.
        </p>
      </form>

      <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-surface p-4">
        <div>
          <p className="text-sm">Show me on public leaderboards</p>
          <p className="mt-1 text-xs text-muted">
            When on, this becomes publicly visible to anyone: your display
            name, IncidentRank band, normalized leaderboard score,
            qualifying-incidents count, and evidence breadth. Your email,
            billing information, assessment reports, practice attempt
            timelines, detailed dimension/skill breakdown, and organization
            memberships are never shown publicly, regardless of this
            setting. When off, your scores still save normally but are
            excluded from public leaderboard queries — your own attempt
            history is always visible to you either way.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={leaderboardVisible}
          disabled={isPending}
          onClick={() => {
            const next = !leaderboardVisible;
            setLeaderboardVisible(next);
            save({ leaderboardVisible: next });
          }}
          className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
            leaderboardVisible
              ? "border-accent bg-accent"
              : "border-border bg-background"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform ${
              leaderboardVisible ? "translate-x-6 bg-foreground" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {savedMessage && (
        <p className="font-mono text-xs text-muted">{savedMessage}</p>
      )}
    </div>
  );
}
