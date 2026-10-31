import type { ScenarioGoldenPath } from "./types";
import {
  FORCE_LEADER_REELECTION_KEY,
  INSPECT_LEDGER_ORDERING_KEY,
  INSPECT_LOCK_SERVICE_LOGS_KEY,
  INSPECT_NTP_SYNC_STATUS_KEY,
  INSPECT_RATE_LIMITER_WINDOWS_KEY,
  RESYNC_FLEET_CLOCKS_KEY,
} from "../platform-wide-clock-skew-breaks-distributed-consensus/definition";

const SKEW_BEGINS_MS = 30_000;

/**
 * Extracted from platform-wide-clock-skew-breaks-distributed-consensus
 * .test.ts's "investigating NTP, lock service, ledger, and rate limiter,
 * then resyncing and re-electing — reaches the unified path" (the
 * scenario's own authored strongest path, mirrored by the scoring
 * suite's "a candidate who unifies the diagnosis before fixing scores
 * strictly higher..." test, which runs the identical action sequence
 * out to `SKEW_BEGINS_MS + 26_000` and observes a `resolved` outcome).
 * definition.ts's completion has no acceptableCondition authored, so the
 * resolved outcome is automatically tier optimal.
 */
export const platformWideClockSkewBreaksDistributedConsensusGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "platform-wide-clock-skew-breaks-distributed-consensus",
  actions: [
    { atMs: SKEW_BEGINS_MS + 1_000, controlKey: INSPECT_NTP_SYNC_STATUS_KEY, value: true },
    { atMs: SKEW_BEGINS_MS + 2_000, controlKey: INSPECT_LOCK_SERVICE_LOGS_KEY, value: true },
    { atMs: SKEW_BEGINS_MS + 3_000, controlKey: INSPECT_LEDGER_ORDERING_KEY, value: true },
    { atMs: SKEW_BEGINS_MS + 4_000, controlKey: INSPECT_RATE_LIMITER_WINDOWS_KEY, value: true },
    { atMs: SKEW_BEGINS_MS + 5_000, controlKey: RESYNC_FLEET_CLOCKS_KEY, value: true },
    { atMs: SKEW_BEGINS_MS + 6_000, controlKey: FORCE_LEADER_REELECTION_KEY, value: true },
  ],
  finishAtMs: SKEW_BEGINS_MS + 26_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
