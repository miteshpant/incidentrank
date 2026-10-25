import type { ScenarioGoldenPath } from "./types";
import {
  COMPLETION_MARKING_POLICY_KEY,
  QUEUE_PRIORITY_POLICY_KEY,
} from "../privacy-deletion-backlog/definition";
import { DRAIN_WINDOW_FULLY_RECOVERED_MS, SUSTAINED_BACKLOG_MS } from "../privacy-deletion-backlog/timed-events";

/**
 * Extracted from privacy-deletion-backlog.test.ts's PATH_A_ACTIONS
 * ("Alternate strong path A: oldest-deadline-first" — "reaches genuine
 * OPTIMAL once the full drain window elapses, with every secondary lever
 * left at its untouched default") — correcting completion marking to
 * verified-complete and switching the queue priority policy to
 * oldest-deadline-first. Asserted eligible: true, tier: "optimal"; Finish
 * outcome resolved/optimal.
 */
export const privacyDeletionBacklogGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "privacy-deletion-backlog",
  actions: [
    { atMs: SUSTAINED_BACKLOG_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
    { atMs: SUSTAINED_BACKLOG_MS + 2_000, controlKey: QUEUE_PRIORITY_POLICY_KEY, value: "oldest-deadline-first" },
  ],
  finishAtMs: DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
