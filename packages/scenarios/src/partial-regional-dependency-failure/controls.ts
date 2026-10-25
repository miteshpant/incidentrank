import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Per-region routing mode for the US regional service's calls to the
 * shared dependency. "normal" sends live calls through; "isolate" stops
 * calling the shared dependency from this region entirely and serves the
 * region's own locally cached/default fallback response instead. Because
 * US's dependency path is healthy for the whole incident, isolating it
 * trades away nothing real — there is no live failure here to protect
 * against — so a candidate who isolates US anyway is paying an
 * unnecessary availability cost on a region that was never broken.
 */
export const US_ROUTING_MODE_KEY = "usRoutingMode";

/**
 * Same per-region isolation control for the EU regional service, whose
 * dependency path is genuinely slow (not failing) for the whole
 * incident. Isolating EU trades EU's full live responses for EU's
 * fallback responses — a real, regionally-scoped tradeoff, but only
 * warranted if the candidate judges EU's degraded latency as bad enough
 * to act on.
 */
export const EU_ROUTING_MODE_KEY = "euRoutingMode";

/**
 * Same per-region isolation control for the APAC regional service, whose
 * dependency path is intermittently failing for the whole incident —
 * the one region where isolating (or falling back) is unambiguously the
 * right regional call, because APAC's live calls are the ones actually
 * erroring.
 */
export const APAC_ROUTING_MODE_KEY = "apacRoutingMode";

/**
 * Global dependency-fallback toggle: when enabled, any region whose
 * routing mode is "isolate" (or that trips the global breaker) serves a
 * degraded-but-available canned response instead of failing outright.
 * Without this enabled, isolating/breaking a region simply drops that
 * region's dependency-dependent traffic with no fallback — isolation
 * alone is not a complete mitigation on its own.
 */
export const DEPENDENCY_FALLBACK_ENABLED_KEY = "dependencyFallbackEnabled";

/**
 * Global per-call timeout budget applied uniformly to every region's
 * calls to the shared dependency. Tightening it caps how long EU's slow
 * calls can hang (real, if partial, relief for EU) but it is a GLOBAL
 * knob — it tightens US's and APAC's budgets too, even though US has no
 * latency problem to budget against and APAC's problem is intermittent
 * failure, not slowness, so a tight timeout does nothing for APAC's
 * actual failures and can clip US's normal-but-not-instant calls.
 */
export const TIMEOUT_POLICY_MS_KEY = "timeoutPolicyMs";

/**
 * The global circuit breaker: when tripped, EVERY region stops calling
 * the shared dependency, uniformly, regardless of that region's actual
 * health. This is the scenario's central trap — it genuinely relieves
 * APAC's intermittent failures and EU's slowness, but it also cuts off
 * US's fully healthy, fully succeeding calls, which a region-scoped
 * isolation of only EU/APAC would never have touched.
 */
export const GLOBAL_CIRCUIT_BREAKER_KEY = "globalCircuitBreakerTripped";

export const controls: ControlDefinition[] = [
  {
    key: US_ROUTING_MODE_KEY,
    allowedValues: ["normal", "isolate"],
    initialValue: "normal",
  },
  {
    key: EU_ROUTING_MODE_KEY,
    allowedValues: ["normal", "isolate"],
    initialValue: "normal",
  },
  {
    key: APAC_ROUTING_MODE_KEY,
    allowedValues: ["normal", "isolate"],
    initialValue: "normal",
  },
  {
    key: DEPENDENCY_FALLBACK_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: TIMEOUT_POLICY_MS_KEY,
    allowedValues: [5_000, 1_500, 600],
    initialValue: 5_000,
  },
  {
    key: GLOBAL_CIRCUIT_BREAKER_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
