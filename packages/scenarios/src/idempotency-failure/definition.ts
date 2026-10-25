import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { idempotencyFailureRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  KEY_SCOPE_KEY,
  KEY_TTL_SECONDS_KEY,
  RETRY_STRATEGY_KEY,
  STORAGE_MODE_KEY,
  STORE_UNAVAILABLE_BEHAVIOR_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const idempotencyFailureSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "idempotencyStoreHealth",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The idempotency store has entered a critical state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The idempotency store has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "duplicateSideEffectCount",
      trackPeak: true,
      threshold: {
        value: 50,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Duplicate side-effect count has crossed 50.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Duplicate side-effect count has dropped back below 50.",
      },
    },
    {
      key: "retryCountPerMin",
      trackPeak: true,
    },
    {
      key: "requestSuccessRatePct",
      trackPeak: false,
    },
  ],
  timedEvents,
  rules: idempotencyFailureRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md sections 8-10) ──────────────
  //
  // Reachable terminal/stable rule states, classified by their REAL
  // authored values — never by how healthy requestSuccessRatePct or
  // externalSideEffectRatePerMin happen to look:
  //
  //   degrading (baseline, 1st wave)             UNSAFE — duplicateSideEffectCount=9,
  //                                                duplicationSafetyStatus=
  //                                                "unsafe-duplicating".
  //   ttl-eviction-duplicating                    UNSAFE — duplicateSideEffectCount=22,
  //                                                short TTL still evicting keys
  //                                                before legitimate retries land.
  //   scope-too-broad-suppressing                 UNSAFE — duplicateSideEffectCount
  //                                                stays near 0 (2), but
  //                                                duplicationSafetyStatus=
  //                                                "unsafe-suppressing": a DIFFERENT
  //                                                real integrity violation (legitimate
  //                                                work silently dropped), not visible
  //                                                via the duplicate counter alone.
  //   unreachable-duplicating (baseline, 2nd wave) UNSAFE — duplicateSideEffectCount=70,
  //                                                climbing further, store critical.
  //   failopen-duplicating                        UNSAFE — requestSuccessRatePct=99.6
  //                                                (looks healthy!), but
  //                                                duplicateSideEffectCount=48 and
  //                                                climbing: the core required trap.
  //   failopen-duplicating-amplified               UNSAFE — aggressive retry on top of
  //                                                fail-open; duplicateSideEffectCount=95,
  //                                                success rate still 99.7 (looks even
  //                                                healthier).
  //   wasted-scaling-failopen                      UNSAFE — worker concurrency scaled
  //                                                while fail-open+unreachable;
  //                                                throughput highest of all reachable
  //                                                states (820/min), duplicateSideEffectCount=160
  //                                                — the explicit required trap: looks
  //                                                like it's helping while duplicates
  //                                                accumulate fastest.
  //   failclosed-degraded-availability             ACCEPTABLE — duplicateSideEffectCount=0,
  //                                                duplicationSafetyStatus="safe": the
  //                                                real correctness counter genuinely
  //                                                holds at zero. requestSuccessRatePct
  //                                                drops to 71% and
  //                                                externalSideEffectRatePerMin falls to
  //                                                180/min (real, visible availability
  //                                                cost) because requests are
  //                                                rejected/queued rather than
  //                                                proceeding unchecked while the store
  //                                                itself is still critical/unreachable.
  //                                                A genuine, bounded, deliberate
  //                                                tradeoff — correctness protected at
  //                                                an availability cost — not "almost
  //                                                fixed."
  //   deduplicated                                 OPTIMAL — duplicateSideEffectCount=0,
  //                                                duplicationSafetyStatus="safe",
  //                                                idempotencyStoreHealth="normal",
  //                                                requestSuccessRatePct=99.4: the store
  //                                                itself is genuinely healthy
  //                                                (replicated mode, no unreachability
  //                                                escalation) AND the TTL/scope
  //                                                mitigations are in effect. No
  //                                                tradeoff was needed at all.
  //
  // Per the scenario's binding design requirement: successCondition and
  // acceptableCondition both gate on duplicateSideEffectCount<=0 AND
  // duplicationSafetyStatus==="safe" directly — never satisfied by a
  // fail-open state regardless of how healthy requestSuccessRatePct or
  // externalSideEffectRatePerMin look, and never satisfied by the
  // too-broad-scope suppression trap either (duplicationSafetyStatus
  // there is "unsafe-suppressing", not "safe").
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // failclosed-degraded-availability state. "Is this system safe enough
  // to hand back?" is exactly the right question here — an automatic
  // mode would silently withhold success while telling the candidate
  // nothing about why a seemingly-healthy fail-open state never
  // resolves. candidate_declared lets the product surface the explicit,
  // testable moment where a candidate tries to Finish from a
  // healthy-looking-but-duplicating state and is told declared_unstable
  // rather than resolved, and separately rewards the deliberate
  // fail-closed tradeoff as a genuinely different, lesser-but-safe
  // tier from the fully-recovered optimal state.
  completion: { mode: "candidate_declared", acceptableCondition },
};
