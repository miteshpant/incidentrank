/**
 * Phase 7.1 briefing-readability fix (docs/implementation_plan/
 * phase7.action.md section 12). All 100 scenario descriptions are
 * authored as one flat string; several — #100 (Enterprise-Wide
 * Dependency Deprecation) among them — embed an inline enumerated list
 * like "...govern every decision: (1) ...; (2) ...; (3) .... Decide
 * how..." with no structure of any kind. Rather than rewriting any of
 * the 100 scenario content files (a huge-blast-radius content change
 * out of scope for this phase), this is a pure presentation-layer
 * compatibility parser: it recognizes the existing "(N) clause"
 * pattern already present in the authored text and splits it into a
 * real list, falling back to a single paragraph for the ~70 scenarios
 * whose description has no such markers at all. Treat this as a
 * presentation compatibility layer, not the permanent content model —
 * if a richer authoring shape (sections[]/businessInvariants[]) is
 * ever introduced, this parser becomes unnecessary for new content but
 * can stay as a fallback for the existing 100 scenario strings.
 */

export interface DescriptionSegment {
  kind: "paragraph" | "list";
  /** Only present for kind: "paragraph". */
  text?: string;
  /** Only present for kind: "list" — the sentence introducing the
   * enumeration (e.g. "Six business invariants govern every decision:"). */
  intro?: string;
  /** Only present for kind: "list". */
  items?: string[];
}

/** Matches "(1)", "(2)", … as a list-item marker — never matches a
 * parenthetical aside like "(not an outage)" because those never start
 * with a digit immediately after the opening paren. */
const LIST_MARKER = /\(\d+\)\s*/g;

export function parseScenarioDescription(description: string): DescriptionSegment[] {
  const markers = [...description.matchAll(LIST_MARKER)];
  if (markers.length < 2) {
    // Fewer than 2 numbered markers isn't a real enumerated list — render
    // the whole description as a single paragraph exactly as today.
    return [{ kind: "paragraph", text: description }];
  }

  const firstMarkerIndex = markers[0]!.index;
  const introRaw = description.slice(0, firstMarkerIndex).trimEnd();
  // The intro sentence conventionally ends in ":" right before the first
  // "(1)" — keep it as authored either way.
  const intro = introRaw.length > 0 ? introRaw : undefined;

  const items: string[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    const start = markers[i]!.index + markers[i]![0].length;
    const end = i + 1 < markers.length ? markers[i + 1]!.index : description.length;
    const raw = description.slice(start, end);

    // The last item's clause runs up to the end of the description,
    // which usually also contains a trailing paragraph after the list
    // ends (e.g. "...deadline risk must remain candidate-visible
    // throughout. Decide how to sequence..."). Split at the first
    // sentence boundary (". " followed by a capital letter) so only the
    // last enumerated clause itself becomes the final list item, and
    // anything after it becomes a trailing paragraph.
    if (i === markers.length - 1) {
      const sentenceBreak = raw.search(/\.\s+(?=[A-Z])/);
      if (sentenceBreak !== -1) {
        items.push(raw.slice(0, sentenceBreak + 1).trim());
        const trailing = raw.slice(sentenceBreak + 1).trim();
        return [
          { kind: "list", intro, items: items.map(stripTrailingSeparator) },
          ...(trailing.length > 0 ? [{ kind: "paragraph" as const, text: trailing }] : []),
        ];
      }
    }

    items.push(raw.trim());
  }

  return [{ kind: "list", intro, items: items.map(stripTrailingSeparator) }];
}

function stripTrailingSeparator(item: string): string {
  return item.replace(/[;.]\s*$/, "");
}
