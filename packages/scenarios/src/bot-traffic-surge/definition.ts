import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { botTrafficSurgeRules } from "./rules";
import { failureCondition, infrastructureCost, revenueLossRatePerMinute, successCondition } from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CHALLENGE_POLICY_KEY,
  RATE_LIMIT_TIER_KEY,
  TRAFFIC_SAMPLING_ENABLED_KEY,
  ENDPOINT_PROTECTION_SCOPE_KEY,
  TENANT_QUOTA_ENFORCEMENT_KEY,
  CACHE_AGGRESSIVENESS_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const botTrafficSurgeSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "trafficStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Backend load has entered a critical state under automated traffic pressure.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Backend load has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "backendLoadPct",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Backend load has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Backend load has dropped back below 90%.",
      },
    },
    {
      key: "falsePositiveRatePct",
      trackPeak: true,
    },
    {
      key: "suspiciousTrafficRatioPct",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: botTrafficSurgeRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md sections 8-10) ───────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   bot-surge-rising (baseline)                  UNSAFE  backendLoad=78,
  //                                                 critical, defenseMode=
  //                                                 unresolved
  //   bot-surge-escalated (second wave, no action)  UNSAFE  backendLoad=96,
  //                                                 critical
  //   coarse-blocked-high-collateral (both coarse   UNSAFE  backendLoad=19
  //   levers stacked, harmful)                      (looks great!), but
  //                                                 falsePositiveRatePct=
  //                                                 14.5, customerSuccess=
  //                                                 88.5 — real customers
  //                                                 are being harmed even
  //                                                 though backend load
  //                                                 alone looks healthy.
  //   coarse-challenge-bounded (aggressive          UNSAFE  backendLoad=28,
  //   challenge alone)                              falsePositiveRatePct=
  //                                                 6.5 — still a real,
  //                                                 ongoing customer harm,
  //                                                 not a bounded
  //                                                 acceptable cost (see
  //                                                 section 10: "close to
  //                                                 threshold" is not
  //                                                 "safe to hand back").
  //   strict-limit-collateral (strict limit alone)  UNSAFE  backendLoad=55
  //                                                 still too high AND
  //                                                 falsePositiveRatePct=
  //                                                 9.0 — worst of both:
  //                                                 collateral damage
  //                                                 without even buying
  //                                                 real protection.
  //   cache-absorbing-partial (cache alone)         UNSAFE  backendLoad=52,
  //                                                 still above the
  //                                                 success bar
  //   targeting-without-signal (targeted scope,     UNSAFE  backendLoad=44,
  //   no sampling)                                  falsePositiveRatePct=
  //                                                 3.2 — still above the
  //                                                 bar, and still
  //                                                 "unresolved" since the
  //                                                 targeting had no real
  //                                                 evidence behind it.
  //   tenant-quota-partial (tenant quotas alone)    UNSAFE  backendLoad=38,
  //                                                 still above the
  //                                                 success bar despite a
  //                                                 near-zero false-
  //                                                 positive cost
  //   targeted-recovered (full targeted stack)      OPTIMAL backendLoad=24,
  //                                                 falsePositiveRatePct=
  //                                                 0.2, defenseMode=
  //                                                 "targeted" — real
  //                                                 protection with a
  //                                                 negligible customer
  //                                                 cost.
  //
  // Exactly one reachable state is genuinely safe to hand back. The
  // closest candidate for a second (acceptable) tier,
  // coarse-challenge-bounded, still carries a sustained 6.5% false-
  // positive rate — roughly one in fifteen real customers wrongly
  // challenged or blocked for as long as that setting stays in place.
  // Per section 10's explicit standard, "close to threshold" and
  // "ineffective/partial mitigation" are not acceptable-tier material —
  // a 6.5% ongoing harm to genuine customers is a real, uncorrected
  // problem, not a deliberate, bounded, genuinely-safe tradeoff. No
  // acceptableCondition is authored for this reason: most Phase 6C
  // scenarios should have none, and this is one of them.
  //
  // Decision: candidate_declared, no acceptableCondition.
  // "backendLoadPct looks fine" is not, by itself, proof the system is
  // safe to hand back — a candidate must judge whether that number came
  // from real bot suppression or from blocking real customers, which
  // falsePositiveRatePct/defenseMode exist to make visible. That
  // judgment — "is this safe enough to hand back" — is exactly what
  // candidate_declared exists to test, and successCondition gates
  // directly on defenseMode === "targeted" (never inferred from
  // backendLoadPct alone) for the same reason Split-Brain Incident gates
  // success on writeAuthorityState rather than on availability metrics.
  //
  // Immediate-Finish audit: defenseMode starts "unresolved" and no rule
  // ever sets it to "targeted" without the candidate having applied the
  // full targeted-defense control combination, so a zero-action
  // immediate Finish can never reach successCondition regardless of
  // sustainedSeconds. The 30-second sustainedSeconds window exists to
  // require the targeted stack to hold steady under continued incident
  // pressure (bots can and do continue testing other request shapes)
  // before Finish is eligible — not to block a no-action Finish, which
  // the defenseMode gate already makes unreachable on its own.
  completion: { mode: "candidate_declared" },
};
