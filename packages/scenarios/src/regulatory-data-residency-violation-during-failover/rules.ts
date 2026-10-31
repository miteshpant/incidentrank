import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
  FAIL_BACK_TO_EU_KEY,
  FILE_BREACH_NOTIFICATION_KEY,
  INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY,
  INSPECT_FAILOVER_ROUTING_LOGS_KEY,
  INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY,
  STAY_FAILED_OVER_KEY,
  VERIFY_EU_REGION_RECOVERED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "global-traffic-manager": "healthy",
  "eu-region": "healthy",
  "us-failover-region": "healthy",
  "compliance-gateway": "healthy",
};

// EU region is down, traffic correctly failed over to US — availability
// is fine, but every EU request is now a residency violation.
const silentlyViolatingHealth: Record<string, ComponentHealth> = {
  "global-traffic-manager": "healthy",
  "eu-region": "critical",
  "us-failover-region": "healthy",
  "compliance-gateway": "degraded",
};

// Failed back (or enabled the data-lock gateway) before the EU region
// was actually healthy — the outage reopens for EU customers.
const reopenedOutageHealth: Record<string, ComponentHealth> = {
  "global-traffic-manager": "degraded",
  "eu-region": "critical",
  "us-failover-region": "healthy",
  "compliance-gateway": "critical",
};

// EU region has genuinely recovered; traffic correctly routed back
// through the residency-enforcing gateway.
const resolvedHealthyHealth: Record<string, ComponentHealth> = healthyHealth;

const EU_REGION_INFRASTRUCTURE_RECOVERS_MS = 180_000;

/**
 * Authored rule table for the Regulatory Data-Residency Violation During
 * Cross-Region Failover incident. The Global Traffic Manager's automatic
 * failover policy is designed purely for availability: when eu-west-1
 * degrades, it silently shifts EU customer traffic to us-east-1. From an
 * availability dashboard's perspective this is a complete success —
 * `euRequestAvailabilityPercent` and `euRequestLatencyMs` both look
 * perfectly healthy the instant the automatic failover completes. The
 * real problem the dashboards never show: EU personal data is now being
 * processed and stored in a US region, which is a GDPR data-residency
 * violation that accrues for every minute it continues
 * (`dataResidencyViolationMinutes`, `euPersonalDataRecordsProcessedInUsCount`).
 *
 * Branching structure (per this scenario's "branching" assignment): this
 * is a genuinely new principal-tier tradeoff axis — compliance/legal risk
 * vs. availability — with no clean answer, distinct from every other
 * Security & Identity scenario in this catalog (which are availability-
 * only or auth-only). The candidate must make an explicit, irreversible-
 * feeling decision under real uncertainty about how long EU's own
 * infrastructure will take to recover:
 *
 *   - "failed-back-early": force traffic back onto eu-west-1
 *     immediately, before it has actually recovered
 *     (`euRegionInfraRecovered` not yet true). Stops the data-residency
 *     violation from accruing further right away, but reopens the exact
 *     availability outage the automatic failover was protecting against
 *     — EU customers go back to being down. A genuine trade, not a
 *     mistake: the candidate consciously accepted an availability hit to
 *     stop a compliance violation sooner.
 *   - "stayed-failed-over": explicitly chose to stay on the US failover
 *     region rather than act. Availability stays perfect throughout, but
 *     the violation keeps accruing for the entire remainder of the
 *     incident — the plausible-but-inferior path for a candidate who
 *     reads "all green" on the availability dashboard and stops there.
 *   - "gateway-enabled-early": enabled the EU data-lock gateway before
 *     actually verifying/waiting for eu-west-1's own recovery. This is
 *     the scenario's second trap — it looks like the principled right
 *     answer (route EU traffic back through a residency-enforcing
 *     gateway) but produces the exact same reopened-outage consequence
 *     as failing back early, because the underlying EU region still
 *     isn't healthy.
 *   - "failed-back-after-recovery": the full, best-case path — waited
 *     for eu-west-1's own infrastructure to actually recover
 *     (`euRegionInfraRecovered` true), verified that recovery, then
 *     enabled the EU data-lock gateway. Stops the violation AND never
 *     reopens the outage, because the region genuinely was ready. This
 *     is only reachable once real recovery has happened — a candidate
 *     who waits too long before investigating will have let the
 *     violation accrue for longer in exchange for a cleaner resolution;
 *     the decision of WHEN to act is itself the principal-tier lesson,
 *     not merely which button to press.
 *
 * `investigationQuality` captures whether the candidate correlated the
 * failover routing logs, the data-residency audit trail, and the legal
 * notification requirements before committing to a strategy — read
 * generically by scoring.ts via the existing finalStringEquals measure,
 * exactly like the reference incident and every other scenario in this
 * catalog. `remediationStrategy` is the finer-grained per-branch identity
 * field used for narrative/golden-path identification; dataIntegrity
 * scoring reads `investigationQuality`, not `remediationStrategy`,
 * because — like API Version Sunset's two equally-valid strategies —
 * this scenario's lesson is about making the tradeoff decision
 * deliberately and with full information, not about one timing being
 * objectively superior to another once the EU region has genuinely
 * recovered.
 *
 * Note: the engine matches rules against a CURRENT snapshot of
 * triggers/controlValues every tick — these fields capture WHAT the
 * candidate had set by the time a given tick is evaluated, not strict
 * temporal ordering, exactly like every other scenario's rule table in
 * this codebase.
 */
export const dataResidencyRules: Rule[] = [
  // ── Best path: waited for eu-west-1's genuine recovery, verified it,
  // then enabled the residency-enforcing gateway, having correlated all
  // three investigation signals first. Violation stops, outage never
  // reopens.
  {
    id: "investigated-failed-back-after-recovery",
    when: {
      triggerEquals: { euRegionInfraRecovered: true },
      controlEquals: {
        [INSPECT_FAILOVER_ROUTING_LOGS_KEY]: true,
        [INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY]: true,
        [INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY]: true,
        [VERIFY_EU_REGION_RECOVERED_KEY]: true,
        [ENABLE_EU_DATA_LOCK_GATEWAY_KEY]: true,
      },
    },
    incidentState: "recovering",
    values: {
      euRequestAvailabilityPercent: 99.9,
      euRequestLatencyMs: 95,
      euPersonalDataRecordsProcessedInUsCount: 0,
      dataResidencyViolationMinutes: 0,
      usRegionCpuPercent: 24,
      euRegionCpuPercent: 26,
      supportEscalationCount: 1,
      diagnosisPath: "investigated-failed-back-after-recovery",
      remediationStrategy: "failed-back-after-recovery",
      investigationQuality: "correlated",
    },
    componentHealth: resolvedHealthyHealth,
  },

  // ── Correct strategy applied WITHOUT the full investigation first
  // (guessed/rushed the right timing but never actually correlated the
  // routing logs + audit trail + legal requirements before acting).
  // Still reaches the clean resolution, but investigation-quality
  // scoring reflects it.
  {
    id: "guessed-failed-back-after-recovery",
    when: {
      triggerEquals: { euRegionInfraRecovered: true },
      controlEquals: {
        [VERIFY_EU_REGION_RECOVERED_KEY]: true,
        [ENABLE_EU_DATA_LOCK_GATEWAY_KEY]: true,
      },
    },
    incidentState: "recovering",
    values: {
      euRequestAvailabilityPercent: 99.9,
      euRequestLatencyMs: 95,
      euPersonalDataRecordsProcessedInUsCount: 0,
      dataResidencyViolationMinutes: 0,
      usRegionCpuPercent: 24,
      euRegionCpuPercent: 26,
      supportEscalationCount: 1,
      diagnosisPath: "guessed-failed-back-after-recovery",
      remediationStrategy: "failed-back-after-recovery",
      investigationQuality: "guessed",
    },
    componentHealth: resolvedHealthyHealth,
  },

  // ── Trap A: enabled the data-lock gateway (or forced a fail-back)
  // before eu-west-1 had genuinely recovered. Looks like the principled
  // right answer but reopens the exact outage the automatic failover was
  // protecting against, because the underlying region still isn't
  // healthy. Matched whenever either "return to EU" control is set while
  // `euRegionInfraRecovered` is not yet true.
  {
    id: "gateway-enabled-early",
    when: {
      triggerEquals: { autoFailedOverToUs: true },
      controlEquals: { [ENABLE_EU_DATA_LOCK_GATEWAY_KEY]: true },
    },
    incidentState: "degraded",
    values: {
      euRequestAvailabilityPercent: 72,
      euRequestLatencyMs: 2_800,
      euPersonalDataRecordsProcessedInUsCount: 0,
      dataResidencyViolationMinutes: 0,
      usRegionCpuPercent: 22,
      euRegionCpuPercent: 91,
      supportEscalationCount: 38,
      diagnosisPath: "gateway-enabled-early",
      remediationStrategy: "gateway-enabled-early",
      investigationQuality: "inferior",
    },
    componentHealth: reopenedOutageHealth,
  },
  {
    id: "failed-back-early",
    when: {
      triggerEquals: { autoFailedOverToUs: true },
      controlEquals: { [FAIL_BACK_TO_EU_KEY]: true },
    },
    incidentState: "degraded",
    values: {
      euRequestAvailabilityPercent: 68,
      euRequestLatencyMs: 3_100,
      euPersonalDataRecordsProcessedInUsCount: 0,
      dataResidencyViolationMinutes: 0,
      usRegionCpuPercent: 22,
      euRegionCpuPercent: 94,
      supportEscalationCount: 42,
      diagnosisPath: "failed-back-early",
      remediationStrategy: "failed-back-early",
      investigationQuality: "inferior",
    },
    componentHealth: reopenedOutageHealth,
  },

  // ── Trap B / inferior path: explicitly chose to stay on the US
  // failover region rather than act at all. Availability stays perfect
  // — this is exactly the "all green" signal that tempts a candidate to
  // stop looking — but the data-residency violation keeps accruing for
  // the entire remainder of the incident.
  {
    id: "stayed-failed-over",
    when: {
      triggerEquals: { autoFailedOverToUs: true },
      controlEquals: { [STAY_FAILED_OVER_KEY]: true },
    },
    incidentState: "degraded",
    values: {
      euRequestAvailabilityPercent: 99.9,
      euRequestLatencyMs: 95,
      euPersonalDataRecordsProcessedInUsCount: 48_000,
      dataResidencyViolationMinutes: 45,
      usRegionCpuPercent: 26,
      euRegionCpuPercent: 8,
      supportEscalationCount: 3,
      diagnosisPath: "stayed-failed-over",
      remediationStrategy: "stayed-failed-over",
      investigationQuality: "inferior",
    },
    componentHealth: silentlyViolatingHealth,
  },

  // ── Baseline critical: automatic failover has completed, no decision
  // made yet. euRequestAvailabilityPercent/euRequestLatencyMs are
  // deliberately pinned at healthy-looking values throughout — the
  // misleading "everything is fine" signal the candidate must notice is
  // NOT actually fine.
  {
    id: "auto-failed-over-baseline",
    when: { triggerEquals: { autoFailedOverToUs: true } },
    incidentState: "violating",
    values: {
      euRequestAvailabilityPercent: 99.9,
      euRequestLatencyMs: 95,
      euPersonalDataRecordsProcessedInUsCount: 32_000,
      dataResidencyViolationMinutes: 30,
      usRegionCpuPercent: 26,
      euRegionCpuPercent: 8,
      supportEscalationCount: 2,
      diagnosisPath: "not-attempted",
      remediationStrategy: "not-attempted",
      investigationQuality: "not-attempted",
    },
    componentHealth: silentlyViolatingHealth,
  },

  // ── EU region is down, failover has not yet completed — the brief
  // window where EU availability is genuinely degraded before the
  // automatic policy kicks in.
  {
    id: "eu-outage-before-failover",
    when: { triggerEquals: { euRegionOutage: true } },
    incidentState: "degraded",
    values: {
      euRequestAvailabilityPercent: 64,
      euRequestLatencyMs: 3_400,
      euPersonalDataRecordsProcessedInUsCount: 0,
      dataResidencyViolationMinutes: 0,
      usRegionCpuPercent: 22,
      euRegionCpuPercent: 97,
      supportEscalationCount: 6,
      diagnosisPath: "not-attempted",
      remediationStrategy: "not-attempted",
      investigationQuality: "not-attempted",
    },
    componentHealth: {
      "global-traffic-manager": "degraded",
      "eu-region": "critical",
      "us-failover-region": "healthy",
      "compliance-gateway": "healthy",
    },
  },

  // ── Default/fallback: before the EU region outage begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      euRequestAvailabilityPercent: 99.9,
      euRequestLatencyMs: 90,
      euPersonalDataRecordsProcessedInUsCount: 0,
      dataResidencyViolationMinutes: 0,
      usRegionCpuPercent: 22,
      euRegionCpuPercent: 24,
      supportEscalationCount: 0,
      diagnosisPath: "not-attempted",
      remediationStrategy: "not-attempted",
      investigationQuality: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];

// Re-exported for use by action-classifications.ts and tests that need
// the exact timestamp real EU infrastructure recovery is scheduled for.
export { EU_REGION_INFRASTRUCTURE_RECOVERS_MS };

// Breach-notification filing is tracked independently of which
// availability strategy was chosen — see FILE_BREACH_NOTIFICATION_KEY's
// doc comment in controls.ts. Referenced here only to keep the import
// used; the actual notification bookkeeping lives in
// action-classifications.ts, which scores it as its own beneficial/
// harmful action rather than a rules.ts branch (filing the notification
// never changes component health, availability, or the violation
// counters — it is a compliance action, not a remediation action).
export const FILE_BREACH_NOTIFICATION_CONTROL_KEY = FILE_BREACH_NOTIFICATION_KEY;
