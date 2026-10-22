import { describe, expect, it } from "vitest";
import { extractScoringInputs, replayAttempt } from "@incidentrank/simulator";
import { paymentRetryStormSimulation } from "@incidentrank/scenarios";
import { scorePaymentRetryStormAttempt } from "./payment-retry-storm";
import { runScenarioForScoring } from "./test-helpers";

const PROVIDER_RECOVERY_END_MS = 15 * 60 * 1000;
const UNTIL_MS = PROVIDER_RECOVERY_END_MS + 60_000;

/**
 * Proves Phase 4.1's score-integrity guarantee: a resumed attempt
 * (reconstructed via replayAttempt from persisted action groups) and an
 * uninterrupted attempt with identical actions/timing produce exactly the
 * same IncidentRank score, dimension breakdown, and scoring inputs.
 */
describe("resumed vs. uninterrupted score equality", () => {
  it("produces an identical score for the strong mitigation sequence", () => {
    const uninterruptedInputs = runScenarioForScoring(UNTIL_MS, [
      { atMs: 65_000, controlKey: "retries", value: 1 },
      { atMs: 90_000, controlKey: "backoff", value: "exponential" },
      { atMs: 120_000, controlKey: "circuitBreaker", value: "on" },
    ]);

    const replayed = replayAttempt({
      scenario: paymentRetryStormSimulation,
      elapsedMs: UNTIL_MS,
      actionGroups: [
        { elapsedMs: 65_000, changes: [{ controlKey: "retries", value: 1 }] },
        { elapsedMs: 90_000, changes: [{ controlKey: "backoff", value: "exponential" }] },
        { elapsedMs: 120_000, changes: [{ controlKey: "circuitBreaker", value: "on" }] },
      ],
    });
    const replayedInputs = extractScoringInputs(paymentRetryStormSimulation, replayed.state);

    expect(replayedInputs).toEqual(uninterruptedInputs);

    const uninterruptedScore = scorePaymentRetryStormAttempt(uninterruptedInputs);
    const replayedScore = scorePaymentRetryStormAttempt(replayedInputs);
    expect(replayedScore).toEqual(uninterruptedScore);
  });

  it("produces an identical score when a resume happens mid-sequence (grouped multi-control change)", () => {
    const uninterruptedInputs = runScenarioForScoring(UNTIL_MS, [
      { atMs: 65_000, controlKey: "retries", value: 1 },
      { atMs: 90_000, controlKey: "timeoutSeconds", value: 3 },
      { atMs: 110_000, controlKey: "backoff", value: "exponential" },
      { atMs: 140_000, controlKey: "circuitBreaker", value: "on" },
    ]);

    // Same actions, but grouped as they would be persisted from a single
    // multi-control Apply click plus a later click — replay must not care
    // that the candidate "paused" partway through in a resumed session.
    const replayed = replayAttempt({
      scenario: paymentRetryStormSimulation,
      elapsedMs: UNTIL_MS,
      actionGroups: [
        { elapsedMs: 65_000, changes: [{ controlKey: "retries", value: 1 }] },
        {
          elapsedMs: 90_000,
          changes: [
            { controlKey: "timeoutSeconds", value: 3 },
          ],
        },
        { elapsedMs: 110_000, changes: [{ controlKey: "backoff", value: "exponential" }] },
        { elapsedMs: 140_000, changes: [{ controlKey: "circuitBreaker", value: "on" }] },
      ],
    });
    const replayedInputs = extractScoringInputs(paymentRetryStormSimulation, replayed.state);

    expect(replayedInputs).toEqual(uninterruptedInputs);
    expect(scorePaymentRetryStormAttempt(replayedInputs)).toEqual(
      scorePaymentRetryStormAttempt(uninterruptedInputs),
    );
  });
});
