import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { enterpriseWideDependencyDeprecation, cacheNodeFailure } from "@incidentrank/scenarios";
import { StructuredDescription } from "./structured-description";

/**
 * DOM-level regression (docs/implementation_plan/phase7.action.md
 * section 30: "Add UI/component tests proving numbered invariants
 * render as distinct list items... paragraphs remain separate...
 * Use #100 as one regression fixture because its six-invariant
 * wall-of-text issue was observed directly. Also test at least one
 * shorter scenario."). Complements format-scenario-description.test.ts
 * (which only tests the pure parser) by proving the actual rendered
 * DOM has 6 separate <li> elements, not merely 6 parsed strings.
 */
describe("StructuredDescription", () => {
  it("renders #100's six business invariants as six distinct <li> elements", () => {
    render(<StructuredDescription description={enterpriseWideDependencyDeprecation.description} />);

    const list = screen.getByRole("list");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(6);

    expect(items[0]).toHaveTextContent(/no critical product may remain dependent/i);
    expect(items[5]).toHaveTextContent(/deadline risk must remain candidate-visible throughout/i);

    // The intro sentence and the trailing "Decide how to sequence..."
    // paragraph both render as their own separate text nodes outside
    // the <ol>, not swallowed into any list item.
    expect(screen.getByText(/six business invariants govern every decision:/i)).toBeInTheDocument();
    expect(
      screen.getByText(/^decide how to sequence the four products/i),
    ).toBeInTheDocument();
    expect(list.tagName).toBe("OL");
  });

  it("renders a shorter scenario with no enumerated invariants as a single paragraph, no list", () => {
    render(<StructuredDescription description={cacheNodeFailure.description} />);

    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText(cacheNodeFailure.description)).toBeInTheDocument();
  });
});
