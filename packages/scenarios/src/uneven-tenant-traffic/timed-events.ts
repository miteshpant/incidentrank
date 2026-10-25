import type { TimedEvent } from "@incidentrank/simulator";

const HOT_TENANT_TRAFFIC_RISING_MS = 30_000;
// A second wave: the hot tenant's batch workload keeps running at full
// volume, and sustained unmitigated pressure on the shared data layer
// finally pushes it toward saturation — but only as the continuation of
// an already-visible trend (hotTenantQps, sharedDataLayerUtilizationPct,
// and otherTenantLatencyMs have already been climbing since
// HOT_TENANT_TRAFFIC_RISING_MS), never a surprise flip from a
// healthy-looking state. A candidate watching those three metrics climb
// has every reason to expect this.
const DATA_LAYER_SATURATING_MS = HOT_TENANT_TRAFFIC_RISING_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "hot-tenant-traffic-rising",
    atMs: HOT_TENANT_TRAFFIC_RISING_MS,
    type: "TRIGGER_SET",
    message:
      "One tenant's request volume is climbing sharply, and other tenants sharing the same fleet and data layer are seeing their own latency rise with it.",
    setTriggers: { hotTenantTrafficRising: true },
  },
  {
    id: "shared-data-layer-saturating",
    atMs: DATA_LAYER_SATURATING_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained load from the hot tenant's traffic has driven the shared data layer close to its ceiling; other tenants' requests are now queueing behind it.",
    setTriggers: { hotTenantTrafficRising: true, dataLayerSaturating: true },
  },
];

export { HOT_TENANT_TRAFFIC_RISING_MS, DATA_LAYER_SATURATING_MS };
