import type { ArchitectureDefinition } from "@incidentrank/simulator";
import type { ScenarioCategory, ScenarioDefinition } from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Public SEO/discovery metadata — the only shape ever handed to a search
// crawler, a public landing page, or a client component that renders the
// pre-unlock briefing/locked/listing surfaces (docs/implementation_plan/
// seopphase.md §1-2: "Do not automatically derive public SEO content from
// every private AuthoredScenario field. Public metadata must be
// intentionally safe."). Deliberately excludes `simulation` (minus its
// already-safe `architecture` topology), `structure`, `version`, and `id`
// — this type carries no behavior, no rules, no thresholds, no scoring,
// mirroring the same "safe projection of a larger private type" precedent
// as CandidateUIDescriptor (./candidate-ui.ts).
// ─────────────────────────────────────────────────────────────────────────

export interface PublicScenarioMetadata {
  slug: string;
  name: string;
  /** Card/teaser-length copy — ScenarioDefinition.library.shortDescription, falling back to the longer in-briefing description when a scenario has no library metadata. */
  description: string;
  difficulty: ScenarioDefinition["difficulty"];
  estimatedMinutes: number;
  isFree: boolean;
  category?: ScenarioCategory;
  publicSkills?: string[];
  /** Free-text discovery tags — same safety class as publicSkills (ScenarioLibraryMetadata's own doc comment: "candidate-safe browsing/discovery metadata"). */
  tags?: string[];
  /** Safe node/edge topology only — never rule logic or component health thresholds. */
  architecture: ArchitectureDefinition;
}

/**
 * Pure, total projection from the full private ScenarioDefinition down to
 * the public-safe subset above. Never reads `definition.simulation`
 * beyond `.architecture` — in particular never touches `.rules`,
 * `.timedEvents`, `.successCondition`, `.acceptableCondition`,
 * `.controls`, or `.actionClassifications`.
 */
export function toPublicScenarioMetadata(definition: ScenarioDefinition): PublicScenarioMetadata {
  return {
    slug: definition.slug,
    name: definition.name,
    description: definition.library?.shortDescription ?? definition.description,
    difficulty: definition.difficulty,
    estimatedMinutes: definition.estimatedMinutes,
    isFree: definition.isFree,
    category: definition.library?.category,
    publicSkills: definition.library?.skills,
    tags: definition.library?.tags,
    architecture: definition.simulation.architecture,
  };
}
