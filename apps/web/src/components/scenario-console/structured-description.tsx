import { parseScenarioDescription } from "@/lib/format-scenario-description";

interface StructuredDescriptionProps {
  description: string;
}

/**
 * Renders a scenario's flat `description` string with its existing
 * inline-enumerated invariants ("...govern every decision: (1) ...; (2)
 * ...") as a real, readable list instead of one unbroken paragraph —
 * see lib/format-scenario-description.ts for the parsing rationale
 * (Phase 7.1, docs/implementation_plan/phase7.action.md section 12).
 * Used both pre-Acknowledge (briefing-screen.tsx) and inside the
 * post-start Incident Brief, so the same source text always renders
 * identically in both places.
 */
export function StructuredDescription({ description }: StructuredDescriptionProps) {
  const segments = parseScenarioDescription(description);

  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === "list" ? (
          <div key={index} className="mt-4">
            {segment.intro && <p className="text-sm text-foreground">{segment.intro}</p>}
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-foreground">
              {segment.items?.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
            </ol>
          </div>
        ) : (
          <p key={index} className="mt-4 text-sm text-foreground">
            {segment.text}
          </p>
        ),
      )}
    </>
  );
}
