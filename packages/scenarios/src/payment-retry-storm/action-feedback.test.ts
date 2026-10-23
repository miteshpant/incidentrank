import { reviewAttempt, type ReplayActionGroup } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { paymentRetryStormSimulation } from "./definition";

/**
 * Phase 6.1 "Post-Incident Practice Explanation": proves reviewAttempt
 * resolves real authored feedback for Payment Retry Storm's
 * actionClassifications (packages/scenarios/src/payment-retry-storm/
 * action-classifications.ts) — the scenario the spec's own example
 * ("Reduced retry amplification... Lowering retries reduced pressure on
 * the degraded payment provider") is modeled on.
 */
describe("Payment Retry Storm — post-incident feedback", () => {
  const actionGroups: ReplayActionGroup[] = [
    { elapsedMs: 65_000, changes: [{ controlKey: "retries", value: 1 }] },
    { elapsedMs: 90_000, changes: [{ controlKey: "backoff", value: "exponential" }] },
    { elapsedMs: 120_000, changes: [{ controlKey: "circuitBreaker", value: "on" }] },
  ];

  it("resolves the exact authored feedback for each beneficial mitigation, in original order", () => {
    const { actionGroups: reviewed } = reviewAttempt(
      paymentRetryStormSimulation,
      actionGroups,
      125_000,
    );

    expect(reviewed).toHaveLength(3);

    const retriesChange = reviewed[0]!.changes[0]!;
    expect(retriesChange.outcome).toBe("beneficial");
    expect(retriesChange.feedback).toEqual({
      title: "Reduced retry amplification",
      explanation:
        "Lowering retries reduced pressure on the degraded payment provider, giving it room to recover instead of being hit with repeated retry traffic.",
    });

    const backoffChange = reviewed[1]!.changes[0]!;
    expect(backoffChange.outcome).toBe("beneficial");
    expect(backoffChange.feedback?.title).toBe("Spaced out retry attempts");

    const circuitBreakerChange = reviewed[2]!.changes[0]!;
    expect(circuitBreakerChange.outcome).toBe("beneficial");
    expect(circuitBreakerChange.feedback?.title).toBe("Stopped calls to a failing dependency");
  });

  it("resolves harmful feedback for the payment-instances scaling trap", () => {
    const harmfulActionGroups: ReplayActionGroup[] = [
      { elapsedMs: 65_000, changes: [{ controlKey: "paymentInstances", value: 24 }] },
    ];
    const { actionGroups: reviewed } = reviewAttempt(
      paymentRetryStormSimulation,
      harmfulActionGroups,
      70_000,
    );

    const change = reviewed[0]!.changes[0]!;
    expect(change.outcome).toBe("harmful");
    expect(change.feedback?.title).toBe("Scaled the wrong tier");
  });

  it("resolves no feedback (not just no outcome) for an action taken before the incident begins", () => {
    // retries<=1 is only beneficial once providerDegraded is true
    // (incident begins at T=60s) — applying it earlier must not match
    // the trigger-gated classification rule at all.
    const earlyActionGroups: ReplayActionGroup[] = [
      { elapsedMs: 10_000, changes: [{ controlKey: "retries", value: 1 }] },
    ];
    const { actionGroups: reviewed } = reviewAttempt(
      paymentRetryStormSimulation,
      earlyActionGroups,
      15_000,
    );

    const change = reviewed[0]!.changes[0]!;
    expect(change.outcome).toBe("neutral");
    expect(change.feedback).toBeNull();
  });
});
