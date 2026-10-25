import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  AUTH_MIDDLEWARE_MODE_KEY,
  BACKEND_CAPACITY_KEY,
  CONNECTION_REUSE_ENABLED_KEY,
  GATEWAY_CAPACITY_KEY,
  RATE_LIMIT_AT_GATEWAY_KEY,
  ROUTE_COMPLEXITY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-gateway": "healthy",
  "service-fleet": "healthy",
};

const gatewayCriticalBackendHealthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-gateway": "critical",
  "service-fleet": "healthy",
};

const gatewayDegradedBackendHealthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-gateway": "degraded",
  "service-fleet": "healthy",
};

const gatewayCriticalBackendDegradedHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-gateway": "critical",
  "service-fleet": "degraded",
};

/**
 * Authored rule table for API Gateway Saturation, ordered most-specific
 * first. A recent gateway deploy regressed two things at once: upstream
 * connections to the service fleet are opened per-request instead of
 * reused, and route-matching walks a newly deployed verbose, regex-heavy
 * rule table instead of a precompiled one. As gateway traffic grows,
 * this per-request overhead burns gateway CPU and backs up the gateway's
 * own request queue — while the service fleet behind it, which does
 * none of that work, stays idle and fast whenever it is actually
 * reached. The durable fix addresses the gateway-side overhead directly
 * (connection reuse + simplified routing); auth middleware mode
 * contributes a third, independent overhead source (per-request identity
 * provider introspection) that a lightweight caching mode can relieve
 * without removing enforcement.
 *
 * The scenario's binding trap: backendCapacity (service-fleet replica
 * count) must do nothing for gateway queue depth, gateway CPU, or
 * customer latency — the backends were never the constraint and stay
 * idle regardless of this control's value. authMiddlewareMode=bypass is
 * a second, distinct trap: it clears every symptom immediately but
 * removes authentication/authorization enforcement from every request
 * passing through the gateway, which the business requires stay on.
 */
export const apiGatewaySaturationRules: Rule[] = [
  // ── Optimal recovery: both real gateway-side overhead sources are
  // removed (persistent connection reuse restored, route-matching
  // simplified) and authentication stays genuinely enforced (not
  // bypassed). Gateway CPU, queue depth, and customer latency all
  // recover, and the service fleet — never the actual constraint —
  // stays exactly as idle and healthy as it was at the start. Checked
  // first so it wins over every other control combination once both
  // fixes are live.
  {
    id: "gateway-overhead-fixed-recovery",
    when: {
      triggerEquals: { trafficGrowing: true },
      controlEquals: {
        [CONNECTION_REUSE_ENABLED_KEY]: true,
        [ROUTE_COMPLEXITY_KEY]: "simplified",
      },
    },
    incidentState: "gateway-fixed",
    values: {
      gatewayQueueDepth: 5,
      gatewayCpuUtilization: 22,
      backendUtilization: 11,
      gatewayConnectionCount: 90,
      downstreamLatencyMs: 13,
      customerLatencyMs: 48,
      gatewayStatus: "normal",
      gatewaySaturationHealth: "fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Harmful decoy, explicit: backend/service-fleet capacity scaled
  // up while the gateway-side root cause is untouched. The service
  // fleet receives exactly the same (already-light) request volume it
  // always did, so its own utilization stays flat and low — but the
  // gateway's queue depth, CPU, and customer latency stay exactly as
  // saturated as the unmitigated baseline, because none of the added
  // backend capacity does anything about per-request connection churn
  // or route-matching cost happening entirely at the gateway. Modeled
  // as its own rule (rather than silently falling through to baseline)
  // so "nothing changed at the gateway despite adding backend capacity"
  // is visible and authored, not an accident of rule ordering.
  {
    id: "backend-scaling-does-not-help-gateway",
    when: {
      triggerEquals: { trafficGrowing: true },
      controlAtLeast: { [BACKEND_CAPACITY_KEY]: 24 },
      controlEquals: {
        [CONNECTION_REUSE_ENABLED_KEY]: false,
        [ROUTE_COMPLEXITY_KEY]: "verbose",
        [AUTH_MIDDLEWARE_MODE_KEY]: "full",
      },
    },
    incidentState: "backend-scaled-no-relief",
    values: {
      gatewayQueueDepth: 640,
      gatewayCpuUtilization: 97,
      backendUtilization: 6,
      gatewayConnectionCount: 3_800,
      downstreamLatencyMs: 11,
      customerLatencyMs: 2_300,
      gatewayStatus: "critical",
      gatewaySaturationHealth: "unresolved",
    },
    componentHealth: gatewayCriticalBackendHealthyHealth,
  },

  // ── Harmful/decoy: authentication middleware bypassed entirely.
  // Every symptom clears immediately — gateway CPU and queue depth
  // drop, customer latency drops — because the gateway no longer
  // performs any per-request identity-provider introspection at all.
  // But this removes a required security control from every request
  // passing through the gateway, not merely a cost-saving shortcut.
  {
    id: "auth-bypass-clears-symptoms-unsafely",
    when: {
      triggerEquals: { trafficGrowing: true },
      controlEquals: { [AUTH_MIDDLEWARE_MODE_KEY]: "bypass" },
    },
    incidentState: "auth-bypassed",
    values: {
      gatewayQueueDepth: 3,
      gatewayCpuUtilization: 19,
      backendUtilization: 10,
      gatewayConnectionCount: 95,
      downstreamLatencyMs: 12,
      customerLatencyMs: 44,
      gatewayStatus: "normal",
      gatewaySaturationHealth: "bypassed",
    },
    componentHealth: healthyHealth,
  },

  // ── Alternate good path, structurally different mechanism: the auth
  // middleware is switched to lightweight (cached introspection) mode
  // instead of touching connection handling or routing at all. This
  // removes the third, independent overhead source (per-request
  // identity-provider calls) and alone is enough to bring gateway CPU
  // and queue depth back to a healthy, sustainable state, with
  // enforcement genuinely still on — a real alternate route to OPTIMAL
  // that doesn't require fixing connection reuse or route complexity.
  {
    id: "lightweight-auth-alone-recovers",
    when: {
      triggerEquals: { trafficGrowing: true },
      controlEquals: { [AUTH_MIDDLEWARE_MODE_KEY]: "lightweight" },
    },
    incidentState: "lightweight-auth-recovery",
    values: {
      gatewayQueueDepth: 8,
      gatewayCpuUtilization: 26,
      backendUtilization: 11,
      gatewayConnectionCount: 420,
      downstreamLatencyMs: 13,
      customerLatencyMs: 52,
      gatewayStatus: "normal",
      gatewaySaturationHealth: "fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Partial, still degraded: connection reuse restored alone (routing
  // still verbose). Removes connection-churn overhead, giving real
  // relief to gatewayConnectionCount and gatewayCpuUtilization, but
  // every request still walks the expensive verbose route table, so
  // queue depth and customer latency stay meaningfully elevated.
  {
    id: "connection-reuse-alone-partial-relief",
    when: {
      triggerEquals: { trafficGrowing: true },
      controlEquals: {
        [CONNECTION_REUSE_ENABLED_KEY]: true,
        [ROUTE_COMPLEXITY_KEY]: "verbose",
      },
    },
    incidentState: "connection-reuse-partial",
    values: {
      gatewayQueueDepth: 210,
      gatewayCpuUtilization: 64,
      backendUtilization: 9,
      gatewayConnectionCount: 150,
      downstreamLatencyMs: 12,
      customerLatencyMs: 780,
      gatewayStatus: "warning",
      gatewaySaturationHealth: "unresolved",
    },
    componentHealth: gatewayDegradedBackendHealthyHealth,
  },

  // ── Partial, still degraded: route complexity simplified alone
  // (connections still opened per-request). Cuts route-matching CPU
  // cost substantially, but gatewayConnectionCount keeps climbing from
  // unreused per-request connections, so queue depth and customer
  // latency stay meaningfully elevated.
  {
    id: "route-simplified-alone-partial-relief",
    when: {
      triggerEquals: { trafficGrowing: true },
      controlEquals: {
        [ROUTE_COMPLEXITY_KEY]: "simplified",
        [CONNECTION_REUSE_ENABLED_KEY]: false,
      },
    },
    incidentState: "route-simplified-partial",
    values: {
      gatewayQueueDepth: 240,
      gatewayCpuUtilization: 58,
      backendUtilization: 9,
      gatewayConnectionCount: 3_600,
      downstreamLatencyMs: 12,
      customerLatencyMs: 820,
      gatewayStatus: "warning",
      gatewaySaturationHealth: "unresolved",
    },
    componentHealth: gatewayDegradedBackendHealthyHealth,
  },

  // ── Partial, still degraded: gateway capacity scaled up alone. More
  // gateway replicas means more raw CPU available to do route-matching
  // and connection-churn work, so queue depth and customer latency
  // improve meaningfully from baseline — but the per-request overhead
  // itself was never removed, so CPU utilization per replica stays
  // elevated and cost rises for a non-durable fix.
  {
    id: "gateway-capacity-alone-partial-relief",
    when: {
      triggerEquals: { trafficGrowing: true },
      controlAtLeast: { [GATEWAY_CAPACITY_KEY]: 8 },
      controlEquals: {
        [CONNECTION_REUSE_ENABLED_KEY]: false,
        [ROUTE_COMPLEXITY_KEY]: "verbose",
        [AUTH_MIDDLEWARE_MODE_KEY]: "full",
      },
    },
    incidentState: "gateway-scaled-partial",
    values: {
      gatewayQueueDepth: 160,
      gatewayCpuUtilization: 71,
      backendUtilization: 8,
      gatewayConnectionCount: 3_700,
      downstreamLatencyMs: 12,
      customerLatencyMs: 640,
      gatewayStatus: "warning",
      gatewaySaturationHealth: "unresolved",
    },
    componentHealth: gatewayDegradedBackendHealthyHealth,
  },

  // ── Partial, still degraded: rate limiting enforced at the gateway
  // alone. Shedding a share of requests before they reach route-
  // matching/connection-handling genuinely reduces gateway CPU and
  // queue depth, but it does so by rejecting legitimate traffic, not by
  // making each accepted request cheaper — and the underlying overhead
  // remains for every request that IS accepted.
  {
    id: "rate-limit-partial-relief-sheds-traffic",
    when: {
      triggerEquals: { trafficGrowing: true },
      controlAtLeast: { [RATE_LIMIT_AT_GATEWAY_KEY]: 2_000 },
      controlEquals: {
        [CONNECTION_REUSE_ENABLED_KEY]: false,
        [ROUTE_COMPLEXITY_KEY]: "verbose",
      },
    },
    incidentState: "rate-limited-partial",
    values: {
      gatewayQueueDepth: 90,
      gatewayCpuUtilization: 55,
      backendUtilization: 7,
      gatewayConnectionCount: 2_600,
      downstreamLatencyMs: 12,
      customerLatencyMs: 410,
      gatewayStatus: "warning",
      gatewaySaturationHealth: "unresolved",
    },
    componentHealth: gatewayDegradedBackendHealthyHealth,
  },

  // ── Second wave, baseline: sustained unmitigated per-request
  // connection churn finally exhausts the gateway's own connection
  // count ceiling, deepening the already-visible queueing problem and
  // beginning to slow the few requests that do reach the backend fleet
  // (visible as backendUtilization edging up even though the fleet
  // itself does no more real work). Only reachable once no mitigation
  // above has matched.
  {
    id: "connection-pool-exhausted-baseline",
    when: {
      triggerEquals: { trafficGrowing: true, connectionPoolExhausting: true },
    },
    incidentState: "connection-pool-exhausted",
    values: {
      gatewayQueueDepth: 920,
      gatewayCpuUtilization: 99,
      backendUtilization: 18,
      gatewayConnectionCount: 6_000,
      downstreamLatencyMs: 340,
      customerLatencyMs: 4_100,
      gatewayStatus: "critical",
      gatewaySaturationHealth: "unresolved",
    },
    componentHealth: gatewayCriticalBackendDegradedHealth,
  },

  // ── Baseline critical: gateway traffic is growing against the
  // regressed per-request connection handling and verbose route table,
  // and the candidate has taken no meaningfully mitigating action yet.
  {
    id: "gateway-saturation-baseline",
    when: { triggerEquals: { trafficGrowing: true } },
    incidentState: "gateway-saturating",
    values: {
      gatewayQueueDepth: 480,
      gatewayCpuUtilization: 94,
      backendUtilization: 12,
      gatewayConnectionCount: 3_400,
      downstreamLatencyMs: 12,
      customerLatencyMs: 2_100,
      gatewayStatus: "critical",
      gatewaySaturationHealth: "unresolved",
    },
    componentHealth: gatewayCriticalBackendHealthyHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      gatewayQueueDepth: 0,
      gatewayCpuUtilization: 14,
      backendUtilization: 10,
      gatewayConnectionCount: 80,
      downstreamLatencyMs: 12,
      customerLatencyMs: 45,
      gatewayStatus: "normal",
      gatewaySaturationHealth: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
