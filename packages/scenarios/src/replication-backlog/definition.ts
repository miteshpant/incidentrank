import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { replicationBacklogRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  WRITE_THROTTLE_LEVEL_KEY,
  REPLICATION_WORKER_COUNT_KEY,
  BATCHING_MODE_KEY,
  READ_ROUTING_KEY,
  TRAFFIC_PRIORITY_KEY,
  REPLICA_COUNT_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const replicationBacklogSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "primaryStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The primary database has entered a critical replication-backlog state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The primary database has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "replicationLagMs",
      trackPeak: true,
      threshold: {
        value: 10_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Replication lag has crossed 10 seconds.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Replication lag has dropped back below 10 seconds.",
      },
    },
    {
      key: "staleReadAgeMs",
      trackPeak: true,
    },
    {
      key: "storagePressure",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Replication staging storage pressure has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Replication staging storage pressure has dropped back below 90%.",
      },
    },
  ],
  timedEvents,
  rules: replicationBacklogRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   backlog-growing (baseline, no action)        UNSAFE
  //     lag=18,000ms, stale=17,600ms, primaryStatus=critical
  //   batch-overload (harmful: large uncompressed)  UNSAFE
  //     lag=42,000ms, networkPressure=95, critical
  //   fanout-overload (harmful: added replicas)      UNSAFE
  //     lag=38,000ms, networkPressure=90, critical
  //   primary-overloaded (harmful: primary-only reads, UNSAFE
  //     no throttle)   lag=36,000ms, writeAcceptanceRate=88, critical
  //   reads-isolated (strategy b alone)               UNSAFE
  //     staleReadAgeMs=0 (!) but replicationLagMs=32,000ms and still
  //     climbing, primaryStatus=warning — looks safe from the read
  //     side but the backlog itself is a live, unbounded risk.
  //   throttled-partial (moderate throttle alone)     UNSAFE
  //     lag=4,200ms, stale=3,900ms, warning
  //   priority-shed-partial                            UNSAFE
  //     lag=14,000ms, critical
  //   parallelism-partial (8 workers, no throttle)     UNSAFE
  //     lag=6,500ms, stale=6,200ms, warning
  //   storage-exhausted (second wave, no mitigation)   UNSAFE
  //     lag=95,000ms, storagePressure=98, critical
  //   throttled-recovered (aggressive throttle)        OPTIMAL
  //     lag=180ms, stale=150ms, normal, writeAcceptanceRate=55
  //   parallelism-recovered (16 workers + compressed   OPTIMAL
  //     batching, no throttle)   lag=220ms, stale=190ms, normal,
  //     writeAcceptanceRate=100
  //
  // Both successful end states satisfy the SAME successCondition
  // (replicationLagMs <= 1,000 AND staleReadAgeMs <= 1,000 AND
  // primaryStatus != "critical") via genuinely different strategies —
  // one trades ingest throughput for freshness, the other preserves
  // throughput by scaling replication capacity instead. Neither is a
  // "partial credit" tier; both are full, durable recoveries.
  //
  // No state in this table is safe-but-imperfect in the sense section
  // 10 requires for an acceptableCondition. In particular,
  // "reads-isolated" is tempting to call acceptable — stale-read age is
  // literally 0 — but the backlog itself (replicationLagMs) is left
  // uncontained and still growing, which is exactly the kind of
  // healthy-looking-but-unsafe state this audit must gate out, not
  // reward: a single customer-visible metric reading well is never
  // sufficient to call the system safe to hand back (see
  // revenue-and-cost.ts's dual-field successCondition gate). Every
  // other non-optimal state is a real but incomplete mitigation (some
  // relief from baseline, never a bounded, deliberate, genuinely-safe
  // tradeoff) — correctly left ineligible for Finish rather than
  // awarded a third tier, per section 10's explicit "not almost
  // passed, not partial credit" rule.
  //
  // Decision: candidate_declared, with NO acceptableCondition. The
  // candidate must judge whether a currently-healthy-looking metric
  // (e.g. zero stale reads) reflects a genuinely contained backlog or
  // only an isolated symptom — exactly the "is this safe enough to
  // hand back" judgment candidate_declared exists to test, and there is
  // no genuine safe-but-imperfect middle tier to add on top of it.
  //
  // Immediate-Finish audit (section 9): at t=0 the incident has not
  // started (incidentStartedAtMs is null until WRITE_SURGE_MS), so the
  // engine's own sustain-window bookkeeping never accrues
  // consecutiveSuccessSeconds before the incident begins —
  // evaluateCompletionEligibility returns { eligible: false } for an
  // immediate zero-action Finish. Once the incident starts, the
  // baseline state (backlog-growing) immediately fails
  // successCondition on all three gated fields, so there is no window
  // in which doing nothing is ever mistaken for recovery.
  completion: { mode: "candidate_declared" },
};
