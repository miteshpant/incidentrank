import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinishIncidentDialog } from "./finish-incident-dialog";

/**
 * Phase 7.3 regression (Group J accessibility sanity pass): when the
 * dialog opens, focus must move into it (confirmed live it was staying
 * on <body>, so screen readers never announced the dialog and Escape had
 * no listener to reach), and Escape must close it without confirming.
 */
describe("FinishIncidentDialog accessibility", () => {
  it("moves focus into the dialog when it opens", () => {
    render(
      <FinishIncidentDialog
        open={true}
        finishing={false}
        finishError={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /keep working/i }),
    );
  });

  it("closes via Escape without calling onConfirm", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <FinishIncidentDialog
        open={true}
        finishing={false}
        finishError={null}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not move focus or listen for Escape while closed", () => {
    const onCancel = vi.fn();
    render(
      <FinishIncidentDialog
        open={false}
        finishing={false}
        finishError={null}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
