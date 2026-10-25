import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { schemaMigrationUnderLiveTrafficRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
  acceptableCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  APP_ROLLOUT_PERCENT_KEY,
  BACKFILL_CONCURRENCY_KEY,
  COMPATIBILITY_WRITE_MODE_KEY,
  DB_LOCK_TIMEOUT_MODE_KEY,
  MIGRATION_PHASE_KEY,
  RETRY_POLICY_KEY,
  ROLLBACK_APP_FLEET_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const schemaMigrationUnderLiveTrafficSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "migrationRiskStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Migration correctness risk has entered a critical state: new-shape-only rows are actively accumulating.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Migration correctness risk has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "newShapeOnlyRowCount",
      trackPeak: true,
      threshold: {
        value: 150,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "New-shape-only row count has crossed 150 affected rows.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "New-shape-only row count has dropped back below 150.",
      },
    },
    {
      key: "unreadableByServingFleetCount",
      trackPeak: true,
      threshold: {
        value: 50,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Reads unreadable by the serving fleet have crossed 50.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Reads unreadable by the serving fleet have dropped back below 50.",
      },
    },
    { key: "discardedAcknowledgedWriteCount", trackPeak: true },
    { key: "dbLockWaitMs", trackPeak: true },
    { key: "lockTimeoutFailureCount", trackPeak: true },
  ],
  timedEvents,
  rules: schemaMigrationUnderLiveTrafficRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6d3.md section 10, same style/rigor
  // as distributed-coordination-failure/definition.ts) ────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (newShapeOnlyRowCount / unreadableByServingFleetCount /
  // discardedAcknowledgedWriteCount / compatibilityStatus):
  //
  //   compatibility-broken-baseline                 UNSAFE  120/0/0   unresolved
  //   compatibility-broken-escalated                UNSAFE  300/0/0   unresolved
  //   aggressive-rollout-continues-while-broken      UNSAFE  210/0/0   unresolved
  //   aggressive-rollout-continues-while-broken-esc. UNSAFE  520/0/0   unresolved
  //   compatibility-broken-unmanaged                 UNSAFE  300/0/0   unresolved
  //   unsafe-sequence-rollback-before-repair-early    UNSAFE  120/120/0 violated
  //   unsafe-sequence-rollback-before-repair-sustained UNSAFE 300/300/0 violated
  //   unsafe-sequence-rollback-new-shape-only         UNSAFE  300/300/0 violated
  //   unsafe-contract-before-backfill                UNSAFE  120/0/95  violated
  //   unsafe-contract-before-backfill-sustained       UNSAFE  300/0/220 violated
  //   backfill-high-lock-contention-normal-timeout    UNSAFE  220/0/0   contained (backlog > 100)
  //   backfill-high-lock-contention-normal-timeout-bounded UNSAFE 40/0/0 contained (bounded, but lock TIMEOUT FAILURES still real/nonzero)
  //   backfill-high-lock-contention-aggressive-retries UNSAFE 220/0/0   contained (backlog > 100)
  //   backfill-high-lock-contention-aggressive-retries-bounded UNSAFE 40/0/0 contained (bounded, worse lock failures than normal-retry variant)
  //   backfill-high-extended-timeout-absorbs-pressure UNSAFE  220/0/0   contained (backlog > 100)
  //   draining-early-low-concurrency                  UNSAFE  180/0/0   contained (backlog > 100, recovery lag not yet elapsed)
  //   frozen-dual-shape-no-backfill                   UNSAFE  300/0/0   contained (never drains without backfill)
  //   draining-bounded-low-concurrency               ACCEPTABLE 85/0/0  contained (bounded, draining)
  //   draining-bounded-high-concurrency              ACCEPTABLE 40/0/0  contained (bounded, draining)
  //   fully-repaired-safe-rollback                    OPTIMAL  0/0/0   safe
  //   fully-repaired-safe-forward-complete             OPTIMAL  0/0/0   safe
  //   fully-repaired-undeclared                        OPTIMAL  0/0/0   safe (backlog drained, direction undeclared)
  //
  // Every UNSAFE state leaves at least one correctness-relevant count
  // genuinely nonzero-and-actively-forming, OR a frozen/unbounded
  // backlog that has not yet drained to the acceptable bound even
  // though no NEW damage is accumulating. In particular,
  // frozen-dual-shape-no-backfill looks calm (new-shape-only row
  // creation has stopped, compatibilityStatus is "contained," no hard
  // violation has occurred) but newShapeOnlyRowCount sits frozen at
  // 300 forever without active backfill — a real, ongoing unsafe
  // condition dressed as stability. This is exactly the "not almost
  // fixed, not partial credit" standard: a frozen, unrepaired backlog
  // this large must never be handed back as acceptable merely because
  // nothing is actively getting WORSE.
  //
  // A genuine ACCEPTABLE tier exists here (unlike
  // distributed-coordination-failure): once compatibilityWriteMode is
  // dual-shape (new damage stopped) AND backfill has been actively
  // running long enough to cross the recovery-lag checkpoint AND the
  // backlog is bounded (<=100) and demonstrably draining, that is a
  // legitimate, deliberate, safe-but-imperfect handback state — the
  // business invariant ("backfill completion is less important than
  // customer correctness") is explicitly honored by this tier: the
  // candidate does not have to wait for 100% backfill completion to
  // safely hand the system back, only for correctness to be genuinely
  // protected and the remaining backlog to be bounded and shrinking.
  //
  // Because a genuine ACCEPTABLE tier exists, AND because "is this
  // bounded-but-nonzero backlog safe enough to hand back" is a genuine
  // judgment call (not an objectively unambiguous recovery condition —
  // unlike distributed-coordination-failure's all-or-nothing table),
  // this scenario is `candidate_declared`, not `automatic`. The
  // judgment this scenario tests is exactly the sequencing decision
  // (stop creating incompatible rows -> control rollout -> protect the
  // DB from backfill/lock pressure -> backfill safely -> decide
  // whether to declare a direction or hand back a bounded-but-draining
  // state) plus correctly recognizing that a calm-looking frozen
  // backlog or a maximally-available rollback can each still be unsafe.
  completion: { mode: "candidate_declared", acceptableCondition },
};
