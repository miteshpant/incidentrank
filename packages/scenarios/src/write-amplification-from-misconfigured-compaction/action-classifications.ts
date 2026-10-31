import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  COMPACTION_LEVEL_MULTIPLIER_KEY,
  INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
  INSPECT_DISK_IOPS_METRICS_KEY,
  INSPECT_WRITE_AMPLIFICATION_METRICS_KEY,
  SCALE_UP_DISK_IOPS_KEY,
  THROTTLE_COMPACTION_BACKGROUND_IO_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // Investigation toggles are deliberately neutral — they never mutate
  // health/revenue/cost, so they must never count as a beneficial or
  // harmful configuration change either. They exist purely to drive the
  // authored diagnosisPath value in rules.ts.
  { controlKey: INSPECT_DISK_IOPS_METRICS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_WRITE_AMPLIFICATION_METRICS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_COMPACTION_CONFIG_HISTORY_KEY, valueEquals: true, outcome: "neutral" },

  {
    controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { trafficBumpActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix: restore the compaction level-size multiplier",
      explanation:
        "The multiplier was lowered from 8 to 2 roughly three weeks before this incident, which raised write amplification without producing any immediate symptom. That excess amplification is what finally exhausted disk IOPS headroom once traffic returned to its normal weekly peak. Restoring the multiplier to 8 or higher addresses the actual cause rather than its downstream symptom.",
    },
  },
  {
    controlKey: SCALE_UP_DISK_IOPS_KEY,
    valueEquals: true,
    whenTriggerEquals: { trafficBumpActive: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: scaling up disk IOPS capacity",
      explanation:
        "Provisioning more IOPS genuinely raises the ceiling, so pressure drops at first — but write amplification itself is untouched, so the same misconfigured compaction keeps consuming a disproportionate share of the new, larger ceiling and the system re-saturates under sustained load, at real ongoing infrastructure cost.",
    },
  },
  {
    controlKey: THROTTLE_COMPACTION_BACKGROUND_IO_KEY,
    valueEquals: true,
    whenTriggerEquals: { trafficBumpActive: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but deferred: throttling compaction's background IO",
      explanation:
        "Throttling compaction reduces its IOPS draw right now, but unmerged SSTable files pile up instead — the backlog this defers keeps growing rather than disappearing, and read-path pressure grows with it.",
    },
  },
];
