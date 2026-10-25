import type { ScenarioGoldenPath } from "./types";
import {
  RESERVATION_TIMING_KEY,
  RESERVED_CAPACITY_REGION_A_KEY,
  RESERVED_CAPACITY_REGION_B_KEY,
  RESERVED_CAPACITY_REGION_C_KEY,
} from "../emergency-capacity-reservation-decision/definition";

/**
 * Extracted from emergency-capacity-reservation-decision.test.ts's
 * "Alternate Strong Path A: balanced-high reservation (900/900/900)" ->
 * "reaches genuine OPTIMAL once the event is sustained, with
 * fallback/shedding/confidence/contingency all left at their untouched
 * defaults" (HIGH_ACTIONS), tier optimal.
 */
export const emergencyCapacityReservationDecisionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "emergency-capacity-reservation-decision",
  actions: [
    { atMs: 6_000, controlKey: RESERVED_CAPACITY_REGION_A_KEY, value: 900 },
    { atMs: 7_000, controlKey: RESERVED_CAPACITY_REGION_B_KEY, value: 900 },
    { atMs: 8_000, controlKey: RESERVED_CAPACITY_REGION_C_KEY, value: 900 },
    { atMs: 9_000, controlKey: RESERVATION_TIMING_KEY, value: "lock-in-now" },
  ],
  finishAtMs: 410_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
