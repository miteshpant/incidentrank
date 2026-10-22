"use client";

import type { AuthoredDifficulty, AuthoredScenario, AuthoredScenarioValidationError } from "@incidentrank/scenarios/authoring";
import { SectionErrors } from "./section-errors";

const DIFFICULTIES: AuthoredDifficulty[] = ["beginner", "intermediate", "senior", "staff"];

interface BasicsSectionProps {
  authored: AuthoredScenario;
  errors: AuthoredScenarioValidationError[];
  disabled: boolean;
  onChange: (updater: (prev: AuthoredScenario) => AuthoredScenario) => void;
}

export function BasicsSection({ authored, errors, disabled, onChange }: BasicsSectionProps) {
  const update = (patch: Partial<AuthoredScenario["basics"]>) => {
    onChange((prev) => ({ ...prev, basics: { ...prev.basics, ...patch } }));
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Basics</h2>
      <SectionErrors errors={errors} />

      <Field label="Scenario Name">
        <input
          type="text"
          value={authored.basics.name}
          disabled={disabled}
          onChange={(e) => update({ name: e.target.value })}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
        />
      </Field>

      <Field label="Slug">
        <input
          type="text"
          value={authored.basics.slug}
          disabled={disabled}
          onChange={(e) => update({ slug: e.target.value })}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
        />
      </Field>

      <Field label="Description">
        <textarea
          value={authored.basics.description}
          disabled={disabled}
          rows={3}
          onChange={(e) => update({ description: e.target.value })}
          className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
        />
      </Field>

      <Field label="Difficulty">
        <select
          value={authored.basics.difficulty}
          disabled={disabled}
          onChange={(e) => update({ difficulty: e.target.value as AuthoredDifficulty })}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
        >
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Estimated Duration (minutes)">
        <input
          type="number"
          min={1}
          value={authored.basics.estimatedMinutes}
          disabled={disabled}
          onChange={(e) => update({ estimatedMinutes: Number(e.target.value) })}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
        />
      </Field>

      <Field label="Instructions shown to candidate (optional)">
        <textarea
          value={authored.basics.instructions ?? ""}
          disabled={disabled}
          rows={4}
          placeholder="Do not include hints about the intended solution or hidden thresholds."
          onChange={(e) => update({ instructions: e.target.value })}
          className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-foreground/40 disabled:opacity-60"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-mono text-xs text-muted">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
