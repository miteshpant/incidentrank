import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CLIENT_RETRY_BEHAVIOR_KEY,
  ELECTION_TIMEOUT_MS_KEY,
  FLAKY_NODE_ISOLATED_KEY,
  HEARTBEAT_INTERVAL_MS_KEY,
  QUORUM_VOTING_SET_SIZE_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every rule carries
 * `feedback` per Phase 6B's mandatory post-incident-feedback requirement
 * (docs/implementation_plan/phase6b.md section 13). Ids are stable and
 * intentionally neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: ELECTION_TIMEOUT_MS_KEY,
    valueEquals: 1_200,
    whenTriggerEquals: { networkJitterNode3: true },
    outcome: "beneficial",
    feedback: {
      title: "Raised the timeout with real margin over the observed jitter",
      explanation:
        "The observed latency spikes reached roughly 900ms. A 1200ms election timeout clears that envelope with genuine margin, so a jitter spike alone no longer gets misread as leader death — while still being short enough to fail over quickly if the leader ever genuinely dies. This is the proportionate fix: enough margin above the observed jitter, not the maximum available value.",
    },
  },
  {
    id: "acr_2",
    controlKey: ELECTION_TIMEOUT_MS_KEY,
    valueAtMost: 600,
    whenTriggerEquals: { networkJitterNode3: true },
    outcome: "harmful",
    feedback: {
      title: "Timeout left with no margin over the observed jitter",
      explanation:
        "The observed latency spikes reached roughly 900ms. A timeout at or below 600ms is still shorter than that envelope, so every jitter spike continues to be misread as leader death and the cluster keeps re-electing — the underlying cause (timeout too short relative to the jitter it has to tolerate) was never addressed.",
    },
  },
  {
    id: "acr_3",
    controlKey: ELECTION_TIMEOUT_MS_KEY,
    valueAtLeast: 3_000,
    whenTriggerEquals: { networkJitterNode3: true },
    outcome: "harmful",
    feedback: {
      title: "Timeout raised far past what the jitter actually required",
      explanation:
        "3000ms clears the ~900ms jitter envelope just as well as a much smaller margin would, and looks identical while the leader is merely dealing with transient latency. But that same oversized margin becomes the cluster's failure-detection time if the leader ever genuinely dies — writes stay unavailable for the full timeout, repeatedly, until a new leader is confirmed. Bigger is not automatically safer; the goal is enough margin over the observed jitter, not the maximum available value.",
    },
  },
  {
    id: "acr_4",
    controlKey: HEARTBEAT_INTERVAL_MS_KEY,
    valueEquals: 200,
    whenTriggerEquals: { networkJitterNode3: true },
    outcome: "harmful",
    feedback: {
      title: "Heartbeat cadence left too sparse to back up the timeout",
      explanation:
        "A 200ms heartbeat interval leaves comparatively few attempts inside even a 1200ms election timeout window, so a single additional delayed heartbeat on top of a jitter spike can still occasionally trip the timeout. Election timeout and heartbeat interval interact — raising the timeout alone is not always sufficient if the heartbeat cadence doesn't leave real room for retries inside that window.",
    },
  },
  {
    id: "acr_5",
    controlKey: FLAKY_NODE_ISOLATED_KEY,
    valueEquals: true,
    whenTriggerEquals: { networkJitterNode3: true },
    outcome: "neutral",
    feedback: {
      title: "Removed the flaky node from the vote instead of tuning around it",
      explanation:
        "Isolating node-3 from the voting set means its jitter can no longer trigger a spurious election at all, regardless of timeout settings — a valid, complementary path since the jitter is isolated to one identifiable node. The real cost is that the voting set shrinks to two members, so the cluster now has zero remaining margin: losing either of the other two nodes loses quorum outright.",
    },
  },
  {
    id: "acr_6",
    controlKey: CLIENT_RETRY_BEHAVIOR_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { networkJitterNode3: true },
    outcome: "harmful",
    feedback: {
      title: "Aggressive client retries amplified an already-unstable cluster",
      explanation:
        "While the cluster was already experiencing spurious elections, aggressive immediate client retries multiplied request volume against a cluster that kept going leaderless — worsening the throughput collapse on top of the underlying instability rather than waiting it out. This never caused the instability itself, but it made its customer-facing impact worse for as long as the underlying cause went unaddressed.",
    },
  },
  {
    id: "acr_7",
    controlKey: QUORUM_VOTING_SET_SIZE_KEY,
    valueAtLeast: 5,
    whenTriggerEquals: { networkJitterNode3: true },
    outcome: "harmful",
    feedback: {
      title: "Widened the voting set without addressing the flaky link",
      explanation:
        "Adding a standby voter raises fault tolerance for node loss in general, but it does nothing about node-3's jittery link specifically. With the underlying timeout/jitter mismatch still unaddressed, every spurious election now also has to collect votes from a larger set — adding consensus overhead to an already-frequent problem instead of relieving it.",
    },
  },
];
