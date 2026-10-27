import "server-only";
import { findAvailableOrBoundPass } from "./incident-passes";
import type { IncidentPassAccessState } from "@/lib/practice-access";

export interface ScenarioPassAccess {
  state: IncidentPassAccessState | null;
  boundScenarioId?: string;
  passId?: string;
}

/**
 * Computes the caller input evaluatePracticeAccess needs for its
 * incidentPassState option — the one real DB lookup this phase's access
 * evaluation depends on, kept outside the pure practice-access.ts
 * function per that file's existing "callers compute booleans, this
 * stays environment/DB-agnostic" discipline. A user holds at most one
 * active (available or bound) pass at a time in V1, so this is a single
 * lookup, not a per-scenario query.
 */
export async function getScenarioPassAccess(
  userId: string | null,
  scenarioId: string,
): Promise<ScenarioPassAccess> {
  if (!userId) return { state: null };

  const pass = await findAvailableOrBoundPass(userId);
  if (!pass) return { state: null };

  if (pass.status === "available") return { state: "available", passId: pass.id };

  // status === "bound"
  if (pass.scenarioId === scenarioId) return { state: "bound_here", passId: pass.id };
  return { state: "bound_elsewhere", boundScenarioId: pass.scenarioId ?? undefined };
}
