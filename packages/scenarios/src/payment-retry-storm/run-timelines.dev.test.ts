import { describe, it } from "vitest";
import { printScenarioTimeline } from "./timeline-runner";
import { PROVIDER_RECOVERY_END_MS } from "./timed-events";
import {
  BACKOFF_KEY,
  CIRCUIT_BREAKER_KEY,
  PAYMENT_INSTANCES_KEY,
  RETRIES_KEY,
  TIMEOUT_SECONDS_KEY,
} from "./controls";

/**
 * Development-only runner, not an assertion-bearing test. Prints
 * human-readable timelines for Runs A-D to stdout for manual inspection.
 * Run with: pnpm --filter @incidentrank/scenarios exec vitest run
 *   src/payment-retry-storm/run-timelines.dev.test.ts --reporter=basic
 */
describe.skip("Payment Retry Storm — development timeline runner", () => {
  const UNTIL_MS = PROVIDER_RECOVERY_END_MS + 60_000;

  it("prints Run A — No action", () => {
    printScenarioTimeline("Run A — No action", UNTIL_MS, []);
  });

  it("prints Run B — Strong mitigation", () => {
    printScenarioTimeline("Run B — Strong mitigation", UNTIL_MS, [
      { atMs: 65_000, controlKey: RETRIES_KEY, value: 1, label: "retries 3 → 1" },
      {
        atMs: 90_000,
        controlKey: BACKOFF_KEY,
        value: "exponential",
        label: "backoff none → exponential",
      },
      {
        atMs: 120_000,
        controlKey: CIRCUIT_BREAKER_KEY,
        value: "on",
        label: "circuit breaker off → on",
      },
    ]);
  });

  it("prints Run C — Harmful mitigation", () => {
    printScenarioTimeline("Run C — Harmful mitigation", UNTIL_MS, [
      {
        atMs: 65_000,
        controlKey: PAYMENT_INSTANCES_KEY,
        value: 24,
        label: "payment instances 8 → 24",
      },
      { atMs: 70_000, controlKey: RETRIES_KEY, value: 5, label: "retries 3 → 5" },
      {
        atMs: 75_000,
        controlKey: TIMEOUT_SECONDS_KEY,
        value: 5,
        label: "timeout 2s → 5s",
      },
    ]);
  });

  it("prints Run D — Alternative reasonable mitigation", () => {
    printScenarioTimeline("Run D — Alternative reasonable mitigation", UNTIL_MS, [
      { atMs: 65_000, controlKey: RETRIES_KEY, value: 1, label: "retries 3 → 1" },
      {
        atMs: 90_000,
        controlKey: TIMEOUT_SECONDS_KEY,
        value: 3,
        label: "timeout 2s → 3s",
      },
      {
        atMs: 110_000,
        controlKey: BACKOFF_KEY,
        value: "exponential",
        label: "backoff none → exponential",
      },
      {
        atMs: 140_000,
        controlKey: CIRCUIT_BREAKER_KEY,
        value: "on",
        label: "circuit breaker off → on",
      },
    ]);
  });
});
