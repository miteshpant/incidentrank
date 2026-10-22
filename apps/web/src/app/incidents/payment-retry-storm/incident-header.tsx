"use client";

import type { IncidentStatus } from "@incidentrank/simulator";
import { formatElapsed } from "@/lib/format";

const STATUS_LABEL: Record<IncidentStatus, string> = {
  healthy: "HEALTHY",
  degraded: "RECOVERING",
  critical: "CRITICAL",
  resolved: "RESOLVED",
  failed: "FAILED",
};

const STATUS_CLASS: Record<IncidentStatus, string> = {
  healthy: "text-accent",
  degraded: "text-[#d97706]",
  critical: "text-[#dc2626]",
  resolved: "text-accent",
  failed: "text-[#dc2626]",
};

interface IncidentHeaderProps {
  scenarioName: string;
  status: IncidentStatus;
  simulationTimeMs: number;
  incidentStartedAtMs: number | null;
  incidentStarted: boolean;
  incidentStartMs: number | null;
}

export function IncidentHeader({
  scenarioName,
  status,
  simulationTimeMs,
  incidentStartedAtMs,
  incidentStarted,
  incidentStartMs,
}: IncidentHeaderProps) {
  const elapsedSinceIncidentMs =
    incidentStartedAtMs !== null
      ? Math.max(0, simulationTimeMs - incidentStartedAtMs)
      : 0;

  if (!incidentStarted && incidentStartMs !== null) {
    const remainingMs = Math.max(0, incidentStartMs - simulationTimeMs);

    return (
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold tracking-tight">
              IncidentRank
            </span>
            <span className="text-muted">·</span>
            <span className="font-mono text-xs uppercase tracking-wide text-muted">
              SEV-1 · {scenarioName}
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono text-sm">
            <span className="tabular-nums text-muted">
              Incident begins in {formatElapsed(remainingMs)}
            </span>
            <span
              className="font-semibold tracking-wide text-muted"
              role="status"
            >
              PRE-INCIDENT
            </span>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold tracking-tight">
            IncidentRank
          </span>
          <span className="text-muted">·</span>
          <span className="font-mono text-xs uppercase tracking-wide text-muted">
            SEV-1 · {scenarioName}
          </span>
        </div>
        <div className="flex items-center gap-4 font-mono text-sm">
          <span
            className="tabular-nums"
            aria-label="Elapsed incident time"
          >
            {formatElapsed(elapsedSinceIncidentMs)}
          </span>
          <span
            className={`font-semibold tracking-wide ${STATUS_CLASS[status]}`}
            role="status"
          >
            {STATUS_LABEL[status]}
          </span>
        </div>
      </div>
    </header>
  );
}
