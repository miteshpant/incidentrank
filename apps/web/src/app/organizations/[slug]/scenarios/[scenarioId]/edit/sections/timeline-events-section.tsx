"use client";

import type {
  AuthoredScenario,
  AuthoredScenarioValidationError,
  AuthoredTimelineEvent,
} from "@incidentrank/scenarios/authoring";
import { SectionErrors } from "./section-errors";

function blankEvent(index: number): AuthoredTimelineEvent {
  return { id: `event-${index}`, atSeconds: 0, label: "", message: "" };
}

interface TimelineEventsSectionProps {
  authored: AuthoredScenario;
  errors: AuthoredScenarioValidationError[];
  disabled: boolean;
  onChange: (updater: (prev: AuthoredScenario) => AuthoredScenario) => void;
}

export function TimelineEventsSection({ authored, errors, disabled, onChange }: TimelineEventsSectionProps) {
  const addEvent = () => {
    onChange((prev) => ({
      ...prev,
      timelineEvents: [...prev.timelineEvents, blankEvent(prev.timelineEvents.length)],
    }));
  };
  const updateEvent = (index: number, patch: Partial<AuthoredTimelineEvent>) => {
    onChange((prev) => ({
      ...prev,
      timelineEvents: prev.timelineEvents.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    }));
  };
  const removeEvent = (index: number) => {
    onChange((prev) => ({
      ...prev,
      timelineEvents: prev.timelineEvents.filter((_, i) => i !== index),
    }));
  };

  const setTriggersText = (index: number, text: string) => {
    const setTriggers: Record<string, boolean> = {};
    for (const pair of text.split(",")) {
      const [key, value] = pair.split("=").map((s) => s.trim());
      if (key) setTriggers[key] = value !== "false";
    }
    updateEvent(index, { setTriggers: Object.keys(setTriggers).length > 0 ? setTriggers : undefined });
  };

  const triggersToText = (setTriggers?: Record<string, boolean>): string =>
    Object.entries(setTriggers ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Timeline Events</h2>
      <p className="text-sm text-muted">
        Deterministic, time-triggered events. Each may set named triggers that rules reference.
      </p>
      <SectionErrors errors={errors} />

      <div className="flex flex-col gap-3">
        {authored.timelineEvents.map((event, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
            <div className="flex gap-2">
              <div className="w-24">
                <label className="font-mono text-xs text-muted">At (seconds)</label>
                <input
                  type="number"
                  min={0}
                  value={event.atSeconds}
                  disabled={disabled}
                  onChange={(e) => updateEvent(index, { atSeconds: Number(e.target.value) })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
                />
              </div>
              <div className="flex-1">
                <label className="font-mono text-xs text-muted">Label</label>
                <input
                  type="text"
                  value={event.label}
                  disabled={disabled}
                  onChange={(e) => updateEvent(index, { label: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
                />
              </div>
            </div>
            <div>
              <label className="font-mono text-xs text-muted">Message (shown to candidate)</label>
              <input
                type="text"
                value={event.message}
                disabled={disabled}
                onChange={(e) => updateEvent(index, { message: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="font-mono text-xs text-muted">
                Effects — set triggers (key=true, key2=false)
              </label>
              <input
                type="text"
                defaultValue={triggersToText(event.setTriggers)}
                disabled={disabled}
                placeholder="saturating=true"
                onBlur={(e) => setTriggersText(index, e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none placeholder:text-muted focus:border-foreground/40 disabled:opacity-60"
              />
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={() => removeEvent(index)}
                className="self-start font-mono text-xs text-muted hover:text-[#dc2626]"
              >
                Remove Event
              </button>
            )}
          </div>
        ))}

        {!disabled && (
          <button
            type="button"
            onClick={addEvent}
            className="self-start rounded-md border border-border px-3 py-1.5 font-mono text-xs transition-colors hover:border-foreground/40"
          >
            + Add Timeline Event
          </button>
        )}
      </div>
    </div>
  );
}
