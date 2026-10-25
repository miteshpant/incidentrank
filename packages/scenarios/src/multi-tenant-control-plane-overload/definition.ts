import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import {
  BACKLOG_DRAIN_KEY,
  HOT_TENANT_QUOTA_KEY,
  METADATA_WRITE_BATCHING_KEY,
  QUEUE_PARTITIONING_KEY,
  WORKER_CONCURRENCY_KEY,
  controls,
} from "./controls";
import { initialValues } from "./metrics";
import { multiTenantControlPlaneOverloadRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  BACKLOG_DRAIN_KEY,
  HOT_TENANT_QUOTA_KEY,
  METADATA_WRITE_BATCHING_KEY,
  QUEUE_PARTITIONING_KEY,
  WORKER_CONCURRENCY_KEY,
};

const TICK_MS = 1_000;

export const multiTenantControlPlaneOverloadSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "controlPlaneStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage:
          "The control plane (scheduler, config service, metadata DB) has entered a critical state -- a tenant's unthrottled configuration churn is saturating shared capacity.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Control-plane health has returned to normal.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "schedulerQueueDepth",
      trackPeak: true,
      threshold: {
        value: 300,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "The scheduler queue has grown large enough to meaningfully delay configuration changes for every tenant, not only the hot one.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "The scheduler queue has drained back below the escalation threshold.",
      },
    },
    { key: "metadataDbWritePressure", trackPeak: true },
    { key: "configConvergenceAgeSeconds", trackPeak: true },
    { key: "metadataWriteLossCount", trackPeak: true },
  ],
  timedEvents,
  rules: multiTenantControlPlaneOverloadRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6dsupport.md section 10) ──────────────
  //
  // Reachable terminal/stable rule states while hotTenantChurning is
  // true, classified against successCondition
  // (hotTenantControlPlaneShare <= 30 AND smallTenantConfigSuccessRate
  // >= 95 AND dataPlaneSuccessRate === 100 AND metadataWriteLossCount
  // === 0) and acceptableCondition (smallTenantConfigSuccessRate >= 90
  // AND dataPlaneSuccessRate === 100 AND metadataWriteLossCount === 0):
  //
  //   optimal-fix-drained (quota capped-30%, dedicated lane, moderate
  //   batching, drain window elapsed)                                OPTIMAL
  //     -- hotTenantControlPlaneShare=28, smallTenantConfigSuccessRate=99.
  //     The full, structural, fair fix: the hot tenant's own
  //     consumption is bounded below the business ceiling AND unrelated
  //     tenants are protected AND the data plane/metadata durability
  //     are both intact.
  //   strict-quota-fix-drained (quota capped-10%, dedicated lane)      OPTIMAL
  //     -- hotTenantControlPlaneShare=10, smallTenantConfigSuccessRate=100.
  //     A stricter, equally structural variant of the same mechanism.
  //   quota-only-fix-drained (quota capped-30%, shared queue)       ACCEPTABLE
  //     -- hotTenantControlPlaneShare=29 (satisfies the 30% ceiling,
  //     so the ROOT CAUSE is fixed) but smallTenantConfigSuccessRate=90
  //     only just clears the acceptable bar (90) and misses the
  //     optimal bar (95) -- without a dedicated lane, unrelated tenants
  //     still queue behind the (now-bounded) hot tenant and recover
  //     fairness more slowly/less fully. Genuinely safe, genuinely not
  //     the fullest fix.
  //   optimal-fix-draining / quota-lane-moderate-batching-just-fixed  ACCEPTABLE
  //     -- the correct, full fix was just applied but the drain window
  //     has not yet elapsed (smallTenantConfigSuccessRate=91): real
  //     recovery lag, not instant healing. Correctly sits at
  //     acceptable, not optimal, until real elapsed time has passed.
  //   lane-only-no-quota (dedicated lane, quota left unthrottled)    ACCEPTABLE
  //     -- smallTenantConfigSuccessRate=97 (unrelated tenants ARE
  //     protected right now) but hotTenantControlPlaneShare=70, far
  //     above the 30% ceiling -- this state satisfies ONE business
  //     invariant ("one tenant must not starve unrelated tenants")
  //     while leaving a DIFFERENT one ("one tenant must not consume
  //     more than 30%") actively violated. Correctly excluded from
  //     successCondition (which gates on the share field directly) and
  //     correctly included in acceptableCondition (which does not).
  //   aggressive-batching-trap (quota capped-30%, batching large)    UNSAFE
  //     -- hotTenantControlPlaneShare=29 (root cause nominally fixed)
  //     but smallTenantConfigSuccessRate=88, BELOW the acceptable bar
  //     (90) -- the pressure transferred onto convergence delay (310s)
  //     is severe enough that it also drags fairness recovery back
  //     down below acceptable. A real, authored consequence of
  //     over-aggressive batching, not merely "slower but still safe."
  //   worker-scaling-trap / -saturated (quota unthrottled, workers
  //   scaled up)                                                      UNSAFE
  //     -- metadataWriteLossCount > 0 (a genuine, nonzero durability
  //     violation) excludes this from BOTH successCondition and
  //     acceptableCondition unconditionally, regardless of how healthy
  //     dataPlaneSuccessRate reads (100 in the early state, 88 once
  //     saturated). This is the trap: the dashboard a candidate checks
  //     first (data-plane health) looks fine or only mildly degraded
  //     while real metadata is being dropped underneath.
  //     worker-scaling-trap-saturated additionally satisfies
  //     failureCondition if sustained 60s, since the real cost here is
  //     unrecoverable within the attempt.
  //   unsafe-drain-before-quota (quota unthrottled, backlog "draining") UNSAFE
  //     -- hotTenantControlPlaneShare=76, smallTenantConfigSuccessRate=35.
  //     Draining the backlog without first capping the hot tenant never
  //     actually shrinks the queue (the hot tenant refills it as fast as
  //     it drains) -- this is the authored unsafe-sequencing state.
  //   unmitigated-churn / unmitigated-churn-saturated                 UNSAFE
  //     -- hotTenantControlPlaneShare=72-78, smallTenantConfigSuccessRate
  //     =18-41, while dataPlaneSuccessRate reads 97-100 -- the
  //     misleading-symptom trap this scenario is built around. Never
  //     satisfies either tier, no matter how healthy the data plane
  //     looks.
  //
  // There IS a genuine, operationally-distinct acceptable tier here
  // (lane-only protects fairness without fixing the ceiling; quota-only
  // fixes the ceiling without maximizing fairness; a just-landed full
  // fix is acceptable until the drain window elapses) -- unlike a
  // single-tier scenario, this is exactly the kind of legitimate,
  // partially-safe intermediate state phase6d.md's "Principal-Level
  // Acceptable States" anticipates (selected tenants throttled, reduced
  // fairness acceptable temporarily). acceptableCondition is therefore
  // present and genuinely used, not force-fit.
  //
  // Decision: candidate_declared (not automatic). Whether the fields
  // above happen to read safe at a given tick is necessary but not
  // sufficient proof the candidate understood WHICH business invariant
  // they satisfied and which (if any) they left unaddressed -- a
  // candidate who stumbles into lane-only reaches genuinely different
  // business guarantees than a candidate who capped the hot tenant, and
  // distinguishing "fairness is protected" from "the root cause is
  // fixed" is precisely the judgment candidate_declared plus Data
  // Integrity scoring exists to test. Automatic failure remains fully
  // automatic regardless of mode.
  //
  // Immediate-Finish audit (phase6dsupport.md section 11): at t=0,
  // before the hot tenant's churn begins, the scenario sits at
  // incidentState="healthy" with every field at its safe default --
  // this trivially satisfies successCondition, but incidentStartedAtMs
  // is still null (no timed event has fired), so Finish is moot and
  // evaluateCandidateDeclaredFinish returns declared_unstable regardless
  // (see the dedicated test). The moment hotTenantChurning fires at
  // T=30s, the state immediately becomes unmitigated-churn
  // (hotTenantControlPlaneShare=72, smallTenantConfigSuccessRate=41),
  // which satisfies neither successCondition nor acceptableCondition --
  // so a zero-action Finish issued any time after the incident starts
  // resolves to declared_unstable, matching the expected default. No
  // accidental instant-success path exists.
  completion: { mode: "candidate_declared", acceptableCondition },
};
