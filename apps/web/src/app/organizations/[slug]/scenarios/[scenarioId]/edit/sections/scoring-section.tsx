"use client";

import type {
  AuthoredScenario,
  AuthoredScenarioValidationError,
  AuthoredScoringBand,
  AuthoredScoringDimensionConfig,
} from "@incidentrank/scenarios/authoring";
import { SectionErrors } from "./section-errors";

const DIMENSION_LABELS: Record<string, string> = {
  recovery: "Recovery",
  customerImpact: "Customer Impact",
  dataIntegrity: "Data Integrity",
  reliability: "Reliability",
  costEfficiency: "Cost Efficiency",
  operationalEfficiency: "Operational Efficiency",
};

interface ScoringSectionProps {
  authored: AuthoredScenario;
  errors: AuthoredScenarioValidationError[];
  disabled: boolean;
  onChange: (updater: (prev: AuthoredScenario) => AuthoredScenario) => void;
}

export function ScoringSection({ authored, errors, disabled, onChange }: ScoringSectionProps) {
  const updateDimension = (
    index: number,
    updater: (prev: AuthoredScoringDimensionConfig) => AuthoredScoringDimensionConfig,
  ) => {
    onChange((prev) => ({
      ...prev,
      scoring: {
        dimensions: prev.scoring.dimensions.map((d, i) => (i === index ? updater(d) : d)),
      },
    }));
  };

  const total = authored.scoring.dimensions.reduce((sum, d) => sum + d.maxPoints, 0);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Scoring</h2>
      <p className="text-sm text-muted">
        Structured scoring bands over IncidentRank&apos;s fixed dimensions. Weights must total
        1000. Each dimension needs one fallback band (no &quot;at most&quot; bound) as its last
        band.
      </p>
      <p className={`font-mono text-xs ${total === 1000 ? "text-accent" : "text-[#dc2626]"}`}>
        Total: {total} / 1000
      </p>
      <SectionErrors errors={errors} />

      <div className="flex flex-col gap-4">
        {authored.scoring.dimensions.map((dimension, index) => (
          <DimensionEditor
            key={dimension.dimension}
            dimension={dimension}
            disabled={disabled}
            onChange={(updater) => updateDimension(index, updater)}
          />
        ))}
      </div>
    </div>
  );
}

function DimensionEditor({
  dimension,
  disabled,
  onChange,
}: {
  dimension: AuthoredScoringDimensionConfig;
  disabled: boolean;
  onChange: (updater: (prev: AuthoredScoringDimensionConfig) => AuthoredScoringDimensionConfig) => void;
}) {
  const updateBand = (index: number, patch: Partial<AuthoredScoringBand>) => {
    onChange((prev) => ({
      ...prev,
      bands: (prev.bands ?? []).map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }));
  };

  const addBand = () => {
    onChange((prev) => {
      // New bands insert before the fallback (last) band.
      const bands = [...(prev.bands ?? [])];
      const fallbackIndex = bands.findIndex((b) => b.atMost === undefined);
      const insertAt = fallbackIndex === -1 ? bands.length : fallbackIndex;
      bands.splice(insertAt, 0, { atMost: 0, points: 0 });
      return { ...prev, bands };
    });
  };

  const removeBand = (index: number) => {
    onChange((prev) => ({ ...prev, bands: (prev.bands ?? []).filter((_, i) => i !== index) }));
  };

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          {DIMENSION_LABELS[dimension.dimension] ?? dimension.dimension}
        </h3>
        <span className="font-mono text-xs text-muted">{dimension.maxPoints} pts max</span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {(dimension.bands ?? []).map((band, index) => (
          <div key={index} className="flex items-center gap-2">
            {band.atMost === undefined ? (
              <span className="w-32 font-mono text-xs text-muted">fallback (else)</span>
            ) : (
              <>
                <span className="font-mono text-xs text-muted">at most</span>
                <input
                  type="number"
                  value={band.atMost}
                  disabled={disabled}
                  onChange={(e) => updateBand(index, { atMost: Number(e.target.value) })}
                  className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-foreground/40 disabled:opacity-60"
                />
              </>
            )}
            <span className="font-mono text-xs text-muted">→</span>
            <input
              type="number"
              min={0}
              max={dimension.maxPoints}
              value={band.points}
              disabled={disabled}
              onChange={(e) => updateBand(index, { points: Number(e.target.value) })}
              className="w-20 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-foreground/40 disabled:opacity-60"
            />
            <span className="font-mono text-xs text-muted">pts</span>
            {!disabled && band.atMost !== undefined && (
              <button
                type="button"
                onClick={() => removeBand(index)}
                className="font-mono text-[10px] text-muted hover:text-[#dc2626]"
              >
                ×
              </button>
            )}
          </div>
        ))}

        {!disabled && (
          <button
            type="button"
            onClick={addBand}
            className="self-start rounded-md border border-border px-2 py-1 font-mono text-[10px] transition-colors hover:border-foreground/40"
          >
            + Add Band
          </button>
        )}
      </div>
    </div>
  );
}
