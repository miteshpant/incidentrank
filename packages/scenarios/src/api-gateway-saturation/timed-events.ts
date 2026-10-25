import type { TimedEvent } from "@incidentrank/simulator";

const TRAFFIC_GROWTH_MS = 30_000;
// A second wave: sustained gateway CPU saturation finally exhausts the
// gateway's own upstream connection pool (every request opening a new
// connection per request, never reused), driving gatewayConnectionCount
// to its ceiling and producing queueing delay serious enough to start
// slowing the handful of requests that do reach the backend fleet —
// but only as the continuation of an already-visible trend
// (gatewayQueueDepth, gatewayCpuUtilization, and gatewayConnectionCount
// have all been climbing since TRAFFIC_GROWTH_MS), never a surprise
// flip from a healthy-looking state. A candidate watching
// gatewayConnectionCount and gatewayQueueDepth climb has every reason
// to expect this.
const CONNECTION_EXHAUSTION_MS = TRAFFIC_GROWTH_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "gateway-traffic-growing",
    atMs: TRAFFIC_GROWTH_MS,
    type: "TRIGGER_SET",
    message:
      "Request volume through the API gateway is climbing, and gateway CPU utilization and queue depth are rising with it even though the service fleet behind it stays idle.",
    setTriggers: { trafficGrowing: true },
  },
  {
    id: "gateway-connection-pool-exhausting",
    atMs: CONNECTION_EXHAUSTION_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained per-request connection churn has driven the gateway's own connection count to its ceiling; requests are now queueing long enough that downstream latency is starting to climb too.",
    setTriggers: { trafficGrowing: true, connectionPoolExhausting: true },
  },
];

export { TRAFFIC_GROWTH_MS, CONNECTION_EXHAUSTION_MS };
