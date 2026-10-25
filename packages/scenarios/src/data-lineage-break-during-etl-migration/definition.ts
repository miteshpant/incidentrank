import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { dataLineageBreakDuringEtlMigrationRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CUTOVER_AUDIT_LOG_KEY,
  CUTOVER_STRATEGY_KEY,
  LEGACY_PATH_DECOMMISSION_KEY,
  LINEAGE_FLAGGING_KEY,
  RECONCILIATION_DEPTH_KEY,
  REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const dataLineageBreakDuringEtlMigrationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      // Lineage-TRUST severity, deliberately independent of
      // Sources/Warehouse/Reports componentHealth (which never leaves
      // "healthy" anywhere in this scenario — see rules.ts). This is
      // what drives reliability's criticalTimeRatio measure in
      // scoring.ts: time spent with lineage trust genuinely at risk,
      // never time spent with availability itself degraded.
      key: "lineageTrustSeverity",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage:
          "CANDIDATE-ACTION CONSEQUENCE: reports/metrics are now being served from inconsistent, mixed v1/v2 lineage.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "CANDIDATE-ACTION CONSEQUENCE: reports/metrics are no longer being served from mixed lineage.",
      },
    },
  ],
  numericWatchFields: [
    {
      // HISTORICAL/CUMULATIVE business-trust exposure (phase6e3.md's
      // binding requirement). trackPeak:true is what makes this
      // genuinely non-resetting: state.peaks.peakValues computes
      // Math.max(previousPeak, currentValue) every tick regardless of
      // which rule currently matches (tick.ts), so even once a
      // candidate reverts the unsafe lever and
      // values.reportsServedWhileInconsistentCount returns to 0, the
      // peak the attempt actually reached stays recorded and is what
      // scoring reads indirectly via the dataIntegrity/reliability
      // penalties on the string-state fields this count tracks
      // alongside.
      key: "reportsServedWhileInconsistentCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "HISTORICAL CONSEQUENCE: at least one report has been served to stakeholders while its lineage was inconsistent during this incident — a permanent exposure that will not be erased by any later fix.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further reports are currently being served with inconsistent lineage.",
      },
    },
    {
      key: "metricsWithMixedLineagePercent",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "CANDIDATE-ACTION CONSEQUENCE: metrics are currently being computed from mixed v1/v2 lineage.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Metrics are no longer being computed from mixed lineage.",
      },
    },
    {
      key: "sourcesCutOverCount",
      trackPeak: false,
    },
    {
      key: "sourcesInInconsistentStateCount",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: dataLineageBreakDuringEtlMigrationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (same style/rigor as the Phase 6E.2
  // siblings) ──────────────────────────────────────────────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (metricsWithMixedLineagePercent/
  // sourcesInInconsistentStateCount/lineageConsistencyStatus/
  // migrationStatus/reportsServedWhileInconsistentCount):
  //
  //   healthy-default                      N/A (pre-incident)
  //   undecided-active                      SAFE-BUT-STALLED  0/0/consistent/not-started/0
  //   undecided-sustained                   SAFE-BUT-STALLED  0/0/consistent/not-started/0
  //     (never a correctness violation — nothing has been flipped yet —
  //     but cannot progress, and accrues real revenue loss the longer
  //     it stays open; neither successCondition nor acceptableCondition
  //     is satisfied since migrationStatus never reads "in-progress-safe"
  //     or "complete" while undecided)
  //   global-flip-silent-active             UNSAFE  40/5/inconsistent-silent/in-progress-unsafe/90
  //   global-flip-silent-sustained          UNSAFE  58/7/inconsistent-silent/in-progress-unsafe/410
  //     (best-looking availability numbers in the ENTIRE scenario —
  //     sourcesAvailabilityPercent/warehouseWriteSuccessRate/
  //     reportGenerationSuccessRate identical to every safe path — yet
  //     the single worst dataIntegrity/reliability outcome; see the
  //     score-sanity audit below)
  //   global-flip-flagged-ungated           UNSAFE  40/5/inconsistent-flagged/in-progress-unsafe/60
  //   global-flip-flagged-gated             UNSAFE  40/5/inconsistent-flagged/in-progress-unsafe/12
  //     (honestly flagged AND gated, but still fails successCondition/
  //     acceptableCondition — the all-at-once blend already happened;
  //     gating only stops the historical counter from accruing FURTHER)
  //   premature-decommission-trap           UNSAFE  32/4/inconsistent-silent/in-progress-unsafe/260
  //     (an INDEPENDENT unsafe lever, not reachable only via global-flip)
  //   staged-just-engaged                   ACCEPTABLE-eligible* 0/1/consistent/in-progress-safe/0
  //   staged-window1                        ACCEPTABLE 0/1/consistent/in-progress-safe/0
  //   staged-window2                        ACCEPTABLE 0/1/consistent/in-progress-safe/0
  //   staged-fully-complete                 OPTIMAL 0/0/consistent/complete/0
  //   dual-write-just-engaged               ACCEPTABLE-eligible* 0/4/consistent/in-progress-safe/0
  //   dual-write-window1                    ACCEPTABLE 0/3/consistent/in-progress-safe/0
  //   dual-write-window2                    ACCEPTABLE 0/2/consistent/in-progress-safe/0
  //   dual-write-fully-complete-full-depth       OPTIMAL 0/0/consistent/complete/0
  //   dual-write-fully-complete-shallow-depth    OPTIMAL 0/0/consistent/complete/0
  //     (*both "just-engaged" rows satisfy acceptableCondition
  //     immediately — zero mixed lineage, migrationStatus already
  //     reads "in-progress-safe" the instant a safe strategy is chosen,
  //     since staged/dual-write never blend a source's own lineage even
  //     at tick zero.)
  //
  // Every UNSAFE state fails successCondition AND acceptableCondition
  // for a real, named reason: either metricsWithMixedLineagePercent > 0
  // (an actively-happening lineage-mixing violation — never acceptable
  // regardless of how healthy availability looks), or
  // lineageConsistencyStatus != "consistent" (reads either
  // "inconsistent-flagged" — the honestly-flagged variant — or
  // "inconsistent-silent" — the global-flip-silent/premature-
  // decommission traps; both fail the same gate), or migrationStatus
  // reads "in-progress-unsafe" rather than "in-progress-safe"/"complete".
  // None of this is "almost fixed by coincidence of rounding" — each
  // fails a real, named gate.
  //
  // ── Why ACCEPTABLE (not merely "in progress") is the correct tier for
  // the staged/dual-write families while still migrating ─────────────
  // Every one of these states has metricsWithMixedLineagePercent === 0
  // and lineageConsistencyStatus === "consistent" — no metric has EVER
  // been computed from mixed lineage in any of them, because both
  // alternate strategies only ever expose a source's own clean lineage
  // (still-v1 or verified-v2), never a blend. This is the scenario's
  // required legitimate degraded-but-safe tradeoff: a migration that is
  // genuinely still in progress, with real but bounded cost and a real,
  // honestly-tracked cutover count, exactly the judgment call a
  // Principal engineer is expected to make and be willing to hand back
  // rather than wait out the full migration.
  //
  // ── Why silent-flip/premature-decommission are UNSAFE regardless of
  // how healthy availability looks (binding scoring-interpretation
  // requirement, mirroring Model Feature Freshness Degradation) ───────
  // lineageConsistencyStatus === "inconsistent-silent" (and the
  // honestly-flagged variant's "inconsistent-flagged") both fail
  // successCondition's explicit lineageConsistencyStatus === "consistent"
  // check and acceptableCondition's identical check — directly,
  // regardless of sourcesAvailabilityPercent/warehouseWriteSuccessRate/
  // reportGenerationSuccessRate reading identically to every safe path.
  // This scenario can therefore never resolve as safe via either path,
  // in any tier, however long the candidate waits or however good
  // availability looks. If left active long enough
  // (reportsServedWhileInconsistentCount >= 380, sustained 30s —
  // reachable via global-flip-silent-sustained's 410), the automatic
  // failureCondition fires — failure is never gated by completion mode
  // (tick.ts), so a candidate cannot simply decline to Finish and wait
  // out a live, worsening exposure.
  //
  // ── Historical damage survives reaching OPTIMAL ─────────────────────
  // staged-fully-complete's/dual-write-fully-complete-*'s live
  // values.reportsServedWhileInconsistentCount authors 0 (the live field
  // answers "is an inconsistent report being served RIGHT NOW"), but if
  // this attempt ever passed through the global-flip-silent or
  // premature-decommission family first, state.peaks.peakValues.
  // reportsServedWhileInconsistentCount (trackPeak:true, computed
  // generically by the engine as Math.max every tick) remains
  // permanently nonzero for the rest of the attempt — never reset by
  // reaching a clean rule state.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "in-progress-safe" (ACCEPTABLE — a deliberate,
  // genuinely safe, still-migrating tradeoff) and "complete" (OPTIMAL)
  // is a real system-state distinction, but deciding WHETHER to keep
  // waiting for full migration completion versus handing back a safe,
  // still-in-progress state is a genuine Principal-level judgment call,
  // not something the engine should auto-resolve the instant a
  // threshold is crossed. This mirrors every other Phase 6E
  // candidate_declared sibling's completion-mode reasoning exactly.
  //
  // ── Immediate-Finish audit ───────────────────────────────────────────
  // Triggering the incident and immediately calling Finish with zero
  // actions: the matched rule is undecided-active
  // (metricsWithMixedLineagePercent 0, lineageConsistencyStatus
  // "consistent", migrationStatus "not-started"), which satisfies
  // neither successCondition (migrationStatus != "complete") nor
  // acceptableCondition (migrationStatus != "in-progress-safe").
  // evaluateCandidateDeclaredFinish therefore returns
  // outcome: "declared_unstable" — the expected default, especially
  // important here since every live availability metric already reads
  // green at this exact moment (phase6e3.md's binding no-outage/
  // proactive-scenario concern, same as Model Feature Freshness
  // Degradation's requirement 10).
  completion: { mode: "candidate_declared", acceptableCondition },
};
