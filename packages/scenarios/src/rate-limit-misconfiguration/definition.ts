import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { rateLimitMisconfigurationRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  RATE_LIMIT_POLICY_KEY,
  BURST_SIZE_KEY,
  PER_TENANT_QUOTA_KEY,
  GLOBAL_QUOTA_KEY,
  PRIORITY_CLASS_KEY,
  EMERGENCY_BYPASS_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const rateLimitMisconfigurationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "limiterHealth",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The rate-limit misconfiguration has reached a critical state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The rate-limit misconfiguration has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "bursterShareOfCapacity",
      trackPeak: true,
      threshold: {
        value: 50,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "The top tenant's share of shared capacity has crossed 50%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "The top tenant's share of shared capacity has dropped back below 50%.",
      },
    },
    {
      key: "legitimateTenantSuccessRate",
      trackPeak: false,
    },
    {
      key: "backendUtilization",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: rateLimitMisconfigurationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ───────────────────
  //
  // Reachable terminal/stable rule states, classified against
  // successCondition / acceptableCondition's real authored values:
  //
  //   policy-misconfigured (baseline)        UNSAFE   legit=64, burster=58
  //   domination-deepening (2nd wave, none)   UNSAFE   legit=48, burster=79
  //   bypass-unprotected (correctness trap)  UNSAFE   rateLimitStatus=
  //                                           "unprotected" — gated out
  //                                           regardless of legit=100/
  //                                           rejectionRate=0 looking
  //                                           perfect.
  //   rolled-back-burst-open (harmful)        UNSAFE   legit=98, burster=55
  //                                           (burster exceeds even the
  //                                           acceptable 40 ceiling)
  //   global-quota-raised-alone (harmful)     UNSAFE   legit=71, burster=64
  //   quota-raised-burst-open (partial)       UNSAFE   legit=94 (just
  //                                           under the 95 bar), burster=51
  //   burst-tightened-quota-tight (partial)   UNSAFE   legit=62, burster=16
  //   priority-favored-steady (alternate)     ACCEPTABLE  legit=97,
  //                                           burster=34 — protected,
  //                                           legitimate traffic healthy,
  //                                           but the burster's ceiling
  //                                           is genuinely uncapped, a
  //                                           deliberate, bounded, real
  //                                           tradeoff.
  //   retuned-fair (durable fix)              OPTIMAL  legit=99, burster=11
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // priority-favored-steady state. "Do customer-facing success metrics
  // look healthy" is not, by itself, proof the system is safe to hand
  // back — bypass-unprotected proves exactly that trap. The candidate
  // must judge whether legitimate recovery came from genuinely capping
  // the dominant tenant's consumption (optimal), from a real-but-
  // incomplete fairness improvement (acceptable), or from simply
  // removing the limiter altogether while looking calm (unsafe) — the
  // "is this state safe enough to hand back" judgment candidate_declared
  // exists to test.
  //
  // Immediate-Finish audit: at t=0 (before the incident's
  // policyEffectsVisible trigger ever fires), the engine is still on
  // the "healthy" default rule — rateLimitStatus="protected",
  // legitimateTenantSuccessRate=99, bursterShareOfCapacity=8 — which
  // numerically already satisfies successCondition's thresholds. This
  // is pre-incident baseline, not a reachable in-incident state (see
  // test "immediate zero-action Finish before the incident starts is
  // not a meaningful resolution"): state.incidentStartedAtMs stays
  // null, so evaluateCandidateDeclaredFinish is never a meaningful
  // "the candidate solved the incident" result in production (the
  // Finish UI and scoring are only ever exercised once an incident has
  // started). Once the incident actually starts (policyEffectsVisible),
  // the newly-deployed-baseline rule immediately drives
  // legitimateTenantSuccessRate to 64 and bursterShareOfCapacity to 58
  // — both well outside successCondition's/acceptableCondition's bars —
  // so an immediate zero-action Finish taken at or after incident start
  // is correctly declared_unstable. sustainedSeconds=20 (successCondition
  // and acceptableCondition both) additionally requires the recovered
  // state to hold continuously for 20 real seconds before Finish is
  // ever eligible, chosen against this scenario's own ~30s-to-first-
  // trigger / 3-minute second-wave timing scale — not an arbitrary
  // long wait, and not the hidden second-wave timer itself.
  completion: { mode: "candidate_declared", acceptableCondition },
};
