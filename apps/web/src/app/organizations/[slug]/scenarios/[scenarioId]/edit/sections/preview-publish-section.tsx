"use client";

import Link from "next/link";
import type { AuthoredScenario, AuthoredScenarioValidationError } from "@incidentrank/scenarios/authoring";

interface PreviewPublishSectionProps {
  slug: string;
  scenarioId: string;
  authored: AuthoredScenario;
  validationErrors: AuthoredScenarioValidationError[];
  canEdit: boolean;
  isPublishing: boolean;
  publishError: string | null;
  onPublish: () => void;
}

export function PreviewPublishSection({
  slug,
  scenarioId,
  authored,
  validationErrors,
  canEdit,
  isPublishing,
  publishError,
  onPublish,
}: PreviewPublishSectionProps) {
  const isValid = validationErrors.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Preview & Publish</h2>

      <div className="rounded-md border border-border bg-surface p-4">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">Draft Status</p>
        <p className="mt-2 text-sm">
          {isValid ? (
            <span className="text-accent">This draft is valid and ready to publish.</span>
          ) : (
            <span className="text-[#dc2626]">
              {validationErrors.length} validation error{validationErrors.length === 1 ? "" : "s"}{" "}
              must be fixed before publishing. See section sidebar for details.
            </span>
          )}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium">Preview</h3>
        <p className="mt-1 text-sm text-muted">
          Run this draft in practice-style mode. Preview attempts are never scored into the
          leaderboard and never create candidate assessment history.
        </p>
        <Link
          href={`/organizations/${slug}/scenarios/${scenarioId}/preview`}
          className="mt-3 inline-block rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
        >
          Preview Scenario
        </Link>
      </div>

      {canEdit && (
        <div>
          <h3 className="text-sm font-medium">Publish</h3>
          <p className="mt-1 text-sm text-muted">
            Publishing creates an immutable version and makes it selectable for this
            organization&apos;s assessments. Published versions can never be edited — editing
            again creates a new draft.
          </p>
          {publishError && <p className="mt-2 text-sm text-[#dc2626]">{publishError}</p>}
          <button
            type="button"
            onClick={onPublish}
            disabled={isPublishing}
            className="mt-3 rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPublishing ? "Publishing…" : `Publish "${authored.basics.name || "Untitled"}"`}
          </button>
        </div>
      )}
    </div>
  );
}
