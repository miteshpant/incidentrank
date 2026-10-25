import type { ComponentHealth, Rule, StateValue } from "@incidentrank/simulator";
import {
  CANCELLATION_PROPAGATION_KEY,
  CIRCUIT_BREAKER_KEY,
  GATEWAY_RETRIES_KEY,
  SERVICE_A_RETRIES_KEY,
  SERVICE_B_RETRIES_KEY,
  SERVICE_C_CONCURRENCY_KEY,
  SERVICE_C_RETRIES_KEY,
  SERVICE_C_TIMEOUT_SECONDS_KEY,
} from "./controls";

// A fixed, authored backlog of already-in-flight/queued connections
// that was built up while amplification was unresolved. Added on top of
// the bounded-topology's own steady-state in-flight/zombie numbers for
// any tick before backlogDrainWindowPassed fires, and fully gone once
// it does — the recovery-lag mechanism (phase6dsupport.md section 14).
const BACKLOG_IN_FLIGHT = 260;
const BACKLOG_ZOMBIE = 55;

const CUSTOMER_QPS = 400;

const healthyHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  gateway: "healthy",
  "service-a": "healthy",
  "service-b": "healthy",
  "service-c": "healthy",
  "external-provider": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  gateway: "degraded",
  "service-a": "degraded",
  "service-b": "degraded",
  "service-c": "degraded",
  "external-provider": "critical",
};

const criticalHealth: Record<string, ComponentHealth> = {
  client: "degraded",
  gateway: "critical",
  "service-a": "critical",
  "service-b": "critical",
  "service-c": "critical",
  "external-provider": "critical",
};

const ownedSafeHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  gateway: "healthy",
  "service-a": "healthy",
  "service-b": "healthy",
  "service-c": "degraded",
  "external-provider": "degraded",
};

/**
 * Builds a rule's authored snapshot for a given retry topology, so every
 * branch of the rule table below is a direct, auditable function of the
 * SAME authored amplification model rather than four copy-pasted-and-
 * hand-tweaked branches drifting out of sync with each other.
 *
 * amplificationFactor = (1+gw)*(1+a)*(1+b)*(1+c) — each layer's retries
 * compound onto whatever volume already survived every upstream layer's
 * retries, because a retry at Service A re-issues the request through
 * Service B and Service C again, each of which may ALSO retry it. This
 * is the real mechanism multiplicative amplification uses in production
 * retry stacks: retries are not additive across layers, they multiply.
 *
 * circuitBreakerOpen additionally caps the effective factor the provider
 * actually receives — once Service C's breaker trips, a bounded share
 * of requests fail fast locally rather than reaching the provider at
 * all, protecting the provider regardless of what upstream layers do
 * (though it does nothing for the zombie-work/in-flight pressure those
 * upstream retries still create while failing fast).
 */
function amplificationFactor(gw: number, a: number, b: number, c: number): number {
  return (1 + gw) * (1 + a) * (1 + b) * (1 + c);
}

function buildValues(opts: {
  amplification: number;
  circuitBreakerOn: boolean;
  cancellationOn: boolean;
  timeoutSeconds: number;
  concurrency: number;
  secondWave: boolean;
  retryOwnershipMode: string;
  /** Still-draining connection-pool backlog added on top of the
   * topology's own steady-state numbers — see BACKLOG_IN_FLIGHT/
   * BACKLOG_ZOMBIE's doc comment. Defaults to 0 (fully drained /
   * not applicable) for every rule that doesn't explicitly pass it. */
  backlogRemaining?: boolean;
  /** See metrics.ts's hardeningMode doc comment. Defaults to "n/a". */
  hardeningMode?: "full" | "partial" | "none" | "n/a";
}): Record<string, StateValue> {
  const { amplification, circuitBreakerOn, cancellationOn, timeoutSeconds, concurrency, secondWave } = opts;

  // Circuit breaker caps provider-facing volume at a bounded ceiling
  // regardless of how much upstream amplification is being generated —
  // it protects the PROVIDER, but does nothing for in-flight pressure
  // building up behind it.
  const rawProviderQps = CUSTOMER_QPS * amplification;
  const providerQps = circuitBreakerOn ? Math.min(rawProviderQps, CUSTOMER_QPS * 3) : rawProviderQps;

  const secondWaveMultiplier = secondWave ? 1.6 : 1;
  const providerConnectionUtilizationPercent = Math.min(
    100,
    Math.round(35 + (providerQps / CUSTOMER_QPS - 1) * 6 * secondWaveMultiplier),
  );
  const providerLatencyMs = Math.round(
    220 + (providerQps / CUSTOMER_QPS - 1) * 180 * secondWaveMultiplier,
  );

  // Low timeout + high amplification = requests fail fast but still
  // multiply; low timeout alone (without owning retries) does not solve
  // volume. High concurrency lets more of the amplified volume actually
  // reach the provider at once instead of queueing locally.
  const concurrencyPressure = concurrency >= 400 ? 1.15 : concurrency <= 50 ? 0.85 : 1;
  const steadyStateInFlight = Math.round(
    Math.min(20_000, CUSTOMER_QPS * amplification * (timeoutSeconds / 4) * concurrencyPressure * 0.9),
  );
  const inFlightRequests = opts.backlogRemaining
    ? steadyStateInFlight + BACKLOG_IN_FLIGHT
    : steadyStateInFlight;

  const customerSuccessRate = Math.min(
    99,
    Math.max(
      40,
      Math.round(99 - (amplification - 1) * 0.55 - (secondWave ? 8 : 0) + (circuitBreakerOn ? 4 : 0)),
    ),
  );

  // Cancellation propagation drains zombie work; without it, every
  // abandoned/failed-fast request's downstream siblings keep running to
  // completion for no one. The coefficient is small enough that a
  // genuinely bounded chain (amplification already consolidated to a
  // single owning layer) drains to a low, boundable zombie count once
  // cancellation is on, while an unmitigated/amplified chain still
  // produces a visibly large zombie count even with cancellation on.
  const steadyStateZombie = cancellationOn
    ? Math.round(steadyStateInFlight * 0.015)
    : Math.round(steadyStateInFlight * 0.22);
  const zombieRequestCount = opts.backlogRemaining
    ? steadyStateZombie + BACKLOG_ZOMBIE
    : steadyStateZombie;

  // Severity-level summary of overall chain health, driving
  // status/peak-severity bookkeeping (the engine's severityRank() only
  // understands normal/warning/critical string fields, never numeric
  // thresholds directly — see packages/simulator/src/severity.ts).
  // Bounded amplification (<=3) with acceptable customer success is
  // normal; materially amplified (<=30) but not yet catastrophic is
  // warning; everything else (the unmitigated/worsened/trap range) is
  // critical.
  const chainHealthStatus =
    amplification <= 3 && customerSuccessRate >= 90
      ? "normal"
      : amplification <= 10
        ? "warning"
        : "critical";

  return {
    customerQps: CUSTOMER_QPS,
    providerQps: Math.round(providerQps),
    effectiveAmplificationFactor: Math.round(amplification * 10) / 10,
    inFlightRequests,
    customerSuccessRate,
    providerLatencyMs,
    providerConnectionUtilizationPercent,
    zombieRequestCount,
    chainHealthStatus,
    retryOwnershipMode: opts.retryOwnershipMode,
    hardeningMode: opts.hardeningMode ?? "n/a",
  };
}

/**
 * Authored rule table, ordered most-specific-first. Every branch is
 * derived from the same `amplificationFactor`/`buildValues` model so the
 * numbers are provably consistent with the authored mechanism rather
 * than independently invented per rule.
 */
export const crossServiceRetryAmplificationRules: Rule[] = [
  // ── Recovery lag (phase6dsupport.md section 14): the fully-correct
  // topology has just been reached, but the connection-pool backlog
  // built up while amplification was unresolved has not yet had time
  // to drain. Checked BEFORE the fully-drained rule below because it is
  // the more specific condition (explicitly requires the drain window
  // to still be in progress) — once backlogDrainWindowPassed flips
  // true, only the rule below can match for this same topology.
  {
    id: "owned-at-service-c-backlog-draining",
    when: {
      triggerEquals: { providerDegraded: true, backlogDrainWindowPassed: false },
      controlEquals: {
        [GATEWAY_RETRIES_KEY]: 0,
        [SERVICE_A_RETRIES_KEY]: 0,
        [SERVICE_B_RETRIES_KEY]: 0,
        [CIRCUIT_BREAKER_KEY]: "on",
        [CANCELLATION_PROPAGATION_KEY]: "on",
      },
      controlAtMost: { [SERVICE_C_RETRIES_KEY]: 2 },
    },
    incidentState: "owned-backlog-draining",
    values: buildValues({
      amplification: amplificationFactor(0, 0, 0, 2),
      circuitBreakerOn: true,
      cancellationOn: true,
      timeoutSeconds: 4,
      concurrency: 200,
      secondWave: false,
      retryOwnershipMode: "owned-service-c",
      hardeningMode: "full",
      backlogRemaining: true,
    }),
    componentHealth: ownedSafeHealth,
  },

  // ── OPTIMAL: ownership consolidated at Service C (the layer directly
  // adjacent to the provider, best positioned to see its real health),
  // all three upstream layers stand down to zero retries, circuit
  // breaker on, cancellation propagation on, AND enough time has passed
  // for the connection-pool backlog to fully drain.
  // amplification = 1*1*1*3 = 3.
  {
    id: "owned-at-service-c-fully-safe",
    when: {
      triggerEquals: { providerDegraded: true },
      controlEquals: {
        [GATEWAY_RETRIES_KEY]: 0,
        [SERVICE_A_RETRIES_KEY]: 0,
        [SERVICE_B_RETRIES_KEY]: 0,
        [CIRCUIT_BREAKER_KEY]: "on",
        [CANCELLATION_PROPAGATION_KEY]: "on",
      },
      controlAtMost: { [SERVICE_C_RETRIES_KEY]: 2 },
    },
    incidentState: "owned-fully-safe",
    values: buildValues({
      amplification: amplificationFactor(0, 0, 0, 2),
      circuitBreakerOn: true,
      cancellationOn: true,
      timeoutSeconds: 4,
      concurrency: 200,
      secondWave: false,
      retryOwnershipMode: "owned-service-c",
      hardeningMode: "full",
    }),
    componentHealth: ownedSafeHealth,
  },

  // ── ACCEPTABLE-leaning but genuinely incomplete: ownership correctly
  // consolidated at Service C (upstream retries at zero) but the
  // candidate has not yet turned on cancellation propagation — zombie
  // work accumulates even though amplification itself is bounded.
  {
    id: "owned-at-service-c-no-cancellation",
    when: {
      triggerEquals: { providerDegraded: true },
      controlEquals: {
        [GATEWAY_RETRIES_KEY]: 0,
        [SERVICE_A_RETRIES_KEY]: 0,
        [SERVICE_B_RETRIES_KEY]: 0,
        [CIRCUIT_BREAKER_KEY]: "on",
        [CANCELLATION_PROPAGATION_KEY]: "off",
      },
      controlAtMost: { [SERVICE_C_RETRIES_KEY]: 2 },
    },
    incidentState: "owned-zombie-work-persists",
    values: buildValues({
      amplification: amplificationFactor(0, 0, 0, 2),
      circuitBreakerOn: true,
      cancellationOn: false,
      timeoutSeconds: 4,
      concurrency: 200,
      secondWave: false,
      retryOwnershipMode: "owned-service-c",
      hardeningMode: "partial",
    }),
    componentHealth: ownedSafeHealth,
  },

  // ── Owned at Service C, breaker still off: amplification is bounded
  // by ownership alone (no upstream retries), but without the breaker
  // Service C's own retries still hit the provider directly every time,
  // and the provider gets no protection from a sudden spike in Service
  // C's own retry rate. A genuine improvement over baseline, but not
  // the complete fix.
  {
    id: "owned-at-service-c-no-breaker",
    when: {
      triggerEquals: { providerDegraded: true },
      controlEquals: {
        [GATEWAY_RETRIES_KEY]: 0,
        [SERVICE_A_RETRIES_KEY]: 0,
        [SERVICE_B_RETRIES_KEY]: 0,
        [CIRCUIT_BREAKER_KEY]: "off",
      },
      controlAtMost: { [SERVICE_C_RETRIES_KEY]: 2 },
    },
    incidentState: "owned-no-breaker",
    values: buildValues({
      amplification: amplificationFactor(0, 0, 0, 2),
      circuitBreakerOn: false,
      cancellationOn: false,
      timeoutSeconds: 4,
      concurrency: 200,
      secondWave: false,
      retryOwnershipMode: "owned-service-c",
      hardeningMode: "partial",
    }),
    componentHealth: degradedHealth,
  },

  // ── Two layers stood down (Gateway + Service A), Service B and
  // Service C still at default retries. A further real improvement
  // over the single-layer trap (27 -> 9) but still above the bounded-
  // safe ceiling of 3, because Service B still independently retries
  // whatever survives Service A. Checked before the single-layer rules
  // below since it is the more specific condition (it additionally
  // constrains Service A to zero).
  {
    id: "two-layer-relief-incomplete",
    when: {
      triggerEquals: { providerDegraded: true },
      controlEquals: { [GATEWAY_RETRIES_KEY]: 0, [SERVICE_A_RETRIES_KEY]: 0 },
      controlAtLeast: { [SERVICE_B_RETRIES_KEY]: 2, [SERVICE_C_RETRIES_KEY]: 2 },
    },
    incidentState: "two-layer-relief-incomplete",
    values: buildValues({
      amplification: amplificationFactor(0, 0, 2, 2),
      circuitBreakerOn: false,
      cancellationOn: false,
      timeoutSeconds: 4,
      concurrency: 200,
      secondWave: false,
      retryOwnershipMode: "partial-gateway-and-a-only",
    }),
    componentHealth: degradedHealth,
  },

  // ── THE TRAP (required harmful/pressure-transfer path): the candidate
  // reduces retries at exactly ONE layer (Gateway) to zero while Service
  // A, B, and C all remain at their default retry count. amplification
  // = 1*3*3*3 = 27 — a visible improvement over the 81x unmitigated
  // baseline, but the amplification has simply moved one layer down the
  // chain rather than being eliminated: Service A is now the first
  // layer re-issuing the request multiple times, and B/C still compound
  // on top of that. This is the scenario's authored pressure-transfer:
  // relief at the Gateway is real but incomplete, and a candidate who
  // stops here is declaring victory on a metric that only improved
  // partially.
  {
    id: "single-layer-relief-incomplete",
    when: {
      triggerEquals: { providerDegraded: true },
      controlEquals: { [GATEWAY_RETRIES_KEY]: 0 },
      controlAtLeast: { [SERVICE_A_RETRIES_KEY]: 2, [SERVICE_B_RETRIES_KEY]: 2, [SERVICE_C_RETRIES_KEY]: 2 },
    },
    incidentState: "single-layer-relief-incomplete",
    values: buildValues({
      amplification: amplificationFactor(0, 2, 2, 2),
      circuitBreakerOn: false,
      cancellationOn: false,
      timeoutSeconds: 4,
      concurrency: 200,
      secondWave: false,
      retryOwnershipMode: "partial-gateway-only",
    }),
    componentHealth: criticalHealth,
  },

  // ── Second trap variant: relief applied at Service A only (a
  // different single layer), same incomplete-relief mechanism —
  // amplification = 3*1*3*3 = 27, same magnitude, proving the lesson is
  // "any single layer alone is insufficient," not "Gateway specifically
  // is the wrong layer to touch."
  {
    id: "single-layer-relief-service-a-incomplete",
    when: {
      triggerEquals: { providerDegraded: true },
      controlEquals: { [SERVICE_A_RETRIES_KEY]: 0 },
      controlAtLeast: { [GATEWAY_RETRIES_KEY]: 2, [SERVICE_B_RETRIES_KEY]: 2, [SERVICE_C_RETRIES_KEY]: 2 },
    },
    incidentState: "single-layer-relief-incomplete",
    values: buildValues({
      amplification: amplificationFactor(2, 0, 2, 2),
      circuitBreakerOn: false,
      cancellationOn: false,
      timeoutSeconds: 4,
      concurrency: 200,
      secondWave: false,
      retryOwnershipMode: "partial-service-a-only",
    }),
    componentHealth: criticalHealth,
  },

  // ── Harmful/tempting: tuning Service C's timeout/circuit-breaker
  // FIRST, before consolidating ownership — timeout lowered aggressively
  // while all four layers still retry at their default count.
  // amplification is unchanged (3*3*3*3 = 81, same as baseline) because
  // timeout tuning never touches retry COUNT; it only changes how long
  // each already-multiplied attempt waits before failing, so in-flight
  // pressure and zombie work both get WORSE (more attempts fail fast
  // and get retried even faster) while customer success does not
  // improve. This is the authored unsafe-sequence case: timeout/breaker
  // tuning before ownership consolidation.
  {
    id: "timeout-tuned-before-ownership-chosen",
    when: {
      triggerEquals: { providerDegraded: true },
      controlAtMost: { [SERVICE_C_TIMEOUT_SECONDS_KEY]: 1 },
      controlAtLeast: {
        [GATEWAY_RETRIES_KEY]: 2,
        [SERVICE_A_RETRIES_KEY]: 2,
        [SERVICE_B_RETRIES_KEY]: 2,
        [SERVICE_C_RETRIES_KEY]: 2,
      },
    },
    incidentState: "timeout-tuned-no-ownership",
    values: buildValues({
      amplification: amplificationFactor(2, 2, 2, 2) * 1.1,
      circuitBreakerOn: false,
      cancellationOn: false,
      timeoutSeconds: 1,
      concurrency: 200,
      secondWave: false,
      retryOwnershipMode: "unowned",
    }),
    componentHealth: criticalHealth,
  },

  // ── Harmful: increasing retries at MULTIPLE layers simultaneously,
  // the naive "retries help with flaky providers" instinct applied
  // everywhere at once. amplification explodes to 4*4*4*4 = 256.
  {
    id: "increase-retries-everywhere-worse",
    when: {
      triggerEquals: { providerDegraded: true },
      controlAtLeast: {
        [GATEWAY_RETRIES_KEY]: 3,
        [SERVICE_A_RETRIES_KEY]: 3,
        [SERVICE_B_RETRIES_KEY]: 3,
        [SERVICE_C_RETRIES_KEY]: 3,
      },
    },
    incidentState: "amplification-worsened",
    values: buildValues({
      amplification: amplificationFactor(3, 3, 3, 3),
      circuitBreakerOn: false,
      cancellationOn: false,
      timeoutSeconds: 4,
      concurrency: 200,
      secondWave: false,
      retryOwnershipMode: "unowned",
    }),
    componentHealth: criticalHealth,
  },

  // ── High concurrency amplifies whichever amplification level already
  // exists, without independently fixing or causing it — a pure
  // blast-radius multiplier layered on top of baseline.
  {
    id: "high-concurrency-baseline-amplified",
    when: {
      triggerEquals: { providerDegraded: true },
      controlAtLeast: {
        [SERVICE_C_CONCURRENCY_KEY]: 400,
        [GATEWAY_RETRIES_KEY]: 2,
        [SERVICE_A_RETRIES_KEY]: 2,
        [SERVICE_B_RETRIES_KEY]: 2,
        [SERVICE_C_RETRIES_KEY]: 2,
      },
    },
    incidentState: "baseline-critical",
    values: buildValues({
      amplification: amplificationFactor(2, 2, 2, 2),
      circuitBreakerOn: false,
      cancellationOn: false,
      timeoutSeconds: 4,
      concurrency: 400,
      secondWave: false,
      retryOwnershipMode: "unowned",
    }),
    componentHealth: criticalHealth,
  },

  // ── Second wave continuation of baseline: left fully unmitigated (no
  // layer has stood down retries), the provider itself degrades further
  // under sustained amplified load. Explicitly requires every retry
  // control still at its default-or-above so a candidate who HAS
  // already consolidated ownership (any of the owned-* rules above)
  // never falls through to this purely-trigger-based continuation —
  // those rules are checked first, and their conditions remain true
  // regardless of how much simulated time (and how many timed events)
  // have since elapsed.
  {
    id: "second-wave-unmitigated",
    when: {
      triggerEquals: { providerDegraded: true, secondWave: true },
      controlAtLeast: {
        [GATEWAY_RETRIES_KEY]: 1,
        [SERVICE_A_RETRIES_KEY]: 1,
        [SERVICE_B_RETRIES_KEY]: 1,
        [SERVICE_C_RETRIES_KEY]: 1,
      },
    },
    incidentState: "second-wave-critical",
    values: buildValues({
      amplification: amplificationFactor(2, 2, 2, 2),
      circuitBreakerOn: false,
      cancellationOn: false,
      timeoutSeconds: 4,
      concurrency: 200,
      secondWave: true,
      retryOwnershipMode: "unowned",
    }),
    componentHealth: criticalHealth,
  },

  // ── UNSAFE baseline: default retry topology (2 retries at every
  // layer), provider degraded, zero candidate action.
  // amplification = 3*3*3*3 = 81.
  {
    id: "baseline-critical-default",
    when: { triggerEquals: { providerDegraded: true } },
    incidentState: "baseline-critical",
    values: buildValues({
      amplification: amplificationFactor(2, 2, 2, 2),
      circuitBreakerOn: false,
      cancellationOn: false,
      timeoutSeconds: 4,
      concurrency: 200,
      secondWave: false,
      retryOwnershipMode: "unowned",
    }),
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: buildValues({
      amplification: amplificationFactor(2, 2, 2, 2),
      circuitBreakerOn: false,
      cancellationOn: false,
      timeoutSeconds: 4,
      concurrency: 200,
      secondWave: false,
      retryOwnershipMode: "unowned",
    }),
    componentHealth: healthyHealth,
  },
];
