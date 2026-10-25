import { describe, expect, it } from "vitest";
import { enterpriseWideDependencyDeprecation } from "@incidentrank/scenarios";
import { cacheNodeFailure } from "@incidentrank/scenarios";
import { parseScenarioDescription } from "./format-scenario-description";

/**
 * Phase 7.1 regression (docs/implementation_plan/phase7.action.md
 * section 12): proves the parser turns #100's six inline-enumerated
 * business invariants into distinct list items using the scenario's
 * real, unmodified description text — not a synthetic fixture — and
 * that a shorter scenario with no embedded enumeration still renders as
 * a single untouched paragraph.
 */
describe("parseScenarioDescription", () => {
  it("splits #100's six business invariants into distinct list items", () => {
    const segments = parseScenarioDescription(enterpriseWideDependencyDeprecation.description);

    const list = segments.find((segment) => segment.kind === "list");
    expect(list).toBeDefined();
    expect(list?.items).toHaveLength(6);
    expect(list?.intro).toMatch(/six business invariants govern every decision:/i);

    expect(list?.items?.[0]).toMatch(/no critical product may remain dependent/i);
    expect(list?.items?.[5]).toMatch(/deadline risk must remain candidate-visible throughout/i);
    // Items must not retain the "(N)" marker or a trailing separator.
    for (const item of list?.items ?? []) {
      expect(item).not.toMatch(/^\(\d+\)/);
      expect(item).not.toMatch(/[;.]$/);
    }

    // The trailing "Decide how to sequence..." sentence survives as its
    // own paragraph, not swallowed into the last list item.
    const trailing = segments.find((segment) => segment.kind === "paragraph");
    expect(trailing?.text).toMatch(/^decide how to sequence the four products/i);
  });

  it("renders a description with no enumerated markers as a single untouched paragraph", () => {
    const segments = parseScenarioDescription(cacheNodeFailure.description);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({ kind: "paragraph", text: cacheNodeFailure.description });
  });

  it("does not mistake a narrative parenthetical for a list marker", () => {
    const description =
      "The error rate spikes immediately (not a gradual degradation). A single configuration change restores it.";
    const segments = parseScenarioDescription(description);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({ kind: "paragraph", text: description });
  });

  it("handles exactly two numbered markers as a genuine short list", () => {
    const description = "Two invariants govern this: (1) never skip verification; (2) never mark complete early.";
    const segments = parseScenarioDescription(description);

    const list = segments.find((segment) => segment.kind === "list");
    expect(list?.items).toHaveLength(2);
    expect(list?.items?.[0]).toBe("never skip verification");
    expect(list?.items?.[1]).toBe("never mark complete early");
  });
});
