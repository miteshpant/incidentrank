import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { expensiveRetryAndLoggingAmplificationRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  DEPENDENCY_BACKOFF_KEY,
  LOGGING_LEVEL_KEY,
  PAYLOAD_LOGGING_MODE_KEY,
  RETENTION_MODE_KEY,
  RETRY_COUNT_KEY,
  RETRY_OWNERSHIP_KEY,
  SAMPLING_RATE_PERCENT_KEY,
  TELEMETRY_DUPLICATION_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const expensiveRetryAndLoggingAmplificationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "auditLogIntegrityStatus",
      // No announceCritical — auditLogIntegrityStatus's value set is
      // {intact, blind-window}, not the generic {normal, warning,
      // critical} severity vocabulary, so it is intentionally NOT
      // declared with an announceCritical narration. (costPosture is a
      // plain string-state field, not a severity field either, for the
      // same reason — see metrics.ts.)
    },
  ],
  numericWatchFields: [
    {
      key: "cumulativeAuditLogBlindWindowSeconds",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "Required audit/security logging has been disabled for at least one full second during this incident — a permanent historical consequence (an observability blind window) that will not be erased by any later fix.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No audit-log blind window is currently active.",
      },
    },
    {
      key: "costOverrunPercent",
      trackPeak: true,
    },
    {
      key: "operationalDebugSignalPercent",
      trackPeak: false,
    },
    {
      key: "dependencyRequestCostUsdPerMonth",
      trackPeak: false,
    },
    {
      key: "loggingCostUsdPerMonth",
      trackPeak: false,
    },
    {
      key: "telemetryCostUsdPerMonth",
      trackPeak: false,
    },
  ],
  timedEvents,
  rules: expensiveRetryAndLoggingAmplificationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (Phase 6E.2, same style/rigor as
  // privilege-escalation-via-stale-authorization-cache/definition.ts and
  // identity-platform-degradation/definition.ts) ─────────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (costOverrunPercent / auditLogIntegrityStatus /
  // operationalDebugSignalPercent / cumulativeAuditLogBlindWindowSeconds /
  // costPosture):
  //
  //   healthy-default                      N/A (pre-incident)
  //   unaddressed-baseline                 UNSAFE  210/intact/100/0/unaddressed
  //   unaddressed-sustained                UNSAFE  210/intact/100/0/unaddressed
  //     (the only reachable sustained-no-action state — every control's
  //     initial value already matches this rule's bare trigger
  //     constraint, so a true zero-action attempt reaches this rule,
  //     not a separate hidden state)
  //   retry-removed-overreach              UNSAFE  150/intact/100/0/unaddressed
  //     (requestSuccessRate genuinely regresses to 98.6 here — the only
  //     state where correctness/reliability, not merely cost, is worse
  //     than baseline; costPosture stays "unaddressed" because this is
  //     an overreach on a single lever, not a real fix)
  //   safe-but-wasteful                    ACCEPTABLE 168/intact/100/0/unaddressed
  //   retry-amplification-reduced          ACCEPTABLE 118/intact/100/0/retry-amplification-reduced
  //     (real, partial progress via alternate strong path A alone —
  //     genuinely safe but not yet at the OPTIMAL cost floor)
  //   retry-amplification-reduced-backoff  ACCEPTABLE 118/intact/100/0/retry-amplification-reduced
  //     (path A plus the dependencyBackoff=exponential secondary
  //     accelerant — same cost progress, a real, slightly better
  //     requestSuccessRate from smoothed peak request pressure)
  //   telemetry-noise-reduced              ACCEPTABLE 108/intact/95/0/telemetry-noise-reduced
  //     (real, partial progress via alternate strong path B alone)
  //   telemetry-noise-reduced-tiered       ACCEPTABLE 104/intact/95/0/telemetry-noise-reduced
  //     (path B plus the retentionMode=tiered secondary accelerant —
  //     a real, further loggingCostUsdPerMonth reduction on top of
  //     sampling/dedup/metadata-only alone)
  //   cost-optimized-safe                  OPTIMAL 0/intact/92/0/cost-optimized-safe
  //   cost-cut-unsafe                      UNSAFE  22/blind-window/0/30/cost-cut-unsafe
  //   cost-cut-unsafe-settled              UNSAFE  18/blind-window/0/320/cost-cut-unsafe
  //     (the BEST-looking raw cost numbers in the ENTIRE scenario — lower
  //     costOverrunPercent than every safe path including OPTIMAL,
  //     identical requestSuccessRate to the safe paths — yet the single
  //     worst dataIntegrity/reliability outcome; see the score-sanity
  //     audit in the test file)
  //
  // Every UNSAFE state fails successCondition for a real, named reason:
  // either costOverrunPercent != 0 (cost genuinely not yet at the healthy
  // floor) or auditLogIntegrityStatus != "intact" (an actively-happening
  // compliance violation — never acceptable regardless of how good the
  // cost number looks, per the batch's binding requirement 4) or
  // operationalDebugSignalPercent < 85 (debugging signal genuinely
  // insufficient). None of these is "almost fixed by coincidence of
  // rounding" — each fails a real, named gate.
  //
  // ACCEPTABLE (safe-but-wasteful) is the ONE genuine bounded tradeoff:
  // auditLogIntegrityStatus is exactly "intact" and
  // operationalDebugSignalPercent is exactly 100 (every REQUIRED
  // invariant fully intact, by construction), but costOverrunPercent
  // stays at 168 — the large majority of the regression's cost is still
  // present. This is deliberately a judgment call ("is this bounded,
  // safe, partial cost reduction good enough to hand back, or should I
  // keep working toward the full cost floor"), not an objective
  // zero/nonzero gate.
  //
  // OPTIMAL requires costOverrunPercent === 0 AND auditLogIntegrityStatus
  // === "intact" AND operationalDebugSignalPercent >= 85 — reachable
  // only via cost-optimized-safe, which requires BOTH alternate strong
  // paths' levers combined (retryCount<=1 + worker-owns-retries +
  // samplingRatePercent<=10 + deduplicated + metadata-only), proving the
  // two single-axis paths are genuinely, independently viable partial
  // progress but neither alone reaches the full cost floor.
  //
  // ── Why cost-cut-unsafe is UNSAFE regardless of how good cost looks
  // (the batch's binding requirement 4) ────────────────────────────────
  // auditLogIntegrityStatus === "blind-window" fails successCondition's
  // explicit auditLogIntegrityStatus === "intact" check and
  // acceptableCondition's identical check — both directly, regardless of
  // costOverrunPercent reading 18-22 (BETTER than every safe path,
  // including OPTIMAL's 0-floor-but-not-negative number) and
  // requestSuccessRate reading 99.7 (identical to every safe path). This
  // scenario can therefore never resolve as safe via this path, in any
  // tier, however long the candidate waits or however good the other
  // metrics look. If left active long enough
  // (cumulativeAuditLogBlindWindowSeconds >= 300, sustained 30s —
  // reachable via cost-cut-unsafe-settled's 320, itself above the 300
  // failure threshold),
  // the automatic failureCondition fires — failure is never gated by
  // completion mode (tick.ts), so a candidate cannot simply decline to
  // Finish and wait out a live, worsening compliance violation.
  //
  // ── Historical damage survives reaching OPTIMAL ─────────────────────
  // cost-optimized-safe's live `values.cumulativeAuditLogBlindWindowSeconds`
  // authors 0 (the live field answers "is a blind window happening RIGHT
  // NOW"), but if this attempt ever passed through the audit-off family,
  // state.peaks.peakValues.cumulativeAuditLogBlindWindowSeconds (a
  // numericWatchField with trackPeak:true, computed generically by the
  // engine as Math.max every tick regardless of which rule currently
  // matches) remains permanently nonzero for the rest of the attempt —
  // it is never reset by reaching a clean rule state. This is the same
  // non-self-resetting mechanism Privilege Escalation via Stale
  // Authorization Cache uses for its own historical counter: whether an
  // audit blind window happened EARLIER in this attempt is a permanent
  // scar visible via peak tracking (and penalized by scoring's
  // dataIntegrity dimension), never a second completion gate
  // re-litigating the past on top of the live successCondition.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "unaddressed" (UNSAFE — cost regression fully
  // present) and "safe-but-wasteful" (ACCEPTABLE — a real, deliberate
  // partial fix) is a real system-state distinction, but deciding
  // WHETHER that bounded partial fix is worth handing back — as opposed
  // to continuing to engage both alternate strong paths and reach the
  // full OPTIMAL cost floor — is a genuine Senior-Staff-level judgment
  // call about cost/risk/quality, not something the engine should
  // auto-resolve the instant a threshold is crossed. This mirrors
  // Privilege Escalation via Stale Authorization Cache's and Identity
  // Platform Degradation's completion-mode reasoning exactly, and is
  // especially important here per the batch's binding requirement 10:
  // a zero-action Finish must never accidentally resolve as safe merely
  // because availability already looks green.
  completion: { mode: "candidate_declared", acceptableCondition },
};
