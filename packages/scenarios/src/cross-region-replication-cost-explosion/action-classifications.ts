import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  ARCHIVE_REPLICATION_MODE_KEY,
  CRITICAL_DATA_PINNING_KEY,
  CRITICAL_REPLICATION_FACTOR_KEY,
  LOW_PRIORITY_REGION_FAN_OUT_KEY,
  LOW_PRIORITY_REPLICATION_FACTOR_KEY,
  STANDARD_REPLICATION_MODE_KEY,
  TRANSFER_BATCHING_KEY,
  TRANSFER_COMPRESSION_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per phase6e2.md requirement 9. Ids are
 * stable and intentionally neutral, never self-descriptive of the
 * authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: CRITICAL_REPLICATION_FACTOR_KEY,
    valueAtMost: 2,
    whenTriggerEquals: { policyChangeDiscovered: true },
    outcome: "harmful",
    feedback: {
      title: "Dropped critical data below its mandated durability floor",
      explanation:
        "Reducing the critical data class's replication factor below 3 regional copies looks like the single biggest cost win available — the per-copy footprint for this class dominates the bill, and freshness stays perfectly fine because the data is still replicated, just to fewer copies. But this directly breaches the business-mandated disaster-recovery floor for critical data. Nothing about this is visible on a live dashboard; the real cost only appears if a disaster-recovery verification drill runs while the floor is breached, at which point a permanent, non-resetting exposure event is recorded. Lower cost was accepted at the price of a real, policy-violating durability gap.",
    },
  },
  {
    id: "acr_2",
    controlKey: CRITICAL_REPLICATION_FACTOR_KEY,
    valueEquals: 3,
    whenTriggerEquals: { policyChangeDiscovered: true },
    outcome: "beneficial",
    feedback: {
      title: "Kept critical data at its policy-mandated durability floor",
      explanation:
        "Leaving the critical data class at 3 full regional copies preserves the business's disaster-recovery guarantee for the one data class that actually requires it. This control contributes nothing to cost relief by itself — the real cost reduction in this incident comes from narrowing scope or mode for the low-priority and standard classes instead — but it protects the one guarantee that must never be silently weakened.",
    },
  },
  {
    id: "acr_3",
    controlKey: LOW_PRIORITY_REGION_FAN_OUT_KEY,
    valueEquals: "origin-plus-one",
    whenTriggerEquals: { policyChangeDiscovered: true },
    outcome: "beneficial",
    feedback: {
      title: "Narrowed low-priority data's region fan-out (Strategy A)",
      explanation:
        "Low-priority data was never policy-mandated to replicate to every region — narrowing its fan-out to its origin region plus one DR-designated region removes real, unjustified egress cost with zero durability-floor risk, since this class carries no disaster-recovery mandate at all. This is a SCOPE-based cost reduction: it changes WHICH regions receive a copy, not how many copies exist or how urgently they are shipped.",
    },
  },
  {
    id: "acr_4",
    controlKey: LOW_PRIORITY_REPLICATION_FACTOR_KEY,
    valueAtMost: 2,
    whenTriggerEquals: { policyChangeDiscovered: true },
    outcome: "beneficial",
    feedback: {
      title: "Reduced low-priority data's replication factor",
      explanation:
        "Low-priority data (ephemeral telemetry/analytics exports) was never policy-mandated to carry 3 full regional copies, so lowering its replication factor is genuinely free cost relief — unlike lowering the critical class's factor, this carries no durability-floor risk at all.",
    },
  },
  {
    id: "acr_5",
    controlKey: STANDARD_REPLICATION_MODE_KEY,
    valueEquals: "async-batched",
    whenTriggerEquals: { policyChangeDiscovered: true },
    outcome: "beneficial",
    feedback: {
      title: "Switched the standard data class to async-batched replication (Strategy B)",
      explanation:
        "The standard data class does not need synchronous, immediate replication to stay within a reasonable freshness bound. Batching and shipping its writes on a short delay cuts real cross-region transfer cost while keeping staleness bounded to the batch interval, never unbounded. This is a MODE-based cost reduction — it changes HOW URGENTLY a copy is shipped, leaving fan-out scope and replication factor untouched for every class, a genuinely different mechanism than narrowing scope.",
    },
  },
  {
    id: "acr_6",
    controlKey: TRANSFER_COMPRESSION_KEY,
    valueEquals: "on",
    whenTriggerEquals: { policyChangeDiscovered: true },
    outcome: "beneficial",
    feedback: {
      title: "Enabled cross-region transfer compression",
      explanation:
        "Compressing cross-region payloads reduces transfer bytes for every class and every region without touching durability or freshness for any of them. At this scenario's expanded fan-out volume the CPU overhead is clearly worth paying — genuine, uniformly-safe relief, though modest compared to either primary strategy.",
    },
  },
  {
    id: "acr_7",
    controlKey: ARCHIVE_REPLICATION_MODE_KEY,
    valueEquals: "scheduled-batch",
    whenTriggerEquals: { policyChangeDiscovered: true },
    outcome: "beneficial",
    feedback: {
      title: "Moved archive replication off full-sync",
      explanation:
        "Archived/cold data is, by definition, not on the live disaster-recovery critical path the way active critical data is — the business invariant explicitly allows slower replication for this class. Shipping archive replication on a long batch interval instead of synchronously removes real, substantial, and genuinely unnecessary cost with zero downside for this one class, regardless of what any other control is set to.",
    },
  },
  {
    id: "acr_8",
    controlKey: TRANSFER_BATCHING_KEY,
    valueEquals: "large-batched",
    whenTriggerEquals: { policyChangeDiscovered: true },
    outcome: "neutral",
    feedback: {
      title: "Consolidated transfers into larger batches",
      explanation:
        "Shipping fewer, larger cross-region transfers reduces per-transfer overhead cost for whichever classes are already in async/batched mode. On its own (without a mode/scope strategy already engaged) the effect is small, since the critical class stays synchronous and unaffected by this control regardless.",
    },
  },
  {
    id: "acr_9",
    controlKey: CRITICAL_DATA_PINNING_KEY,
    valueEquals: true,
    whenTriggerEquals: { policyChangeDiscovered: true },
    outcome: "neutral",
    feedback: {
      title: "Explicitly pinned the critical data class's durability floor",
      explanation:
        "This is a deliberate, visible acknowledgment that the critical class's 3x floor is being protected on purpose rather than left alone by accident. It does not, by itself, reduce any cost — the real cost reduction in this incident comes from the scope/mode levers on the low-priority and standard classes instead — but it is a genuine safety-rail signal distinct from simply never having touched the critical factor at all.",
    },
  },
];
