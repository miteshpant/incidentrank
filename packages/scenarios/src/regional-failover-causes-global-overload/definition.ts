import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { regionalFailoverRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CACHE_PROTECTION_KEY,
  DB_CONCURRENCY_KEY,
  FAILOVER_CAP_KEY,
  LOW_PRIORITY_TRAFFIC_KEY,
  REGION_A_RESTORATION_KEY,
  TRAFFIC_RESTORE_PACE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const regionalFailoverSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "secondRegionRiskStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Region B and/or Region C are now being driven toward their own capacity limits by failover traffic from Region A -- a second regional failure is forming.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Region B and Region C have returned to a safe capacity margin.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "regionACriticalTrafficDroppedPct",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Business-critical customer operations are being dropped outright because neither Region A nor the current failover cap can carry them.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No business-critical traffic is currently being dropped.",
      },
    },
    { key: "queueDepth", trackPeak: true },
    { key: "regionBDbUtilization", trackPeak: true },
    { key: "regionCDbUtilization", trackPeak: true },
  ],
  timedEvents,
  rules: regionalFailoverRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6dsupport.md section 10) ───────────
  //
  // Reachable terminal/stable rule states while the incident is active or
  // in recovery, classified against successCondition
  // (secondRegionRiskStatus === "normal" AND
  // regionACriticalTrafficDroppedPct === 0 AND globalSuccessRate >= 88)
  // and acceptableCondition (secondRegionRiskStatus !== "critical" AND
  // regionACriticalTrafficDroppedPct === 0 AND globalSuccessRate >= 80),
  // with their REAL authored values (risk / dropped% / globalSuccessRate):
  //
  //   uncapped-failover-overloads-bc        UNSAFE   critical / 0  / 37
  //     -- the named harmful/tempting path: uncapped failover, no shed,
  //     no protection. Region B/C driven toward their own failure.
  //     Eventually trips failureCondition (90s sustained critical risk).
  //   failover-active-unmanaged             UNSAFE   critical / 0  / 48
  //     -- fallback mid-state: cap raised without pairing shed/
  //     protection. Same risk profile as the trap above, just reached by
  //     a less deliberate path.
  //   cap-too-low-drops-critical-traffic     UNSAFE   normal   / 55 / 72
  //   cap-zero-drops-all-critical-traffic    UNSAFE   normal   / 80 / 60
  //     -- THE OTHER TRAP: Region B/C read perfectly healthy (risk never
  //     even reaches "warning"), but real critical traffic has nowhere
  //     to go and is being dropped outright. Never satisfies either
  //     condition, because both conditions gate directly on
  //     regionACriticalTrafficDroppedPct === 0 -- no value of Region B/C
  //     health can substitute for that.
  //   capacity-managed-partial-protection     ACCEPTABLE warning / 0 / 84-85
  //     -- cap+shed correct, but only one of cache-protection/DB-
  //     concurrency engaged. Genuinely safe right now (not critical, no
  //     dropped traffic) but carrying real, visible stress on whichever
  //     tier was left unprotected -- a legitimate, bounded "partial
  //     regional loss accepted, one protection layer still missing"
  //     handback state, never the fully safe one.
  //   capacity-managed-no-protection          UNSAFE   warning / 0 / 78
  //     -- cap+shed still correct (never drops critical traffic), but
  //     NEITHER protection control engaged. globalSuccessRate=78 falls
  //     just under acceptableCondition's >=80 floor -- real, visible
  //     stress on both tiers simultaneously is one step too far to count
  //     as a safe handback, even though the traffic volume itself was
  //     bounded correctly.
  //   restore-gradual-before-drain-pending    ACCEPTABLE warning / 0 / 92
  //     -- paced restoration in progress; Region B/C have not yet fully
  //     drained. Safe right now, not yet durable.
  //   capacity-managed-full-protection         OPTIMAL   normal  / 0 / 90
  //     -- the structural fix during the active incident: cap at the
  //     critical-traffic floor, optional traffic shed, both protection
  //     controls engaged. Region A deliberately offline (partial
  //     regional loss accepted), Region B/C never at risk.
  //   restore-gradual-after-drain-safe         OPTIMAL   normal  / 0 / 100
  //     -- full recovery: Region A's capacity restored gradually, after
  //     Region B/C genuinely drained. The complete, durable end-state.
  //   restore-instant-retrigger                UNSAFE   critical / 0 / 68
  //     -- the recovery-sequencing trap: Region A's own health recovered
  //     first, but restoring its traffic at "instant" pace re-floods
  //     Region B/C before they finished draining. Eventually trips
  //     failureCondition exactly like the original trap, despite Region A
  //     itself being healthy by this point.
  //
  // Two independently-OPTIMAL, independently-ACCEPTABLE tiers exist here
  // (an active-incident-but-fully-contained state, and a fully-restored
  // end state) -- a genuine, bounded safe-but-imperfect tier is real for
  // this scenario (per phase6dsupport.md section 10's "a Principal
  // scenario may have no acceptable tier -- do not force one": this one
  // DOES have a real one, so it is authored), carried by
  // acceptableCondition's looser globalSuccessRate/risk bar rather than
  // by a second completion mode.
  //
  // Decision: candidate_declared (not automatic). Whether
  // secondRegionRiskStatus/regionACriticalTrafficDroppedPct/
  // globalSuccessRate happen to read safe at any given tick is necessary
  // but not sufficient -- a candidate who reaches capacity-managed-full-
  // protection mid-incident still has Region A fully offline and has not
  // yet proven the system is durably stable; a candidate who reaches
  // restore-gradual-after-drain-safe has completed a materially longer,
  // more complete recovery. Distinguishing "safe to hand back now, with
  // Region A still intentionally degraded" from "fully recovered" is
  // exactly the judgment candidate_declared plus the optimal/acceptable
  // split exists to test, alongside the dataIntegrity
  // containmentMechanism-aware scoring measure. Automatic failure remains
  // fully automatic regardless of mode (see failureCondition above and
  // evaluateCandidateDeclaredFinish) -- a candidate who declares Finish
  // while secondRegionRiskStatus has been critical long enough is
  // overridden by the automatic failure path, never by Finish.
  //
  // Immediate-Finish audit (phase6dsupport.md section 11): at t=0,
  // before Region A fails, the scenario sits at incidentState="healthy",
  // secondRegionRiskStatus="normal", regionACriticalTrafficDroppedPct=0,
  // globalSuccessRate=100 -- this trivially satisfies successCondition's
  // three authored fields. If a candidate clicked Finish with zero
  // actions before T=30s (before Region A fails), there is no
  // incidentStartedAtMs yet, so Finish is moot -- the incident has not
  // begun. The moment Region A fails at T=30s, the DEFAULT control state
  // (failoverCap=100, lowPriorityTrafficPolicy="serve",
  // cacheProtectionMode="off", dbConcurrencyMode="uncapped") immediately
  // matches "uncapped-failover-overloads-bc" -- secondRegionRiskStatus
  // flips straight to "critical" and globalSuccessRate drops to 37. A
  // zero-action candidate who clicks Finish anytime after T=30s is
  // sitting in the uncapped-failover trap and gets declared_unstable, not
  // resolved -- see the dedicated immediate-Finish test. This is the
  // expected default per phase6dsupport.md section 11.
  completion: { mode: "candidate_declared", acceptableCondition },
};
