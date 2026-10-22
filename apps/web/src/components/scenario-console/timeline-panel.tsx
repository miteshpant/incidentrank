"use client";

import type { CandidateUIDescriptor } from "@incidentrank/scenarios";
import type { CandidateActionGroup, TimelineEntry } from "@/lib/use-incident-attempt";
import { formatElapsed } from "@/lib/format";

const SYSTEM_ONLY_EVENT_TYPES = new Set([
  "CONFIG_CHANGED",
  "CONFIG_CHANGE_REJECTED",
]);

type RenderableEntry =
  | { kind: "system"; timestampMs: number; entry: TimelineEntry }
  | { kind: "you"; timestampMs: number; group: CandidateActionGroup };

function mergeTimeline(
  systemEntries: TimelineEntry[],
  actionGroups: CandidateActionGroup[],
): RenderableEntry[] {
  const systemOnly = systemEntries
    .filter((entry) => !SYSTEM_ONLY_EVENT_TYPES.has(entry.type))
    .map((entry): RenderableEntry => ({
      kind: "system",
      timestampMs: entry.timestampMs,
      entry,
    }));

  const groups = actionGroups.map((group): RenderableEntry => ({
    kind: "you",
    timestampMs: group.elapsedMs,
    group,
  }));

  return [...systemOnly, ...groups].sort((a, b) => a.timestampMs - b.timestampMs);
}

interface ActionGroupBlockProps {
  group: CandidateActionGroup;
  descriptor: CandidateUIDescriptor;
}

function ActionGroupBlock({ group, descriptor }: ActionGroupBlockProps) {
  const controlLabel = (controlKey: string): string =>
    descriptor.controls.find((c) => c.key === controlKey)?.label ?? controlKey;
  const valueLabel = (controlKey: string, value: unknown): string => {
    const control = descriptor.controls.find((c) => c.key === controlKey);
    return control?.valueLabels?.[String(value)] ?? String(value);
  };

  return (
    <>
      {group.changes.map((change) => (
        <p key={change.controlKey} className="text-foreground">
          {controlLabel(change.controlKey)} changed{" "}
          {valueLabel(change.controlKey, change.previousValue)}{" "}
          {"→"} {valueLabel(change.controlKey, change.newValue)}
        </p>
      ))}
      {group.reasoning && (
        <p className="mt-2 text-muted">
          <span className="font-mono text-[10px] uppercase tracking-wide">
            Reason:{" "}
          </span>
          <span className="italic">&ldquo;{group.reasoning}&rdquo;</span>
        </p>
      )}
    </>
  );
}

interface GenericTimelinePanelProps {
  entries: TimelineEntry[];
  actionGroups: CandidateActionGroup[];
  descriptor: CandidateUIDescriptor;
}

export function GenericTimelinePanel({ entries, actionGroups, descriptor }: GenericTimelinePanelProps) {
  const merged = mergeTimeline(entries, actionGroups);

  return (
    <div>
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
        Incident Timeline
      </h2>
      <ol className="mt-3 flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
        {merged.length === 0 && (
          <li className="text-sm text-muted">No events yet.</li>
        )}
        {merged.map((item) => (
          <li
            key={item.kind === "system" ? item.entry.id : item.group.id}
            className="text-sm"
          >
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-muted">
              <span>{formatElapsed(item.timestampMs)}</span>
              <span
                className={
                  item.kind === "you"
                    ? "rounded border border-accent px-1.5 py-0.5 text-accent"
                    : "rounded border border-border px-1.5 py-0.5"
                }
              >
                {item.kind === "you" ? "You" : "System"}
              </span>
            </div>
            {item.kind === "system" ? (
              <p className="mt-1 text-foreground">{item.entry.message}</p>
            ) : (
              <div className="mt-1">
                <ActionGroupBlock group={item.group} descriptor={descriptor} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
