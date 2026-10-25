import type { ScenarioGoldenPath } from "./types";
import {
  MEMBERSHIP_SIZE_KEY,
  NODE_D_MEMBERSHIP_KEY,
  NODE_E_MEMBERSHIP_KEY,
} from "../quorum-loss/definition";

const QUORUM_THREATENED_MS = 30_000;
const QUORUM_LOST_MS = QUORUM_THREATENED_MS + 3 * 60_000;

/**
 * Extracted from quorum-loss.test.ts's "strong path: reconfiguring
 * membership to three nodes restores genuine quorum regardless of Node C"
 * / "membership reconfiguration restoring real quorum is eligible for an
 * OPTIMAL-tier Finish" — isolating Node D and Node E out of voting
 * membership and reconfiguring the group to three nodes. Asserted
 * eligible: true, tier: "optimal"; scores 1000/1000 in the scoring test.
 */
export const quorumLossGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "quorum-loss",
  actions: [
    { atMs: QUORUM_THREATENED_MS + 10_000, controlKey: NODE_D_MEMBERSHIP_KEY, value: "isolated" },
    { atMs: QUORUM_THREATENED_MS + 11_000, controlKey: NODE_E_MEMBERSHIP_KEY, value: "isolated" },
    { atMs: QUORUM_THREATENED_MS + 12_000, controlKey: MEMBERSHIP_SIZE_KEY, value: "three" },
  ],
  finishAtMs: QUORUM_LOST_MS + 31_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
