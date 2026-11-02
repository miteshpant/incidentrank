"use client";

import { useEffect, useState } from "react";
import { formatElapsed } from "@/lib/format";

interface ComparisonSide {
  displayName: string | null;
  score: number | null;
  outcome: string | null;
  completionTier: string | null;
  recoveryTimeMs: number | null;
  breakdown: {
    recovery: number | null;
    customerImpact: number | null;
    dataIntegrity: number | null;
    reliability: number | null;
    costEfficiency: number | null;
    operationalEfficiency: number | null;
  };
}

interface ComparisonResponse {
  scenarioSlug: string;
  scenarioName: string;
  challenger: ComparisonSide;
  challenged: ComparisonSide;
}

const DIMENSION_LABELS: Record<keyof ComparisonSide["breakdown"], string> = {
  recovery: "Recovery",
  customerImpact: "Customer Impact",
  dataIntegrity: "Data Integrity",
  reliability: "Reliability",
  costEfficiency: "Cost Efficiency",
  operationalEfficiency: "Operational Efficiency",
};

const OUTCOME_LABEL: Record<string, string> = {
  resolved: "Resolved",
  failed: "Failed",
  declared_unstable: "Not Fully Stabilized",
  timed_out: "Timed Out",
};

/**
 * docs/implementation_plan/phase-challege-version.md §9/§10 — the
 * side-by-side result comparison. Either participant may open this
 * page; both are labeled by their own display name (not a hardcoded
 * "You"), since the viewer could be either the challenger or the
 * challenged engineer. Professional language only: a plain
 * "<name> scored higher" line, never "crushed"/"destroyed"/"loser" or
 * similar gamified wording.
 */
export function ChallengeComparison({ token }: { token: string }) {
  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "not_ready" | "error" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/challenges/${token}/comparison`)
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 409) {
          setStatus("not_ready");
          return;
        }
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const payload = (await response.json()) as ComparisonResponse;
        setData(payload);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === "loading") {
    return <p className="mt-10 text-sm text-muted">Loading comparison…</p>;
  }
  if (status === "not_ready") {
    return (
      <p className="mt-10 text-sm text-muted">
        Waiting for the other engineer to finish this incident. Check back once they&apos;ve
        completed their attempt.
      </p>
    );
  }
  if (status === "error" || !data) {
    return <p className="mt-10 text-sm text-[#dc2626]">This comparison isn&apos;t available.</p>;
  }

  const { challenger, challenged } = data;
  const comparison =
    challenger.score !== null && challenged.score !== null
      ? challenger.score === challenged.score
        ? "Tied score."
        : challenger.score > challenged.score
          ? `${challenger.displayName ?? "The challenger"} scored higher.`
          : `${challenged.displayName ?? "The challenged engineer"} scored higher.`
      : null;

  return (
    <div className="mt-10">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">
        IncidentRank Challenge
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{data.scenarioName}</h1>
      {comparison && <p className="mt-2 text-sm text-muted">{comparison}</p>}

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-4"></th>
              <th className="py-2 pr-4">{challenger.displayName ?? "Challenger"}</th>
              <th className="py-2">{challenged.displayName ?? "Challenged Engineer"}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/60">
              <td className="py-2 pr-4 text-muted">Score</td>
              <td className="py-2 pr-4 font-mono">{challenger.score ?? "—"}</td>
              <td className="py-2 font-mono">{challenged.score ?? "—"}</td>
            </tr>
            <tr className="border-b border-border/60">
              <td className="py-2 pr-4 text-muted">Outcome</td>
              <td className="py-2 pr-4 font-mono">
                {challenger.outcome ? (OUTCOME_LABEL[challenger.outcome] ?? challenger.outcome) : "—"}
              </td>
              <td className="py-2 font-mono">
                {challenged.outcome ? (OUTCOME_LABEL[challenged.outcome] ?? challenged.outcome) : "—"}
              </td>
            </tr>
            <tr className="border-b border-border/60">
              <td className="py-2 pr-4 text-muted">Recovery Time</td>
              <td className="py-2 pr-4 font-mono">
                {challenger.recoveryTimeMs !== null ? formatElapsed(challenger.recoveryTimeMs) : "—"}
              </td>
              <td className="py-2 font-mono">
                {challenged.recoveryTimeMs !== null ? formatElapsed(challenged.recoveryTimeMs) : "—"}
              </td>
            </tr>
            {(Object.keys(DIMENSION_LABELS) as (keyof ComparisonSide["breakdown"])[]).map((dim) => (
              <tr key={dim} className="border-b border-border/60">
                <td className="py-2 pr-4 text-muted">{DIMENSION_LABELS[dim]}</td>
                <td className="py-2 pr-4 font-mono">{challenger.breakdown[dim] ?? "—"}</td>
                <td className="py-2 font-mono">{challenged.breakdown[dim] ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
