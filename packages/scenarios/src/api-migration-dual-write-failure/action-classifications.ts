import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  MIGRATION_DIRECTION_KEY,
  READ_SOURCE_KEY,
  RECONCILIATION_MODE_KEY,
  REPAIR_PRIORITY_KEY,
  ROLLBACK_APPLICATION_TRAFFIC_KEY,
  ROLLOUT_PERCENT_KEY,
  SHADOW_TRAFFIC_KEY,
  WRITE_MODE_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per the mandatory post-incident-feedback
 * requirement, describing the system consequence (what happened, why,
 * what pressure moved where, and any historical damage incurred or
 * avoided) rather than a verdict. Ids are stable and intentionally
 * neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: WRITE_MODE_KEY,
    valueEquals: "legacy-only",
    whenTriggerEquals: { dualWriteDivergenceActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Froze write authority to Legacy",
      explanation:
        "Moving write mode off dual to legacy-only stops any further asymmetric write outcome — new divergence between Legacy and New stops accumulating from this point forward. This does NOT repair any divergence that already exists: unreconciledDivergentRecordCount holds at whatever it already was, and only an actual reconciliation process can bring it down.",
    },
  },
  {
    id: "acr_2",
    controlKey: WRITE_MODE_KEY,
    valueEquals: "new-only",
    whenTriggerEquals: { dualWriteDivergenceActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Froze write authority to New",
      explanation:
        "Moving write mode off dual to new-only stops any further asymmetric write outcome by making New the single authoritative write target. Exactly like freezing to Legacy, this halts NEW divergence but leaves the existing historical backlog exactly where it was — reconciliation still has to run.",
    },
  },
  {
    id: "acr_3",
    controlKey: ROLLOUT_PERCENT_KEY,
    valueAtLeast: 75,
    whenTriggerEquals: { dualWriteDivergenceActive: true },
    outcome: "harmful",
    feedback: {
      title: "Increased rollout while still dual-writing",
      explanation:
        "Pushing rollout percent up while write mode is still dual increases the volume of concurrent dual-write attempts — more requests means more chances for an asymmetric write outcome. This measurably accelerated how fast unreconciledDivergentRecordCount grew compared to leaving rollout unchanged, trading migration velocity for a bigger correctness backlog to clean up later.",
    },
  },
  {
    id: "acr_4",
    controlKey: RECONCILIATION_MODE_KEY,
    valueEquals: "replay-blind",
    whenTriggerEquals: { dualWriteDivergenceActive: true },
    outcome: "harmful",
    feedback: {
      title: "Ran a blind log replay as the repair mechanism",
      explanation:
        "Replay-blind reconciliation mechanically replays one side's write log onto the other without checking whether the target already independently holds a conflicting or newer value for the same record. The raw divergence count dropped quickly, which looks like progress, but blindReplayCorruptionCount climbed as real data was overwritten or duplicated without a genuine conflict check — a new, distinct correctness violation layered on top of the original divergence, not a repair of it.",
    },
  },
  {
    id: "acr_5",
    controlKey: RECONCILIATION_MODE_KEY,
    valueEquals: "diff-and-repair",
    whenTriggerEquals: { dualWriteDivergenceActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Started a diff-and-repair reconciliation pass",
      explanation:
        "Diff-and-repair compares both sides record-by-record and repairs only genuine gaps or conflicts, instead of mechanically overwriting data. This safely drains unreconciledDivergentRecordCount over real elapsed reconciliation time — it does not happen instantly, and it does not corrupt data the way a blind replay does.",
    },
  },
  {
    id: "acr_6",
    controlKey: ROLLBACK_APPLICATION_TRAFFIC_KEY,
    valueEquals: true,
    whenTriggerEquals: { dualWriteDivergenceActive: true },
    outcome: "neutral",
    feedback: {
      title: "Rolled back application traffic to Legacy",
      explanation:
        "Rolling back application traffic stops the Migration Layer from routing new requests to New. By itself this is a reasonable containment step — but it does NOT repair any data already written only to New during the dual-write window. Whether this was safe depends entirely on what happens next: switching reads to Legacy before reconciling those New-only writes makes them invisible, not merely rolled back.",
    },
  },
  {
    id: "acr_7",
    controlKey: READ_SOURCE_KEY,
    valueEquals: "legacy",
    whenTriggerEquals: { dualWriteDivergenceActive: true },
    outcome: "harmful",
    feedback: {
      title: "Switched reads to Legacy before reconciling New-only writes",
      explanation:
        "Routing all reads to Legacy while acknowledged writes still exist only on New makes those writes silently disappear from every customer-facing read — requestSuccessRate stays high because Legacy itself is healthy, but silentlyLostAcknowledgedWriteCount and exposedDivergentReadCount both climbed as a direct, counted consequence. The system looks available while real acknowledged data is now invisible.",
    },
  },
  {
    id: "acr_8",
    controlKey: REPAIR_PRIORITY_KEY,
    valueEquals: "critical-first",
    whenTriggerEquals: { dualWriteDivergenceActive: true },
    outcome: "neutral",
    feedback: {
      title: "Prioritized reconciliation workers over live traffic",
      explanation:
        "Dedicating most of New DB's write capacity to repair work drains the historical backlog faster, but it measurably raised newServiceWriteLatencyMs for live migration traffic — the pressure did not disappear, it moved from the reconciliation backlog onto New Service's live write path. Pairing this with a simultaneously high rollout percentage compounds the effect further, since more live write volume now competes for the same dedicated repair capacity.",
    },
  },
  {
    id: "acr_9",
    controlKey: MIGRATION_DIRECTION_KEY,
    valueEquals: "rollback-legacy",
    whenTriggerEquals: { dualWriteDivergenceActive: true },
    outcome: "neutral",
    feedback: {
      title: "Declared the strategic direction: abandon migration, stay on Legacy",
      explanation:
        "Declaring rollback-legacy as the migration direction is a legitimate strategic choice, but it does not itself repair anything — it only matters once write authority is single-sourced and the historical divergence backlog has actually been reconciled to zero. Declaring this direction before reconciliation is complete does not make an unreconciled backlog safe.",
    },
  },
  {
    id: "acr_10",
    controlKey: MIGRATION_DIRECTION_KEY,
    valueEquals: "continue-new",
    whenTriggerEquals: { dualWriteDivergenceActive: true },
    outcome: "neutral",
    feedback: {
      title: "Declared the strategic direction: complete migration onto New",
      explanation:
        "Declaring continue-new as the migration direction is an equally legitimate strategic choice to rollback-legacy, provided write authority is single-sourced on New and the historical divergence backlog has actually been reconciled to zero first. This control alone does not reconcile anything or raise rollout — it only declares intent.",
    },
  },
  {
    id: "acr_11",
    controlKey: SHADOW_TRAFFIC_KEY,
    valueEquals: true,
    whenTriggerEquals: { dualWriteDivergenceActive: true },
    outcome: "neutral",
    feedback: {
      title: "Enabled shadow traffic to New as a warm-up signal",
      explanation:
        "Shadow traffic writes every request to New in the background without granting it any read or write authority — by itself it does not stop or repair any divergence, and unreconciledDivergentRecordCount kept growing exactly as it would have otherwise. Its real value only shows up if rollout percent is later raised while still dual-writing: having already warmed up and validated New's write path measurably reduced how much that rollout increase accelerated divergence, compared to raising rollout cold with no warm-up (see rules.ts's aggressive-rollout-increase-with-shadow-warmup vs aggressive-rollout-increase-accelerates-divergence at the same trigger window).",
    },
  },
];
