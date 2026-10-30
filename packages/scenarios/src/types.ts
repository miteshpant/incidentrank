import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";

/**
 * Phase 6 scenario library taxonomy — exactly one primary category per
 * scenario (see docs/implementation_plan/phase6.md's "Launch Taxonomy").
 * This is the closed set of top-level categories the public library
 * filters/groups by; a scenario may additionally carry many free-text
 * tags (ScenarioLibraryMetadata.tags) for finer-grained skill/concept
 * filtering.
 */
export type ScenarioCategory =
  | "Databases & Storage"
  | "Messaging & Streaming"
  | "Caching"
  | "Microservices & Dependencies"
  | "API & Traffic"
  | "Distributed Systems"
  | "Deployments & Reliability"
  | "Infrastructure & Capacity"
  | "Security & Identity"
  | "Data Pipelines";

/**
 * Candidate-safe browsing/discovery metadata for a library scenario —
 * never reveals rules, solutions, thresholds, or scoring (see phase6.md's
 * "Scenario Detail / Briefing Preview"). Deliberately separate from
 * ScenarioDefinition's existing difficulty/estimatedMinutes/isFree fields
 * (reused here, not duplicated) — this type only adds what Phase 5 never
 * needed: category, tags, skills, and a library-card-length description
 * distinct from the longer in-briefing `description`.
 */
export interface ScenarioLibraryMetadata {
  category: ScenarioCategory;
  tags: string[];
  /** Secondary skills — finer-grained than `category`, no single "primary" distinction. */
  skills: string[];
  /**
   * Phase 10F: the single most central skill this scenario tests (e.g.
   * "cross_service_diagnosis") — distinct from `skills`' flatter,
   * unordered secondary-skill list. Optional because no existing
   * scenario has one authored yet; omitting it changes nothing about
   * library display or filtering.
   */
  primarySkill?: string;
  /** Short, card-length summary — distinct from ScenarioDefinition.description's longer briefing copy. */
  shortDescription: string;
}

/**
 * Phase 10F — how a candidate moves through the incident, orthogonal to
 * `difficulty` (docs/implementation_plan/phase10f.md §1: "a Principal
 * incident is not automatically cascading"). Not read by the simulation
 * engine (packages/simulator) at all — the existing trigger/control
 * rule-matching engine already supports all four shapes; this is purely
 * classification metadata for catalog filtering and authoring guidance.
 */
export type ScenarioStructure = "linear" | "branching" | "parallel" | "cascading";

export interface ScenarioDefinition {
  id: string;
  slug: string;
  /**
   * Authoritative version number for this source-controlled scenario.
   * Built-in scenarios never get a `scenario_versions` DB row (Phase 5) —
   * this field is the single source of truth for "which version is this
   * code," exactly the way `scenario_versions.version` is authoritative
   * for organization-authored scenarios. Bump this whenever a built-in
   * scenario's authored behavior changes, and add the new version to the
   * resolver's lookup table so existing attempts keep resolving against
   * the version they were created with.
   */
  version: number;
  name: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "senior" | "staff" | "senior_staff" | "principal";
  estimatedMinutes: number;
  /** Playable without signing in. Anonymous attempts on free scenarios are never persisted. */
  isFree: boolean;
  /** Phase 10F — see ScenarioStructure. Required so every scenario makes an explicit, auditable choice rather than silently defaulting. */
  structure: ScenarioStructure;
  simulation: ScenarioSimulationDefinition;
  /**
   * Public library discovery metadata. Optional on the base type because
   * not every ScenarioDefinition is library-listed (e.g. organization-
   * authored scenarios resolve through a different path entirely, see
   * phase6.md's "Company-Owned Scenarios" — they're never part of the
   * public library/search/filter surface). Every IncidentRank-owned
   * library scenario (packages/scenarios/src/library's catalog) sets this.
   */
  library?: ScenarioLibraryMetadata;
}
