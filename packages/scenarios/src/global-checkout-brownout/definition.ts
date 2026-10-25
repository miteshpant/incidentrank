import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { globalCheckoutBrownoutRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  ENRICHMENT_MODE_KEY,
  INVENTORY_RESERVATION_STRATEGY_KEY,
  MAX_CHECKOUT_CONCURRENCY_KEY,
  PRICING_MODE_KEY,
  PROMOTIONS_MODE_KEY,
  RETRY_POLICY_KEY,
  TAX_MODE_KEY,
  TIMEOUT_BUDGET_MS_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const globalCheckoutBrownoutSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "checkoutPathStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The synchronous checkout critical path has entered a critical, unusable-latency state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The checkout critical path has recovered to a usable state.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "checkoutLatencyMs",
      trackPeak: true,
      threshold: {
        value: 3_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Checkout end-to-end latency has crossed 3000ms.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Checkout end-to-end latency has dropped back below 3000ms.",
      },
    },
    { key: "requestConcurrency", trackPeak: true },
    {
      key: "unreconciledOptimisticReservationCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Unreconciled optimistic inventory reservations are now accumulating -- a real oversell risk.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No unreconciled optimistic inventory reservations remain.",
      },
    },
    { key: "inFlightDrainingRequests", trackPeak: true },
  ],
  timedEvents,
  rules: globalCheckoutBrownoutRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6dsupport.md section 10) ────────────
  //
  // Reachable terminal/stable rule states while the incident is active
  // (dependenciesDegraded=true, before natural recovery), classified
  // against successCondition (checkoutLatencyMs <= 1000 AND
  // paymentAuthSuccessPct == 100 AND inventoryReservationSuccessPct ==
  // 100 AND unreconciledOptimisticReservationCount == 0) and
  // acceptableCondition (checkoutLatencyMs <= 1800, same correctness
  // gates):
  //
  //   baseline-degraded-unmitigated     UNSAFE   latency=3150  pay=100  inv=100  unrecon=0
  //     -- nothing is "down," but three moderate degradations compose
  //     on the synchronous path into unusable latency. Correctness is
  //     intact but latency is far outside both bars.
  //   concurrency-amplified             UNSAFE   latency=4300  pay=98   inv=99   unrecon=0
  //     -- raising concurrency without trimming the path makes latency
  //     WORSE than the untouched baseline, not better.
  //   retry-amplified-moderate          UNSAFE   latency=5100  pay=96   inv=98   unrecon=0
  //     -- the pressure-transfer mechanism: retries uniformly applied
  //     push Payment/Inventory error rates up even though neither was
  //     ever directly degraded.
  //   retry-amplified-aggressive        UNSAFE   latency=9200  pay=86   inv=91   unrecon=0
  //     -- pay=86 is also below the failureCondition's 90% floor; left
  //     sustained for 90s this scenario FAILS outright, not merely
  //     "stays unsafe."
  //   optimistic-reservation-trap       UNSAFE   latency=3400  pay=100  inv=94   unrecon=37
  //     -- THE CORRECTNESS TRAP. Inventory's own latency reads fast
  //     (60ms) and nothing in availability signals a problem, yet a
  //     real, counted, actively-growing oversell risk
  //     (unreconciledOptimisticReservationCount=37) exists. This can
  //     never satisfy successCondition OR acceptableCondition, because
  //     both gate on unreconciledOptimisticReservationCount == 0
  //     directly -- no amount of healthy-looking latency substitutes.
  //   critical-path-trimmed-partial     ACCEPTABLE  latency=1450  pay=100  inv=100  unrecon=0
  //     -- a genuine, deliberate, bounded tradeoff: Promotions disabled
  //     and Tax on bounded fallback (two of three slow calls removed),
  //     but Pricing left live. Latency drops to 1450ms -- inside the
  //     acceptable bar (<=1800) but not the optimal one (<=1000).
  //     Correctness is fully intact. partialCheckoutPct=60 makes the
  //     reduced functionality candidate-visible, never hidden.
  //   critical-path-trimmed-full        OPTIMAL     latency=650   pay=100  inv=100  unrecon=0
  //     -- all three non-critical dependencies off the synchronous path
  //     (Promotions disabled, Tax bounded-fallback, Pricing
  //     cached-fallback) plus reduced enrichment. Latency falls under
  //     the optimal bar; Payment/Inventory were never touched and stay
  //     fully correct throughout.
  //   timeout-tightened                 UNSAFE   latency=2450  pay=100  inv=100  unrecon=0
  //     -- TIMEOUT_BUDGET_MS_KEY=2000: a slow call is abandoned sooner,
  //     lowering latency below the untouched baseline, but a larger
  //     share of those abandoned calls never complete within the
  //     tighter window, so pricing/promotions/tax error rates rise above
  //     baseline. Correctness is untouched; latency is still far outside
  //     both bars.
  //   timeout-loosened                  UNSAFE   latency=4100  pay=100  inv=100  unrecon=0
  //     -- TIMEOUT_BUDGET_MS_KEY=8000: fewer calls time out (lower error
  //     rates than baseline) but a slow dependency holds the synchronous
  //     chain open longer, raising latency above baseline. Correctness
  //     is untouched; latency is still far outside both bars.
  //
  // A genuine ACCEPTABLE tier exists here (critical-path-trimmed-partial)
  // because a candidate who disables Promotions and switches Tax to its
  // bounded fallback, but leaves Pricing live, has made a real, bounded,
  // deliberate tradeoff that is safe right now (every correctness field
  // at its floor) even though latency has not fully recovered to the
  // optimal bar. This is NOT the same failure mode the optimistic-
  // reservation trap represents -- the partial-trim state has zero
  // correctness risk, it is simply a smaller mitigation than the full
  // fix. Per section 10's "a Principal scenario may have no acceptable
  // tier -- do not force one," this scenario's acceptable tier is kept
  // because it is real and earned, not manufactured for symmetry: both
  // successCondition and acceptableCondition share the identical,
  // non-negotiable correctness gates (payment/inventory/unreconciled),
  // and differ ONLY on how much latency relief is required -- exactly
  // the "legitimate degraded-but-safe state" sections 9/14 of phase6d.md
  // describe (reduced functionality, not reduced correctness).
  //
  // Decision: candidate_declared (not automatic). Whether latency
  // happens to read under a bar at any given tick is necessary but not
  // sufficient proof the candidate understood WHY -- a candidate who
  // lucks into a brief latency dip from natural traffic variance (there
  // is none authored here, but the completion model must not assume
  // the measured state alone proves durable understanding) must still
  // explicitly declare the system safe to hand back, and must
  // distinguish "the latency and correctness floors are genuinely,
  // durably satisfied because I removed the right calls from the path"
  // from "a metric happens to be fine this second." Automatic failure
  // remains fully automatic regardless of mode (see failureCondition
  // above and evaluateCandidateDeclaredFinish) -- the aggressive-retry
  // path's sustained sub-90% payment success auto-fails even if the
  // candidate never clicks Finish.
  //
  // Immediate-Finish audit (phase6dsupport.md section 11): at t=0,
  // before dependenciesDegraded fires, the scenario sits at
  // incidentState="healthy" with checkoutLatencyMs=800 (already under
  // both bars) and every correctness field at its safe floor -- this
  // trivially satisfies successCondition's authored fields. But
  // incidentStartedAtMs is null until the first timed event sets a
  // trigger (tick.ts's `meetsSuccess`/`meetsFailure`/`meetsAcceptable`
  // all additionally require incidentStartedAtMs !== null), so Finish
  // is moot before T=30s: evaluateCandidateDeclaredFinish only consults
  // the sustain counters, which never advance before incident start.
  // The moment dependenciesDegraded fires at T=30s, the DEFAULT control
  // state (no mitigation applied) immediately matches
  // baseline-degraded-unmitigated -- checkoutLatencyMs jumps to 3150ms,
  // failing both successCondition and acceptableCondition instantly. A
  // zero-action candidate who clicks Finish at any point after T=30s is
  // therefore sitting in the UNSAFE baseline-degraded state and gets
  // declared_unstable, never resolved -- confirmed by the dedicated
  // "Immediate-Finish audit" test below. This matches the batch's
  // expected default.
  completion: { mode: "candidate_declared", acceptableCondition },
};
