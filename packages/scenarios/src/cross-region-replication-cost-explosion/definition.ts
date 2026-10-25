import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { crossRegionReplicationCostExplosionRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  ARCHIVE_REPLICATION_MODE_KEY,
  CRITICAL_DATA_PINNING_KEY,
  CRITICAL_REPLICATION_FACTOR_KEY,
  LOW_PRIORITY_REGION_FAN_OUT_KEY,
  LOW_PRIORITY_REPLICATION_FACTOR_KEY,
  STANDARD_REPLICATION_MODE_KEY,
  TRANSFER_BATCHING_KEY,
  TRANSFER_COMPRESSION_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const crossRegionReplicationCostExplosionSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [],
  numericWatchFields: [
    {
      // The historical, non-resetting exposure record (phase6e2.md's
      // required "what already happened cannot be erased" element).
      // trackPeak: true means state.peaks.peakValues.
      // criticalDataExposureEventCount is computed generically by the
      // engine as Math.max every tick regardless of which rule
      // currently matches — it is never reset by a later rule
      // restoring the live field to 0.
      key: "criticalDataExposureEventCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "A disaster-recovery verification drill has just found critical data under-replicated below its mandated durability floor — a permanent historical exposure event has been recorded and will not be erased by any later fix.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No disaster-recovery verification drill is currently finding a live durability breach.",
      },
    },
    {
      key: "monthlyTotalReplicationCostUsd",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: crossRegionReplicationCostExplosionRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6e2.md requirement 12) ──────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (criticalDataDurabilityStatus /
  // criticalDataExposureEventCount / monthlyTotalReplicationCostUsd):
  //
  //   healthy-default                           N/A (pre-incident)
  //   baseline-cost-explosion                    UNSAFE(-ish)/INELIGIBLE
  //     policy-compliant / 0 / 6,300 — durability fine, but zero cost
  //     relief achieved; fails both successCondition and
  //     acceptableCondition on the cost gate alone. This is the state a
  //     zero-action candidate sits in indefinitely.
  //   pinned-no-other-action                     INELIGIBLE
  //     policy-compliant / 0 / 6,300 — identical cost to baseline;
  //     pinning is a safety-rail acknowledgment, never a cost lever.
  //   critical-factor-breached-undetected        UNSAFE, INELIGIBLE
  //     below-policy-floor / 0 / 1,600 — durability genuinely violated
  //     right now; no drill has caught it yet. Never eligible despite
  //     the best-looking raw cost number reachable without a drill.
  //   critical-factor-breached-drilled            UNSAFE, INELIGIBLE
  //     below-policy-floor / 1 / 1,600 — the drill just caught the
  //     breach; a permanent historical exposure event is now recorded.
  //   critical-factor-breached-drilled-twice      UNSAFE, INELIGIBLE
  //     below-policy-floor / 2 / 1,600 — breach held through a SECOND
  //     drill; exposure compounds further, proving it is a real,
  //     cumulative record, not a one-time flag.
  //   archive-only-fix                            ACCEPTABLE
  //     policy-compliant / 0 / 5,250 — real, single-lever relief.
  //   compression-only-fix                        ACCEPTABLE
  //     policy-compliant / 0 / 5,250 — real, single-lever relief.
  //   strategy-b-async-batched                    ACCEPTABLE
  //     policy-compliant / 0 / 4,850 — real relief via the MODE
  //     mechanism alone, not yet enough to clear the OPTIMAL bar.
  //   strategy-a-scope-reduction                  OPTIMAL
  //     policy-compliant / 0 / 3,500 — real relief via the SCOPE
  //     mechanism alone.
  //   both-strategies-fully-optimized             OPTIMAL
  //     policy-compliant / 0 / 2,130 — SCOPE + MODE + every orthogonal
  //     lever combined, the cost-floor ceiling reachable without ever
  //     breaching durability.
  //
  // Every UNSAFE/INELIGIBLE state fails successCondition AND
  // acceptableCondition for a real, named reason: either
  // criticalDataDurabilityStatus !== "policy-compliant" (a live,
  // named policy violation) or criticalDataExposureEventCount !== 0 (a
  // permanent historical scar) or monthlyTotalReplicationCostUsd is
  // still above the relevant bar (no real relief achieved yet). None
  // of these is "almost fixed by coincidence of rounding" — each fails
  // a real, named gate.
  //
  // ACCEPTABLE is a genuine, bounded middle tier: durability is
  // explicitly clean on both fields, but total cost relief is real yet
  // partial — reachable via a single orthogonal lever alone or via
  // Strategy B alone, each a deliberate, safe, if wasteful, stopping
  // point distinct from the fully-optimized OPTIMAL tier.
  //
  // OPTIMAL requires criticalDataDurabilityStatus === "policy-compliant"
  // AND criticalDataExposureEventCount === 0 AND
  // monthlyTotalReplicationCostUsd <= 3,600 — reachable via EITHER
  // alternate strong path (Strategy A's scope reduction, or Strategy
  // B's mode reduction combined with every orthogonal lever), proving
  // both are genuinely, independently viable.
  //
  // ── Why the unsafe-minimum-cost trap can never resolve as safe,
  // however good its raw cost numbers look ───────────────────────────
  // critical-factor-breached-undetected reaches a total cost of 1,600
  // — the lowest RAW number reachable without a drill — yet
  // criticalDataDurabilityStatus explicitly reads "below-policy-floor",
  // failing both successCondition and acceptableCondition directly.
  // This scenario never auto-fails on this condition (see
  // revenue-and-cost.ts's deliberately-unreachable failureCondition —
  // a durability breach has no live-availability signature, so there
  // is no automatic terminal consequence to force), but the breach can
  // also never be laundered into a Finish-eligible outcome merely by
  // looking cheap. The ONLY way out is restoring
  // criticalReplicationFactor to 3 (and, if a drill has already fired,
  // accepting that the historical exposure count can never be
  // un-recorded — see the peak-tracking numericWatchField above).
  //
  // ── Historical damage survives reaching OPTIMAL ─────────────────────
  // If this attempt ever passed through the critical-factor-breached-
  // drilled family before restoring the factor to 3,
  // state.peaks.peakValues.criticalDataExposureEventCount (computed
  // generically by the engine as Math.max every tick) remains
  // permanently nonzero for the rest of the attempt even though the
  // LIVE criticalDataExposureEventCount field reads back to 0 once a
  // clean rule state is matched again — the live field answers "is a
  // breach currently unrecorded-and-undetected or freshly detected
  // right now," the peak answers "did a drill ever actually catch a
  // breach during this attempt, ever" — mirroring Privilege Escalation
  // via Stale Authorization Cache's and Identity Platform Degradation's
  // identical non-resetting historical-counter convention.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // Deciding whether a given cost/scope/mode configuration is "safe
  // enough to hand back" requires genuine judgment about whether the
  // durability floor is actually being honored (a live policy
  // question with no single dashboard-visible signal — durability and
  // freshness are orthogonal, and the breach has zero availability
  // signature) and whether the cost relief achieved so far is enough
  // to call the incident resolved versus merely partially addressed —
  // exactly the kind of judgment candidate_declared exists to test,
  // mirroring Replication Backlog's and Privilege Escalation via Stale
  // Authorization Cache's identical completion-mode reasoning.
  //
  // Immediate-Finish audit: at t=0 the incident has not started
  // (incidentStartedAtMs is null until POLICY_CHANGE_DISCOVERED_MS), so
  // the engine's own sustain-window bookkeeping never accrues
  // consecutiveSuccessSeconds/consecutiveAcceptableSeconds before the
  // incident begins — evaluateCompletionEligibility returns
  // { eligible: false } for an immediate zero-action Finish. Once the
  // incident starts, the baseline state (baseline-cost-explosion)
  // immediately fails BOTH successCondition and acceptableCondition on
  // the cost gate (monthlyTotalReplicationCostUsd sits at the
  // unmitigated 6,300, clearing neither the 3,600 nor the 5,300 bar),
  // so a zero-action Finish issued at any point reliably resolves to
  // declared_unstable — see the "everything already looks
  // green/healthy but the underlying cost condition is still
  // materially unacceptable" requirement for no-outage/proactive
  // scenarios.
  completion: { mode: "candidate_declared", acceptableCondition },
};
