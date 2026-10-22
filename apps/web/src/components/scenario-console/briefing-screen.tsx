"use client";

import { SignInButton } from "@clerk/nextjs";
import type { ArchitectureDefinition } from "@incidentrank/simulator";
import type { ScenarioDefinition } from "@incidentrank/scenarios";

const DIFFICULTY_LABEL: Record<ScenarioDefinition["difficulty"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  senior: "Senior",
  staff: "Staff",
};

interface GenericBriefingScreenProps {
  scenario: ScenarioDefinition;
  architecture: ArchitectureDefinition;
  onAcknowledge: () => void;
  showSignInNudge: boolean;
}

/**
 * Candidate-facing pre-incident briefing/detail preview, generic over
 * any built-in scenario's own ScenarioDefinition metadata (name/
 * description/difficulty/estimatedMinutes/library.category/library.
 * skills/isFree) rather than hardcoded per-scenario copy — see
 * docs/implementation_plan/phase6.md's "Scenario Detail / Briefing
 * Preview": candidate-safe only (name, difficulty, category, time,
 * skills, description, architecture topology, free/paid status). Never
 * reveals rules, solutions, success/failure thresholds, scoring bands,
 * or hidden events — the architecture preview shows node/edge topology
 * only (the same ArchitectureView already rendered live during an
 * active incident), never rule logic or component health thresholds.
 */
export function GenericBriefingScreen({
  scenario,
  architecture,
  onAcknowledge,
  showSignInNudge,
}: GenericBriefingScreenProps) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-lg border border-border bg-surface p-8">
        <div className="flex items-center justify-between gap-4">
          <span className="rounded border border-[#dc2626] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[#dc2626]">
            SEV-1
          </span>
          <span
            className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
              scenario.isFree ? "border-accent text-accent" : "border-border text-muted"
            }`}
          >
            {scenario.isFree ? "Free" : "🔒 Paid"}
          </span>
        </div>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {scenario.name}
        </h1>

        <p className="mt-4 text-sm text-foreground">{scenario.description}</p>

        <dl className="mt-6 grid grid-cols-3 gap-4 font-mono text-xs">
          <div>
            <dt className="uppercase tracking-wide text-muted">Difficulty</dt>
            <dd className="mt-1 text-foreground">
              {DIFFICULTY_LABEL[scenario.difficulty]}
            </dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-muted">
              Expected Time
            </dt>
            <dd className="mt-1 text-foreground">~{scenario.estimatedMinutes} min</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-muted">Category</dt>
            <dd className="mt-1 text-foreground">
              {scenario.library?.category ?? "Incident Response"}
            </dd>
          </div>
        </dl>

        {scenario.library && scenario.library.skills.length > 0 && (
          <div className="mt-6">
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
              Skills
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {scenario.library.skills.map((skill) => (
                <li
                  key={skill}
                  className="rounded border border-border px-2 py-0.5 text-xs text-muted"
                >
                  {skill}
                </li>
              ))}
            </ul>
          </div>
        )}

        {architecture.nodes.length > 0 && (
          <div className="mt-6">
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
              System Architecture
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {architecture.nodes.map((node) => (
                <li
                  key={node.id}
                  className="rounded border border-border px-2 py-0.5 text-xs text-foreground"
                >
                  {node.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {showSignInNudge && (
          <p className="mt-6 text-xs text-muted">
            Playing as a guest — your score won&apos;t be saved or appear on
            the leaderboard.{" "}
            <SignInButton mode="modal">
              <button type="button" className="underline hover:text-foreground">
                Sign in
              </button>
            </SignInButton>{" "}
            to save this attempt.
          </p>
        )}

        <button
          type="button"
          onClick={onAcknowledge}
          className="mt-8 w-full rounded-md border border-foreground bg-foreground px-4 py-3 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Acknowledge Incident
        </button>
      </div>
    </main>
  );
}
