"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScenarioVersion } from "@incidentrank/db";
import type {
  AuthoredScenario,
  AuthoredScenarioValidationError,
} from "@incidentrank/scenarios/authoring";
import { BasicsSection } from "./sections/basics-section";
import { ArchitectureSection } from "./sections/architecture-section";
import { ControlsSection } from "./sections/controls-section";
import { InitialStateSection } from "./sections/initial-state-section";
import { MetricsSection } from "./sections/metrics-section";
import { TimelineEventsSection } from "./sections/timeline-events-section";
import { RulesSection } from "./sections/rules-section";
import { SuccessFailureSection } from "./sections/success-failure-section";
import { ScoringSection } from "./sections/scoring-section";
import { PreviewPublishSection } from "./sections/preview-publish-section";

const SECTIONS = [
  "Basics",
  "Architecture",
  "Controls",
  "Initial State",
  "Metrics",
  "Timeline Events",
  "Rules & Consequences",
  "Success / Failure",
  "Scoring",
  "Preview & Publish",
] as const;

type SectionName = (typeof SECTIONS)[number];

interface ScenarioEditorProps {
  slug: string;
  scenarioId: string;
  scenarioName: string;
  draft: ScenarioVersion | null;
  latestPublished: ScenarioVersion | null;
  versions: ScenarioVersion[];
  canEdit: boolean;
}

/**
 * The 10-section structured scenario-authoring editor (Phase 5 spec).
 * Holds the full AuthoredScenario document in client state, PATCHes the
 * draft on every meaningful change (debounced via explicit Save), and
 * surfaces structured validation errors inline per section. Deliberately
 * not a raw JSON editor — each section is its own structured form, per
 * the spec's explicit instruction not to replace structured authoring
 * with a JSON editor for speed.
 */
export function ScenarioEditor({
  slug,
  scenarioId,
  scenarioName,
  draft,
  latestPublished,
  versions,
  canEdit,
}: ScenarioEditorProps) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<SectionName>("Basics");
  // When there is no mutable draft, fall back to the latest published
  // version's content in read-only mode — a member (or an owner/admin
  // between drafts) must still be able to view a published scenario's
  // full authored content, per the spec's "member -> view ... published
  // scenario details" requirement. isReadOnly drives every section's
  // `disabled` prop below, overriding canEdit.
  const isReadOnly = !draft;
  const sourceVersion = draft ?? latestPublished;
  const [authored, setAuthored] = useState<AuthoredScenario | null>(
    (sourceVersion?.definitionJson as AuthoredScenario | undefined) ?? null,
  );
  // Resync local state when the source version identity changes — e.g.
  // after handleCreateNewDraft's router.refresh() delivers a freshly-
  // created draft row via props. useState's initializer only runs on
  // first mount, so without this, the editor would keep showing stale
  // (or missing) content after creating a new draft from a published
  // version.
  const lastSyncedVersionId = useRef(sourceVersion?.id);
  if (sourceVersion?.id !== lastSyncedVersionId.current) {
    lastSyncedVersionId.current = sourceVersion?.id;
    const nextAuthored = (sourceVersion?.definitionJson as AuthoredScenario | undefined) ?? null;
    if (nextAuthored !== authored) {
      setAuthored(nextAuthored);
    }
  }
  const [validationErrors, setValidationErrors] = useState<AuthoredScenarioValidationError[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);

  const errorsBySection = useMemo(() => {
    const map: Record<string, AuthoredScenarioValidationError[]> = {};
    for (const error of validationErrors) {
      const section = sectionForPath(error.path);
      (map[section] ??= []).push(error);
    }
    return map;
  }, [validationErrors]);

  // Local edits apply instantly via a functional updater — every section
  // calls updateAuthored(prev => ...), never closes over a possibly-stale
  // `authored` snapshot, so rapid consecutive edits (e.g. fast typing,
  // or two fields edited before a re-render lands) can never clobber
  // each other. The network PATCH is separately debounced below.
  const updateAuthored = (updater: (prev: AuthoredScenario) => AuthoredScenario) => {
    setAuthored((prev) => (prev ? updater(prev) : prev));
  };

  useEffect(() => {
    if (!authored) return;
    const toSave = authored;

    const timeoutId = setTimeout(() => {
      setSaveState("saving");
      void (async () => {
        try {
          const response = await fetch(`/api/organizations/${slug}/scenarios/${scenarioId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "save_draft", definition: toSave }),
          });
          const data = (await response.json()) as {
            validationErrors?: AuthoredScenarioValidationError[];
            error?: string;
          };
          if (!response.ok) {
            setSaveState("error");
            return;
          }
          setValidationErrors(data.validationErrors ?? []);
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      })();
    }, 600);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authored]);

  const handlePublish = async () => {
    setPublishError(null);
    setIsPublishing(true);
    try {
      const response = await fetch(
        `/api/organizations/${slug}/scenarios/${scenarioId}/publish`,
        { method: "POST" },
      );
      const data = (await response.json()) as {
        validationErrors?: AuthoredScenarioValidationError[];
        error?: string;
      };
      if (!response.ok) {
        setValidationErrors(data.validationErrors ?? []);
        setPublishError(data.error ?? "Failed to publish");
        setIsPublishing(false);
        return;
      }
      router.refresh();
    } catch {
      setPublishError("Failed to publish");
      setIsPublishing(false);
    }
  };

  const handleCreateNewDraft = async () => {
    setIsCreatingDraft(true);
    try {
      const response = await fetch(`/api/organizations/${slug}/scenarios/${scenarioId}/edit`, {
        method: "POST",
      });
      if (response.ok) {
        router.refresh();
        return;
      }
    } catch {
      // fall through
    }
    setIsCreatingDraft(false);
  };

  if (!draft && !latestPublished) {
    return <p className="text-sm text-[#dc2626]">This scenario has no versions.</p>;
  }

  if (!authored) {
    return <p className="text-sm text-[#dc2626]">Scenario content is missing or malformed.</p>;
  }

  const effectiveDisabled = !canEdit || isReadOnly;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{scenarioName}</h1>
          <p className="mt-1 font-mono text-xs text-muted">
            {isReadOnly
              ? `Published v${latestPublished!.version} (read-only)`
              : "Draft v" + draft!.version}{" "}
            · {versions.length} version{versions.length === 1 ? "" : "s"} total
            {!isReadOnly && saveState === "saving" && " · Saving…"}
            {!isReadOnly && saveState === "saved" && " · Saved"}
            {!isReadOnly && saveState === "error" && " · Save failed"}
          </p>
        </div>
        {isReadOnly && canEdit && (
          <button
            type="button"
            onClick={handleCreateNewDraft}
            disabled={isCreatingDraft}
            className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isCreatingDraft ? "Creating…" : `Edit (create v${latestPublished!.version + 1} draft)`}
          </button>
        )}
      </div>

      {isReadOnly && (
        <p className="mt-4 rounded-md border border-border bg-surface p-3 text-sm text-muted">
          This is the published, immutable version{canEdit ? " — create a new draft to make changes" : ""}.
        </p>
      )}

      <div className="mt-8 flex gap-6">
        <nav className="w-48 shrink-0">
          <ol className="flex flex-col gap-1">
            {SECTIONS.map((section) => {
              const sectionErrorCount = errorsBySection[section]?.length ?? 0;
              return (
                <li key={section}>
                  <button
                    type="button"
                    onClick={() => setActiveSection(section)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      activeSection === section
                        ? "bg-surface font-medium"
                        : "text-muted hover:bg-surface/50"
                    }`}
                  >
                    <span>{section}</span>
                    {sectionErrorCount > 0 && (
                      <span className="font-mono text-[10px] text-[#dc2626]">
                        {sectionErrorCount}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 flex-1">
          {!canEdit && (
            <p className="mb-4 rounded-md border border-border bg-surface p-3 text-sm text-muted">
              You have view-only access to this scenario.
            </p>
          )}

          {activeSection === "Basics" && (
            <BasicsSection
              authored={authored}
              errors={errorsBySection.Basics ?? []}
              disabled={effectiveDisabled}
              onChange={updateAuthored}
            />
          )}
          {activeSection === "Architecture" && (
            <ArchitectureSection
              authored={authored}
              errors={errorsBySection.Architecture ?? []}
              disabled={effectiveDisabled}
              onChange={updateAuthored}
            />
          )}
          {activeSection === "Controls" && (
            <ControlsSection
              authored={authored}
              errors={errorsBySection.Controls ?? []}
              disabled={effectiveDisabled}
              onChange={updateAuthored}
            />
          )}
          {activeSection === "Initial State" && (
            <InitialStateSection
              authored={authored}
              errors={errorsBySection["Initial State"] ?? []}
              disabled={effectiveDisabled}
              onChange={updateAuthored}
            />
          )}
          {activeSection === "Metrics" && (
            <MetricsSection
              authored={authored}
              errors={errorsBySection.Metrics ?? []}
              disabled={effectiveDisabled}
              onChange={updateAuthored}
            />
          )}
          {activeSection === "Timeline Events" && (
            <TimelineEventsSection
              authored={authored}
              errors={errorsBySection["Timeline Events"] ?? []}
              disabled={effectiveDisabled}
              onChange={updateAuthored}
            />
          )}
          {activeSection === "Rules & Consequences" && (
            <RulesSection
              authored={authored}
              errors={errorsBySection["Rules & Consequences"] ?? []}
              disabled={effectiveDisabled}
              onChange={updateAuthored}
            />
          )}
          {activeSection === "Success / Failure" && (
            <SuccessFailureSection
              authored={authored}
              errors={errorsBySection["Success / Failure"] ?? []}
              disabled={effectiveDisabled}
              onChange={updateAuthored}
            />
          )}
          {activeSection === "Scoring" && (
            <ScoringSection
              authored={authored}
              errors={errorsBySection.Scoring ?? []}
              disabled={effectiveDisabled}
              onChange={updateAuthored}
            />
          )}
          {activeSection === "Preview & Publish" && (
            <PreviewPublishSection
              slug={slug}
              scenarioId={scenarioId}
              authored={authored}
              validationErrors={validationErrors}
              canEdit={canEdit && !isReadOnly}
              isPublishing={isPublishing}
              publishError={publishError}
              onPublish={handlePublish}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Maps a dotted validation-error path to its owning authoring section, for the sidebar error-count badges. */
function sectionForPath(path: string): SectionName {
  if (path.startsWith("basics")) return "Basics";
  if (path.startsWith("architecture")) return "Architecture";
  if (path.startsWith("controls")) return "Controls";
  if (path.startsWith("initialState")) return "Initial State";
  if (path.startsWith("metrics")) return "Metrics";
  if (path.startsWith("timelineEvents")) return "Timeline Events";
  if (path.startsWith("rules")) return "Rules & Consequences";
  if (path.startsWith("successCondition") || path.startsWith("failureCondition")) {
    return "Success / Failure";
  }
  if (path.startsWith("scoring")) return "Scoring";
  return "Basics";
}
