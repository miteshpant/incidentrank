"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

interface AssessmentStatusControlsProps {
  slug: string;
  assessmentId: string;
  status: "draft" | "active" | "closed";
}

export function AssessmentStatusControls({
  slug,
  assessmentId,
  status,
}: AssessmentStatusControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const setStatus = (nextStatus: "active" | "closed") => {
    startTransition(async () => {
      await fetch(`/api/organizations/${slug}/assessments/${assessmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      router.refresh();
    });
  };

  if (status === "draft") {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => setStatus("active")}
        className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Activating…" : "Activate Assessment"}
      </button>
    );
  }

  if (status === "active") {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => setStatus("closed")}
        className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40 disabled:opacity-50"
      >
        {isPending ? "Closing…" : "Close Assessment"}
      </button>
    );
  }

  return null;
}
