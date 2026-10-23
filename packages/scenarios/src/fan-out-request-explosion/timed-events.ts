import type { TimedEvent } from "@incidentrank/simulator";

// A request-path change ships, widening the product-detail response to
// call all five downstream services per request instead of a narrower
// previous set. Fan-out QPS rises immediately and visibly across the
// board.
const FAN_OUT_WIDENED_MS = 30_000;

// Service E (recommendation enrichment) begins degrading under the new
// load — but only as the continuation of an already-visible trend.
// serviceESaturationPercent and downstreamQpsServiceE have already been
// climbing since FAN_OUT_WIDENED_MS, so a candidate watching those two
// metrics has every reason to expect this, never a surprise flip from a
// healthy-looking state.
const SERVICE_E_DEGRADING_MS = FAN_OUT_WIDENED_MS + 45_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "fan-out-widened",
    atMs: FAN_OUT_WIDENED_MS,
    type: "TRIGGER_SET",
    message:
      "A request-path change now fans the product-detail request out to all five downstream services. Downstream QPS and aggregator latency are climbing across the board.",
    setTriggers: { fanOutWidened: true },
  },
  {
    id: "service-e-degrading",
    atMs: SERVICE_E_DEGRADING_MS,
    type: "TRIGGER_SET",
    message:
      "Service E (recommendation enrichment) is now responding slowly under the increased call volume. Its saturation and latency continue climbing on the same trend already visible for the last 45 seconds.",
    setTriggers: { fanOutWidened: true, serviceEDegraded: true },
  },
];

export { FAN_OUT_WIDENED_MS, SERVICE_E_DEGRADING_MS };
