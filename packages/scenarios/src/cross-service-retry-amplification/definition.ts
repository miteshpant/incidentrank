import type {
  NumericWatchFieldConfig,
  ScenarioSimulationDefinition,
  SeverityFieldConfig,
} from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { crossServiceRetryAmplificationRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  GATEWAY_RETRIES_KEY,
  SERVICE_A_RETRIES_KEY,
  SERVICE_B_RETRIES_KEY,
  SERVICE_C_RETRIES_KEY,
  SERVICE_C_TIMEOUT_SECONDS_KEY,
  CIRCUIT_BREAKER_KEY,
  CANCELLATION_PROPAGATION_KEY,
  SERVICE_C_CONCURRENCY_KEY,
} from "./controls";

const TICK_MS = 1_000;

const severityFields: SeverityFieldConfig[] = [
  {
    key: "chainHealthStatus",
    announceCritical: {
      enteringType: "SEVERITY_CRITICAL",
      enteringMessage: "Retry amplification has pushed the chain into a critical state.",
      recoveringType: "SEVERITY_RECOVERED",
      recoveringMessage: "Retry amplification has recovered.",
    },
  },
];

const numericWatchFields: NumericWatchFieldConfig[] = [
  {
    key: "effectiveAmplificationFactor",
    trackPeak: true,
    threshold: {
      value: 10,
      enteringType: "THRESHOLD_CROSSED",
      enteringMessage: "Effective request amplification has crossed 10x original customer volume.",
      recoveringType: "THRESHOLD_RECOVERED",
      recoveringMessage: "Effective request amplification has dropped back below 10x.",
    },
  },
  {
    key: "inFlightRequests",
    trackPeak: true,
  },
  {
    key: "zombieRequestCount",
    trackPeak: true,
  },
];

export const crossServiceRetryAmplificationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields,
  numericWatchFields,
  timedEvents,
  rules: crossServiceRetryAmplificationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6dsupport.md section 10) ────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (retryOwnershipMode / hardeningMode /
  // effectiveAmplificationFactor / zombieRequestCount /
  // customerSuccessRate):
  //
  //   baseline-critical                UNSAFE  unowned / n/a                / 81  / high / ~55
  //   amplification-worsened           UNSAFE  unowned / n/a                / 256 / high / ~40
  //   second-wave-critical              UNSAFE  unowned / n/a                / 81  / high / ~47
  //   timeout-tuned-no-ownership        UNSAFE  unowned / n/a                / ~89 / high / ~51
  //   single-layer-relief-incomplete    UNSAFE  partial-*-only / n/a         / 27  / high / ~69
  //   two-layer-relief-incomplete       UNSAFE  partial-gw-and-a / n/a       / 9   / mod  / ~94
  //   owned-at-service-c-no-breaker    ACCEPTABLE owned-service-c / partial  / 3   / mod  / ~99
  //   owned-zombie-work-persists       ACCEPTABLE owned-service-c / partial  / 3   / mod  / ~99
  //   owned-backlog-draining           ACCEPTABLE* owned-service-c / full    / 3   / elevated (draining) / ~99
  //   owned-fully-safe                  OPTIMAL owned-service-c / full       / 3   / <=20 / >=95
  //
  // single-layer-relief-incomplete and two-layer-relief-incomplete are
  // deliberately classified UNSAFE, not acceptable, even though both
  // are real, visible improvements over the unmitigated baseline
  // (amplification 27 and 9 respectively, versus 81): both remain
  // above the bounded-safe ceiling this scenario authors
  // (effectiveAmplificationFactor <= 3), the provider is still
  // receiving multiplicatively amplified volume from at least one
  // still-active upstream layer, and in-flight/zombie pressure remains
  // elevated. This is the scenario's required pressure-transfer trap
  // (phase6dsupport.md section 13) — relief at fewer than all three
  // upstream layers is incomplete, not a deliberate bounded tradeoff,
  // so neither state may ever satisfy acceptableCondition however much
  // better either looks than doing nothing.
  //
  // "owned-at-service-c-no-breaker" and "owned-zombie-work-persists"
  // ARE genuine deliberate safe-but-imperfect handback states: the
  // dominant mechanism (retry ownership consolidated to exactly one
  // layer, amplification bounded at the provider) is fully solved in
  // both — the remaining gap is a secondary safeguard (breaker or
  // cancellation propagation) the candidate has not yet applied, each
  // independently bounded and non-escalating rather than an ongoing
  // correctness violation or unbounded amplification. "owned-
  // backlog-draining" (marked ACCEPTABLE* above) is reachable but
  // never actually NEEDS acceptableCondition to cover it in practice:
  // acceptableCondition's own conditions (ownership + bounded
  // amplification) are already satisfied the instant ownership
  // consolidates, including during the backlog-drain window — the
  // recovery-lag mechanism (phase6dsupport.md section 14) delays only
  // successCondition's zombie/success-rate bar, which the still-
  // draining backlog has not yet met. This is exactly the kind of "one
  // correct structural decision made, refinement/drain still pending"
  // state acceptableCondition exists to recognize — unlike
  // single-layer-relief-incomplete/two-layer-relief-incomplete, where
  // the DOMINANT mechanism itself (ownership) remains unresolved.
  //
  // Because there is a genuine, deliberate, judgment-dependent
  // distinction between "ownership consolidated, hardening/drain still
  // incomplete" (acceptable) and "ownership consolidated, fully
  // hardened and drained" (optimal) — and because a Finish decision
  // here requires judging whether the remaining zombie-work/
  // unprotected-breaker/still-draining-backlog gap is "safe enough to
  // hand back" rather than evaluating an objective, unambiguous
  // recovery bar — this scenario is `candidate_declared`, not
  // `automatic`. The judgment is NOT "did you try enough controls"
  // (every single-layer/two-layer/multi-layer/timeout-first path is a
  // real, observably-different state); it is "do you recognize retry
  // ownership, not retry value, as the dominant fix, and do you
  // recognize when a bounded secondary gap or still-draining backlog
  // is an acceptable handback versus a lingering dominant-mechanism
  // failure."
  completion: { mode: "candidate_declared", acceptableCondition },
};
