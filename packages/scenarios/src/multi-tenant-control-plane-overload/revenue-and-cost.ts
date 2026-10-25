import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { WORKER_CONCURRENCY_KEY } from "./controls";

/**
 * Revenue loss is deliberately modest across almost every control-plane
 * state in this scenario, even the fully unmitigated one, because
 * dataPlaneSuccessRate -- the metric that actually drives customer
 * revenue -- stays at or near 100 through most of the incident. This is
 * intentional and mirrors the scenario's own thesis: a control-plane
 * emergency is real and must be fixed, but it is not, by itself, a
 * revenue-destroying customer outage. The states that genuinely cost
 * real revenue are exactly the ones where dataPlaneSuccessRate itself
 * drops -- the worker-scaling-trap-saturated and
 * unmitigated-churn-saturated states -- never merely "the control plane
 * looks bad."
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "unmitigated-churn": 20,
  "unmitigated-churn-saturated": 90,
  "unsafe-drain-before-quota": 60,
  "lane-only-no-quota": 20,
  "aggressive-batching-trap": 15,
  "worker-scaling-trap": 30,
  "worker-scaling-trap-saturated": 260,
  "quota-only-fix-draining": 20,
  "quota-only-fix-drained": 5,
  "optimal-fix-draining": 15,
  "optimal-fix-drained": 0,
  "strict-quota-fix-drained": 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 6_000,
  perUnitMonthlyUsd: {
    [`${WORKER_CONCURRENCY_KEY}:baseline`]: 0,
    [`${WORKER_CONCURRENCY_KEY}:scaled-up`]: 3_200,
  },
};

/**
 * Full recovery: the hot tenant's control-plane consumption is back at
 * or below the business's explicit 30% ceiling
 * (hotTenantControlPlaneShare <= 30), unrelated tenants are no longer
 * being starved (smallTenantConfigSuccessRate >= 95), the data plane
 * remains fully available (dataPlaneSuccessRate === 100), and no
 * metadata durability has been lost (metadataWriteLossCount === 0).
 * Deliberately independent of configConvergenceAgeSeconds -- the
 * business invariant explicitly allows convergence to slow temporarily,
 * so this condition never gates on it. A state can read
 * hotTenantControlPlaneShare at e.g. 70 with dataPlaneSuccessRate at 100
 * (the misleading-symptom trap) and still correctly fail this condition
 * on the fairness/ceiling fields, which is the entire point.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "hotTenantControlPlaneShare", operator: "less_than_or_equal", comparedTo: 30 },
    { key: "smallTenantConfigSuccessRate", operator: "greater_than_or_equal", comparedTo: 95 },
    { key: "dataPlaneSuccessRate", operator: "equals", comparedTo: 100 },
    { key: "metadataWriteLossCount", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable, looser tier: unrelated tenants are protected right now
 * (smallTenantConfigSuccessRate >= 90) and the data plane and metadata
 * durability remain intact, but the hot tenant's own control-plane
 * consumption has not necessarily been brought below the 30% ceiling —
 * e.g. the lane-only mitigation, which fixes the "one tenant must not
 * starve unrelated tenants" invariant right now without fixing the
 * "one tenant must not consume more than 30%" invariant. Genuinely
 * safer than doing nothing, genuinely not the full fix.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "smallTenantConfigSuccessRate", operator: "greater_than_or_equal", comparedTo: 90 },
    { key: "dataPlaneSuccessRate", operator: "equals", comparedTo: 100 },
    { key: "metadataWriteLossCount", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 30,
};

/**
 * Failure: a sustained run where metadata durability has genuinely been
 * compromised (writes are being dropped, not merely delayed) while the
 * hot tenant remains unthrottled — the worker-scaling trap's terminal
 * consequence if left running. This is the one outcome this scenario
 * treats as unrecoverable within the attempt: convergence delay and
 * even temporary data-plane degradation are bounded/recoverable, but
 * real, sustained metadata write loss combined with an unthrottled hot
 * tenant is not something draining the backlog or waiting it out can
 * fix.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "metadataWriteLossCount", operator: "greater_than_or_equal", comparedTo: 10 },
    { key: "hotTenantControlPlaneShare", operator: "greater_than", comparedTo: 30 },
  ],
  sustainedSeconds: 60,
};
