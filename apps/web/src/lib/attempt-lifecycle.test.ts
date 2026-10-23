import { describe, expect, it } from "vitest";
import { isAttemptActive, isAttemptTerminal, isIncidentResolved } from "./attempt-lifecycle";

describe("attempt lifecycle predicates", () => {
  it("in_progress is active, not terminal, not resolved", () => {
    const attempt = { status: "in_progress" as const, outcome: null };
    expect(isAttemptActive(attempt)).toBe(true);
    expect(isAttemptTerminal(attempt)).toBe(false);
    expect(isIncidentResolved(attempt)).toBe(false);
  });

  it("completed + resolved is terminal and resolved, not active", () => {
    const attempt = { status: "completed" as const, outcome: "resolved" as const };
    expect(isAttemptActive(attempt)).toBe(false);
    expect(isAttemptTerminal(attempt)).toBe(true);
    expect(isIncidentResolved(attempt)).toBe(true);
  });

  it("completed + failed is terminal, not resolved", () => {
    const attempt = { status: "completed" as const, outcome: "failed" as const };
    expect(isAttemptTerminal(attempt)).toBe(true);
    expect(isIncidentResolved(attempt)).toBe(false);
  });

  it("completed + declared_unstable is terminal, not resolved — not the same as failed", () => {
    const attempt = { status: "completed" as const, outcome: "declared_unstable" as const };
    expect(isAttemptTerminal(attempt)).toBe(true);
    expect(isIncidentResolved(attempt)).toBe(false);
  });

  it("completed + timed_out is terminal, not resolved", () => {
    const attempt = { status: "completed" as const, outcome: "timed_out" as const };
    expect(isAttemptTerminal(attempt)).toBe(true);
    expect(isIncidentResolved(attempt)).toBe(false);
  });

  it("abandoned is terminal, not active, not resolved, outcome is null", () => {
    const attempt = { status: "abandoned" as const, outcome: null };
    expect(isAttemptActive(attempt)).toBe(false);
    expect(isAttemptTerminal(attempt)).toBe(true);
    expect(isIncidentResolved(attempt)).toBe(false);
  });
});
