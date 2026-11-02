import type { PublicScenarioMetadata } from "@incidentrank/scenarios";
import { appBaseUrl } from "@/lib/server/app-url";

// Human-readable label only — schema.org has no fixed enum for
// educationalLevel, so this is deliberately the same free-text label
// already shown to candidates (public-scenario-landing.tsx's
// DIFFICULTY_LABEL), not a formal taxonomy term.
const DIFFICULTY_LABEL: Record<PublicScenarioMetadata["difficulty"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  senior: "Senior",
  staff: "Staff",
  senior_staff: "Senior Staff",
  principal: "Principal",
};

/**
 * LearningResource structured data for a scenario page
 * (docs/implementation_plan/seopphase.md §11) — populated only from
 * PublicScenarioMetadata, the same public-safe projection already used by
 * PublicScenarioLanding. Deliberately `LearningResource`, not `Course`:
 * these are incident-response practice scenarios, not courses. Never
 * fabricates ratings, reviews, certifications, pricing, or
 * completion-time claims not backed by real data on the metadata type.
 */
export function ScenarioStructuredData({ metadata }: { metadata: PublicScenarioMetadata }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: metadata.name,
    description: metadata.description,
    url: `${appBaseUrl()}/incidents/${metadata.slug}`,
    educationalLevel: DIFFICULTY_LABEL[metadata.difficulty],
    timeRequired: `PT${metadata.estimatedMinutes}M`,
    isAccessibleForFree: metadata.isFree,
    ...(metadata.category ? { about: metadata.category } : {}),
    ...(metadata.publicSkills && metadata.publicSkills.length > 0
      ? { teaches: metadata.publicSkills }
      : {}),
    ...(metadata.tags && metadata.tags.length > 0 ? { keywords: metadata.tags.join(", ") } : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
