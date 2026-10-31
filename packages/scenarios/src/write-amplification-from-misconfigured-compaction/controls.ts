import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation controls (non-destructive) ───────────────────────────
// Each is a toggle a candidate flips to signal "I looked here." None of
// these change component health, revenue loss, or cost — they only
// advance investigation state keys the rule table reads to determine the
// authored `diagnosisPath` value (see rules.ts), mirroring the reference
// incident's investigation-control pattern exactly.
export const INSPECT_DISK_IOPS_METRICS_KEY = "inspectDiskIopsMetrics";
export const INSPECT_WRITE_AMPLIFICATION_METRICS_KEY = "inspectWriteAmplificationMetrics";
export const INSPECT_COMPACTION_CONFIG_HISTORY_KEY = "inspectCompactionConfigHistory";

// ── Remediation controls (state-mutating) ──────────────────────────────

/**
 * The actual root cause: a compaction level size multiplier changed
 * weeks before this incident (see timed-events.ts's backstory framing).
 * A low multiplier forces far more, far-smaller compaction rounds per
 * byte of real data written — i.e. write amplification — which silently
 * eats IOPS headroom long before any traffic bump makes it visible.
 * Restoring it to a sane value (8 or higher) is the only control that
 * addresses the cause rather than the symptom.
 */
export const COMPACTION_LEVEL_MULTIPLIER_KEY = "compactionLevelSizeMultiplier";

/**
 * Plausible-but-inferior path: provisioning more disk IOPS treats this
 * as a capacity problem. It genuinely raises the ceiling the storage
 * engine can draw from — so it does relieve pressure and even looks like
 * it "worked" at low traffic — but it does nothing about the write
 * amplification itself, so the same misconfiguration re-saturates the
 * new, larger ceiling once traffic climbs again, at real ongoing cost.
 */
export const SCALE_UP_DISK_IOPS_KEY = "scaleUpDiskIops";

/**
 * Another plausible-but-inferior path: throttling how aggressively
 * compaction runs in the background. This reduces compaction's own IOPS
 * draw right now, but it does so by letting unmerged SSTable files pile
 * up — read amplification climbs instead, and the backlog it defers
 * keeps growing, so it is a deferral, not a fix.
 */
export const THROTTLE_COMPACTION_BACKGROUND_IO_KEY = "throttleCompactionBackgroundIo";

export const controls: ControlDefinition[] = [
  { key: INSPECT_DISK_IOPS_METRICS_KEY, allowedValues: [false, true], initialValue: false },
  {
    key: INSPECT_WRITE_AMPLIFICATION_METRICS_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  { key: COMPACTION_LEVEL_MULTIPLIER_KEY, allowedValues: [2, 4, 8, 10], initialValue: 2 },
  { key: SCALE_UP_DISK_IOPS_KEY, allowedValues: [false, true], initialValue: false },
  { key: THROTTLE_COMPACTION_BACKGROUND_IO_KEY, allowedValues: [false, true], initialValue: false },
];
