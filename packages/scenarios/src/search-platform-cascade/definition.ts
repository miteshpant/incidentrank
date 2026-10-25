import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { searchPlatformCascadeRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  RANKING_INCLUSION_KEY,
  RANKING_TIMEOUT_MS_KEY,
  FEATURE_STORE_USAGE_KEY,
  QUERY_CONCURRENCY_KEY,
  PARTIAL_RESULT_MODE_KEY,
  CACHE_KEY,
  INDEX_TIMEOUT_MS_KEY,
  API_CAPACITY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const searchPlatformCascadeSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "coordinatorPressureStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The Query Coordinator has entered a critical held-connection pressure state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The Query Coordinator has recovered from its held-connection pressure state.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "indexClusterAConnections",
      trackPeak: true,
      threshold: {
        value: 300,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Index Cluster A connection pressure has crossed 300 held connections.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Index Cluster A connection pressure has dropped back below 300.",
      },
    },
    {
      key: "indexClusterBConnections",
      trackPeak: true,
    },
    {
      key: "featureStoreQps",
      trackPeak: true,
      threshold: {
        value: 4_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Feature Store QPS has crossed 4,000 — a direct consequence of held-open query pressure.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Feature Store QPS has dropped back below 4,000.",
      },
    },
    {
      key: "searchApiP99Ms",
      trackPeak: true,
    },
    {
      key: "staleOrUnrelatedResultsServedCount",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: searchPlatformCascadeRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6d.2.md section 10) ─────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (basicSearchSuccessRatePercent / indexClusterA&B
  // Connections / featureStoreQps / staleOrUnrelatedResultsServedCount /
  // coordinatorPressureStatus / responsePathMode):
  //
  //   baseline-unmitigated                 UNSAFE
  //     84% / 240,240 / 3,400 / 0 / critical / full-ranking
  //     New damage: none to correctness, but availability actively
  //     degraded and NOT improving on its own — Ranking never recovers
  //     by itself in this scenario.
  //
  //   concurrency-raised-alone-worsens-pressure   UNSAFE
  //     78% / 340,340 / 4,800 / 0 / critical / scale-the-symptom
  //     Pressure-transfer trap, partial lever: worse than baseline.
  //
  //   scale-symptom-worsens-pressure       UNSAFE
  //     61% / 480,480 / 6,800 / 0 / critical / scale-the-symptom
  //     Pressure-transfer trap, both levers: materially worse than
  //     baseline on every downstream metric. Never acceptable at any
  //     availability reading because new damage (pressure) is actively
  //     accumulating, not stopped.
  //
  //   unsafe-partial-results-no-cache-bound   UNSAFE
  //     99.5% / 150,150 / 200 / 340(and climbing) / warning /
  //     unsafe-partial-results
  //     The critical trap this scenario exists to test: availability
  //     and latency look EXCELLENT, but staleOrUnrelatedResultsServedCount
  //     is a real, nonzero, actively-growing correctness violation. Its
  //     numeric values alone are NOT sufficient to exclude it from
  //     either completion tier by coincidence — indexClusterAConnections
  //     =150 sits exactly at acceptableCondition's <=150 boundary,
  //     coordinatorPressureStatus="warning" passes the not-critical
  //     bound, and basicSearchSuccessRatePercent=99.5 clears the >=99
  //     bound both conditions share. Both successCondition and
  //     acceptableCondition (revenue-and-cost.ts) therefore carry an
  //     EXPLICIT, direct gate —
  //     { key: "responsePathMode", operator: "not_equals",
  //       comparedTo: "unsafe-partial-results" }
  //     — so this state is excluded from completion eligibility for a
  //     real, provable reason, never an accident of the numeric bounds.
  //     Per phase6d.2.md section 9/10, a state with new damage
  //     (historical correctness violations) still accumulating must
  //     NEVER be classified acceptable or optimal, however healthy
  //     availability looks — confirmed here by an explicit condition,
  //     not an assumption. scoring.ts additionally carries a dedicated
  //     dataIntegrity penalty (finalStringEquals on responsePathMode=
  //     "unsafe-partial-results", -150 of 200 points) so a candidate who
  //     passed through this state earlier in the attempt and later fixed
  //     it (cache on, counter frozen, drains to degraded-quality-safe-
  //     drained or restored-safely-after-drain) is scored on the FINAL
  //     state's own responsePathMode for completion purposes, while the
  //     non-resetting historical peak (state.peaks.peakValues.
  //     staleOrUnrelatedResultsServedCount — the engine's genuine
  //     monotonic-max bookkeeping, never derived or assumed) remains
  //     available to a verifier/reviewer as the real, permanent record
  //     of what happened during the attempt.
  //
  //   restore-too-early-retrigger           UNSAFE
  //     82% / 300,300 / 3,900 / carries-forward / critical / restored-too-early
  //     The sequencing retrigger: ranking restored before the drain
  //     window elapsed. coordinatorPressureStatus="critical" fails both
  //     successCondition and acceptableCondition outright.
  //
  //   degraded-quality-safe-draining         ACCEPTABLE
  //     99.7% / 95,95 / 120 / 0 / warning / degraded-quality-safe
  //     New damage genuinely stopped (staleOrUnrelatedResultsServedCount
  //     frozen at 0, never grew on this path), basic search fully
  //     healthy, correctness fully protected, and the bounded historical
  //     backlog for THIS path is zero — but held-connection pressure
  //     (indexClusterA/BConnections=95) is still draining toward the
  //     true 60-connection baseline, not yet fully recovered.
  //     coordinatorPressureStatus="warning" (not "critical") satisfies
  //     acceptableCondition's not-equals-critical bound. A legitimate,
  //     bounded, not-fully-healthy handback state — exactly the
  //     "degraded quality, core search intact" tier the scenario spec
  //     requires.
  //
  //   degraded-quality-safe-drained           OPTIMAL-adjacent (reaches
  //     successCondition) 99.9% / 60,60 / 20 / 0 / normal /
  //     degraded-quality-safe
  //     Fully drained, deliberately-degraded steady state. Ranking stays
  //     permanently excluded by choice — the business invariant
  //     explicitly permits this. indexClusterAConnections=60 <= 65 and
  //     coordinatorPressureStatus="normal" satisfy successCondition in
  //     full. This is a genuine, legitimate OPTIMAL terminal state, not
  //     merely "acceptable" — the candidate made a complete, correct,
  //     permanent decision.
  //
  //   restored-safely-after-drain             OPTIMAL
  //     99.8% / 60,60 / 800 / 0 / normal / restored-safely
  //     Ranking selectively restored after the drain window, full
  //     capability back, satisfies successCondition in full.
  //
  //   timeout-shortened-alone-partial-relief   UNSAFE
  //     93% / 140,140 / 2,100 / 0 / warning / full-ranking
  //     Real partial relief and no correctness risk: indexClusterA/B
  //     Connections=140 is within acceptableCondition's <=150 bound and
  //     coordinatorPressureStatus="warning" passes its not-critical
  //     bound. But acceptableCondition ALSO requires
  //     basicSearchSuccessRatePercent>=99, and this state's 93% fails
  //     that bound outright — so this state does not satisfy
  //     acceptableCondition. Classified UNSAFE: a real, uncorrected
  //     availability gap (93% < 99%) remains, even though no
  //     correctness violation is occurring.
  //
  //   feature-store-reduced-alone-partial-relief   UNSAFE
  //     89% / 240,240 / 1,700 / 0 / critical / full-ranking
  //     coordinatorPressureStatus="critical" fails both conditions
  //     outright; index pressure never addressed.
  //
  // Every UNSAFE state above either has a real availability gap, a real
  // correctness violation in progress, or coordinatorPressureStatus
  // still "critical" — none is merely "almost fixed." Per phase6d.2.md
  // section 9's binding rule, a state with new damage still
  // accumulating (scale-the-symptom, restore-too-early,
  // unsafe-partial-results) is never classified acceptable or optimal
  // here, confirmed above state-by-state.
  //
  // This scenario DOES carry a genuine ACCEPTABLE tier
  // (degraded-quality-safe-draining) distinct from its OPTIMAL tier —
  // per the scenario spec's explicit direction ("a safe degraded state
  // where search quality is reduced but core search remains healthy
  // should be a real, legitimate ACCEPTABLE (or OPTIMAL) terminal
  // state"). Because the judgment this scenario tests is precisely
  // "is this ambiguous-looking degraded state actually safe enough to
  // hand back, or merely quiet" (the unsafe-partial-results-no-cache
  // path proves a quiet-looking state can still be unsafe), this is
  // genuinely a candidate_declared scenario, not automatic — the
  // candidate must form and act on that judgment, not have the engine
  // silently resolve it the moment a numeric bar is crossed.
  completion: { mode: "candidate_declared", acceptableCondition },
};
