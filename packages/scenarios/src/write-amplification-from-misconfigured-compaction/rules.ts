import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  COMPACTION_LEVEL_MULTIPLIER_KEY,
  INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
  INSPECT_DISK_IOPS_METRICS_KEY,
  INSPECT_WRITE_AMPLIFICATION_METRICS_KEY,
  SCALE_UP_DISK_IOPS_KEY,
  THROTTLE_COMPACTION_BACKGROUND_IO_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "write-api": "healthy",
  "storage-engine": "healthy",
  "disk-iops": "healthy",
  "config-service": "healthy",
};

const saturatedHealth: Record<string, ComponentHealth> = {
  "write-api": "degraded",
  "storage-engine": "critical",
  "disk-iops": "critical",
  "config-service": "healthy",
};

const partiallyRelievedHealth: Record<string, ComponentHealth> = {
  "write-api": "degraded",
  "storage-engine": "degraded",
  "disk-iops": "degraded",
  "config-service": "healthy",
};

/**
 * Authored rule table for the write-amplification-from-misconfigured-
 * compaction incident, ordered most-specific-first per this codebase's
 * existing convention (see checkout-payment-inventory-redis-contention/
 * rules.ts for the pattern this mirrors).
 *
 * The distinct lesson this encodes: the root cause (compactionLevelSize
 * Multiplier lowered from 8 to 2) predates the incident by weeks and
 * produces no symptom on its own — writeAmplificationFactor sits only
 * slightly elevated the entire healthy period, never crossing any
 * threshold. It is the routine traffic bump (timed-events.ts) that
 * finally exhausts the IOPS headroom the misconfiguration had already
 * been quietly eating. A candidate who only looks at "what changed
 * recently" will find nothing — config-service itself never shows
 * degraded health, and configChangeAgeDays (surfaced only once the
 * candidate inspects compaction config history) is the one signal that
 * points backward in time rather than at the current symptom. This is
 * the scenario's distinguishing mechanic versus storage-iops-saturation
 * (direct, demand-driven IOPS exhaustion with no configuration root
 * cause at all): here, raising IOPS capacity alone (scaleUpDiskIops)
 * only buys headroom back temporarily, because the thing consuming it
 * disproportionately — write amplification — is never addressed.
 *
 * As in the reference incident, the engine matches rules against a
 * CURRENT snapshot of triggers/controlValues every tick — there is no
 * "control X was set before control Y" primitive — so `diagnosisPath`
 * captures WHAT the candidate correlated (inspected disk IOPS, write
 * amplification, AND compaction config history) by the time they
 * applied the fix, not strict temporal ordering.
 */
export const writeAmplificationRules: Rule[] = [
  // ── Best path: investigated all three signal sources AND restored the
  // compaction level multiplier to a sane value (>= 8).
  {
    id: "correlated-then-fixed",
    when: {
      triggerEquals: { trafficBumpActive: true },
      controlEquals: {
        [INSPECT_DISK_IOPS_METRICS_KEY]: true,
        [INSPECT_WRITE_AMPLIFICATION_METRICS_KEY]: true,
        [INSPECT_COMPACTION_CONFIG_HISTORY_KEY]: true,
      },
      controlAtLeast: { [COMPACTION_LEVEL_MULTIPLIER_KEY]: 8 },
    },
    incidentState: "recovering",
    values: {
      writeLatencyP99Ms: 14,
      writeErrorRate: 0.05,
      writeAmplificationFactor: 3.2,
      compactionBacklogSstables: 44,
      diskIopsUtilizationPercent: 40,
      diskQueueDepth: 4,
      cpuUtilizationPercent: 23,
      configChangeAgeDays: 21,
      monitoringDashboardRefreshLagSeconds: 3,
      diagnosisPath: "correlated-then-fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Correct fix, applied without investigating the correlation first
  // (e.g. raised the multiplier on a guess). The incident still resolves
  // — the fix is the fix — but the candidate never demonstrated they
  // understood WHY, which is exactly what investigation-quality scoring
  // penalizes.
  {
    id: "guessed-fix",
    when: {
      triggerEquals: { trafficBumpActive: true },
      controlAtLeast: { [COMPACTION_LEVEL_MULTIPLIER_KEY]: 8 },
    },
    incidentState: "recovering",
    values: {
      writeLatencyP99Ms: 14,
      writeErrorRate: 0.05,
      writeAmplificationFactor: 3.2,
      compactionBacklogSstables: 44,
      diskIopsUtilizationPercent: 40,
      diskQueueDepth: 4,
      cpuUtilizationPercent: 23,
      configChangeAgeDays: 21,
      monitoringDashboardRefreshLagSeconds: 3,
      diagnosisPath: "guessed-fix",
    },
    componentHealth: healthyHealth,
  },

  // ── Inferior path A: scaled up disk IOPS capacity instead of fixing
  // compaction. This genuinely raises the ceiling, so it looks like it
  // worked at first — but write amplification is untouched, so the same
  // multiplier keeps consuming a disproportionate share of the new,
  // larger ceiling and the system re-saturates under sustained load.
  {
    id: "scaled-iops-only",
    when: {
      triggerEquals: { trafficBumpActive: true },
      controlEquals: { [SCALE_UP_DISK_IOPS_KEY]: true },
      controlAtMost: { [COMPACTION_LEVEL_MULTIPLIER_KEY]: 4 },
    },
    incidentState: "degraded",
    values: {
      writeLatencyP99Ms: 210,
      writeErrorRate: 1.8,
      writeAmplificationFactor: 9.4,
      compactionBacklogSstables: 260,
      diskIopsUtilizationPercent: 88,
      diskQueueDepth: 22,
      cpuUtilizationPercent: 61,
      configChangeAgeDays: 21,
      monitoringDashboardRefreshLagSeconds: 4,
      diagnosisPath: "scaled-iops-only",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Inferior path B: throttled compaction's background IO instead of
  // fixing the multiplier. IOPS pressure drops right now, but unmerged
  // SSTables pile up (compactionBacklogSstables keeps climbing) — this
  // defers the problem rather than resolving it, and read-path pressure
  // (not modeled numerically here beyond the backlog) grows unbounded.
  {
    id: "throttled-compaction-only",
    when: {
      triggerEquals: { trafficBumpActive: true },
      controlEquals: { [THROTTLE_COMPACTION_BACKGROUND_IO_KEY]: true },
      controlAtMost: { [COMPACTION_LEVEL_MULTIPLIER_KEY]: 4 },
    },
    incidentState: "degraded",
    values: {
      writeLatencyP99Ms: 95,
      writeErrorRate: 0.6,
      writeAmplificationFactor: 9.6,
      compactionBacklogSstables: 540,
      diskIopsUtilizationPercent: 72,
      diskQueueDepth: 14,
      cpuUtilizationPercent: 48,
      configChangeAgeDays: 21,
      monitoringDashboardRefreshLagSeconds: 4,
      diagnosisPath: "throttled-compaction-only",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Partial relief: multiplier raised, but not enough (4 vs. the 8
  // actually required to bring write amplification back under control
  // at this traffic level).
  {
    id: "partial-multiplier-increase",
    when: {
      triggerEquals: { trafficBumpActive: true },
      controlEquals: { [COMPACTION_LEVEL_MULTIPLIER_KEY]: 4 },
    },
    incidentState: "degraded",
    values: {
      writeLatencyP99Ms: 70,
      writeErrorRate: 0.4,
      writeAmplificationFactor: 5.8,
      compactionBacklogSstables: 160,
      diskIopsUtilizationPercent: 64,
      diskQueueDepth: 11,
      cpuUtilizationPercent: 40,
      configChangeAgeDays: 21,
      monitoringDashboardRefreshLagSeconds: 3,
      diagnosisPath: "partial-multiplier-increase",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Baseline critical: traffic bump active, multiplier still at the
  // misconfigured value (2), no mitigation applied yet. Config-service
  // stays healthy throughout — the misleading "nothing changed just now"
  // signal the candidate must see past; the real change happened weeks
  // earlier and only configChangeAgeDays (surfaced by inspecting
  // compaction config history) points at it.
  {
    id: "saturation-baseline",
    when: { triggerEquals: { trafficBumpActive: true } },
    incidentState: "saturated",
    values: {
      writeLatencyP99Ms: 340,
      writeErrorRate: 3.2,
      writeAmplificationFactor: 11.2,
      compactionBacklogSstables: 620,
      diskIopsUtilizationPercent: 97,
      diskQueueDepth: 38,
      cpuUtilizationPercent: 74,
      configChangeAgeDays: 21,
      monitoringDashboardRefreshLagSeconds: 5,
      diagnosisPath: "not-attempted",
    },
    componentHealth: saturatedHealth,
  },

  // ── Default/fallback: before the traffic bump. The misconfiguration
  // is already live (compactionLevelSizeMultiplier defaults to 2 in
  // controls.ts) but produces no visible symptom yet — writeAmplification
  // Factor is only mildly elevated versus a well-tuned baseline (~1.5),
  // never enough to cross any threshold on its own.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      writeLatencyP99Ms: 12,
      writeErrorRate: 0.05,
      writeAmplificationFactor: 3.1,
      compactionBacklogSstables: 40,
      diskIopsUtilizationPercent: 38,
      diskQueueDepth: 4,
      cpuUtilizationPercent: 22,
      configChangeAgeDays: 21,
      monitoringDashboardRefreshLagSeconds: 1,
      diagnosisPath: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];
