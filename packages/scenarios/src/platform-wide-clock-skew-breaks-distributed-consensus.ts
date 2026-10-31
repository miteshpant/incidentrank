import type { ScenarioDefinition } from "./types";
import {
  platformWideClockSkewBreaksDistributedConsensusSimulation,
  INSPECT_NTP_SYNC_STATUS_KEY,
  INSPECT_LOCK_SERVICE_LOGS_KEY,
  INSPECT_LEDGER_ORDERING_KEY,
  INSPECT_RATE_LIMITER_WINDOWS_KEY,
  RESYNC_FLEET_CLOCKS_KEY,
  FORCE_LEADER_REELECTION_KEY,
  RESTART_LOCK_SERVICE_KEY,
  RESTART_LEDGER_SERVICE_KEY,
  RESTART_RATE_LIMITER_KEY,
} from "./platform-wide-clock-skew-breaks-distributed-consensus/definition";
import { platformWideClockSkewBreaksDistributedConsensusCandidateUI } from "./platform-wide-clock-skew-breaks-distributed-consensus/candidate-ui";
import { PLATFORM_WIDE_CLOCK_SKEW_BREAKS_DISTRIBUTED_CONSENSUS_SCORING } from "./platform-wide-clock-skew-breaks-distributed-consensus/scoring";

/**
 * Phase 6D principal-level incident — a causal-unification diagnosis
 * lesson distinct from this catalog's existing single-subsystem
 * split-brain/leader-election/quorum-loss scenarios. A silent NTP sync
 * failure lets fleet node clocks drift apart. Three subsystems that
 * share NO direct dependency on each other — a distributed lock service
 * (lease-token ordering), an event-sourcing ledger (timestamp-based
 * conflict resolution), and a sliding-window rate limiter — all start
 * failing SIMULTANEOUSLY, each in a way that looks like its own
 * independent bug. Restarting any one of them in isolation produces a
 * brief, misleading dip in that subsystem's own symptom while leaving
 * the other two completely untouched and the underlying clocks still
 * skewed. The candidate must recognize all three symptoms trace back to
 * one shared upstream cause — the NTP source several hops away — rather
 * than debugging three unrelated incidents in parallel.
 */
export const platformWideClockSkewBreaksDistributedConsensus: ScenarioDefinition = {
  id: "platform-wide-clock-skew-breaks-distributed-consensus",
  slug: "platform-wide-clock-skew-breaks-distributed-consensus",
  version: 1,
  name: "Platform-Wide Clock Skew Breaks Distributed Consensus",
  description:
    "The distributed lock service is split-brained. The event-sourcing ledger is reordering writes. The rate limiter is false-throttling healthy traffic. Three services, no shared edges between them, all failing at once. Each looks like its own bug — until you trace all three back through the fleet nodes to a single silently-failing NTP sync job. Diagnose the shared upstream cause and resync the fleet's clocks, rather than chasing three unrelated-looking incidents at once.",
  difficulty: "principal",
  estimatedMinutes: 25,
  isFree: false,
  structure: "cascading",
  simulation: platformWideClockSkewBreaksDistributedConsensusSimulation,
  library: {
    category: "Distributed Systems",
    tags: [
      "Clock Skew",
      "NTP",
      "Consensus",
      "Causal Unification",
      "Leader Election",
      "Event Sourcing",
      "Rate Limiting",
    ],
    primarySkill: "Unifying simultaneous, seemingly-unrelated failures behind one shared root cause",
    skills: [
      "Recognizing a single upstream cause behind multiple independent-looking symptoms",
      "Distinguishing a shared-dependency failure from three separate single-subsystem bugs",
      "Understanding how timestamp-ordered consensus degrades under clock skew",
      "Recognizing a plausible-but-insufficient per-subsystem remediation",
      "Verifying recovery across every affected subsystem, not just one",
    ],
    shortDescription:
      "Lock service, ledger, and rate limiter all break at once with no shared edge between them — the real cause is a silently-failing NTP sync job several hops upstream.",
  },
};

export {
  platformWideClockSkewBreaksDistributedConsensusSimulation,
  platformWideClockSkewBreaksDistributedConsensusCandidateUI,
  PLATFORM_WIDE_CLOCK_SKEW_BREAKS_DISTRIBUTED_CONSENSUS_SCORING,
  INSPECT_NTP_SYNC_STATUS_KEY,
  INSPECT_LOCK_SERVICE_LOGS_KEY,
  INSPECT_LEDGER_ORDERING_KEY,
  INSPECT_RATE_LIMITER_WINDOWS_KEY,
  RESYNC_FLEET_CLOCKS_KEY,
  FORCE_LEADER_REELECTION_KEY,
  RESTART_LOCK_SERVICE_KEY,
  RESTART_LEDGER_SERVICE_KEY,
  RESTART_RATE_LIMITER_KEY,
};
