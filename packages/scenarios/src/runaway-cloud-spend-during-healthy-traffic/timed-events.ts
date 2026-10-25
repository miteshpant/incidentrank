import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: a cost-anomaly alert fires. Nothing about customer
// traffic changes at this moment or at any point in this scenario — no
// outage, no traffic spike. This timed event represents EXTERNAL
// PROGRESSION ONLY: the finance/observability system noticing and
// surfacing a pre-existing condition, not a new technical failure.
export const COST_ANOMALY_DETECTED_MS = 20_000;

// If spend is left unaddressed this long, the elevated run-rate has
// now been sustained long enough to represent a real, material
// cumulative overspend, not a brief blip — a HISTORICAL/cost-
// accumulation marker, never an outage signal. Anchored BEFORE
// RIGHTSIZING_WINDOW_1_MS below so this timedEvents array stays in
// strictly ascending `atMs` order (tick.ts's nextTimedEventIndex is a
// simple forward-only pointer over this array — an out-of-order atMs
// would simply never fire, since the pointer never walks backward).
export const SUSTAINED_UNADDRESSED_MS = COST_ANOMALY_DETECTED_MS + 2 * 60_000;

// Rightsizing recovery-lag windows: once the candidate has engaged a
// genuine rightsizing lever (lowered the replica floor to a safe value,
// raised target utilization to balanced, or enabled batching), actual
// running instance count and therefore cost do not drop to the new
// target on the next tick — real infrastructure takes real elapsed
// time to drain down (existing instances finish in-flight work, scale-
// down cooldowns elapse, etc). These three triggers fire
// unconditionally on wall-clock atMs, exactly like every other timed
// event in this engine; rules.ts is what makes them meaningful only
// once a genuine rightsizing lever is actually engaged.
export const RIGHTSIZING_WINDOW_1_MS = COST_ANOMALY_DETECTED_MS + 3 * 60_000;
export const RIGHTSIZING_WINDOW_2_MS = COST_ANOMALY_DETECTED_MS + 6 * 60_000;
export const RIGHTSIZING_FULLY_DRAINED_MS = COST_ANOMALY_DETECTED_MS + 10 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "cost-anomaly-detected",
    atMs: COST_ANOMALY_DETECTED_MS,
    type: "TRIGGER_SET",
    message:
      "A cost-anomaly alert has fired: infrastructure spend is materially elevated versus the trailing baseline. Request latency, error rate, and throughput all remain fully healthy — this is an economic signal, not an availability incident.",
    setTriggers: { costAnomalyActive: true },
  },
  {
    id: "sustained-unaddressed-spend",
    atMs: SUSTAINED_UNADDRESSED_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "The elevated run-rate has now been sustained for a material, cumulative period — this is accumulated historical overspend, not a brief blip. Customer-facing metrics remain unaffected.",
    setTriggers: { costAnomalyActive: true, sustainedOverspend: true },
  },
  {
    id: "rightsizing-window-1-elapsed",
    atMs: RIGHTSIZING_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message:
      "A first rightsizing drain window has elapsed since any fleet-shrinking lever was engaged.",
    setTriggers: { rightsizingWindow1Elapsed: true },
  },
  {
    id: "rightsizing-window-2-elapsed",
    atMs: RIGHTSIZING_WINDOW_2_MS,
    type: "TRIGGER_SET",
    message: "A second rightsizing drain window has elapsed.",
    setTriggers: { rightsizingWindow1Elapsed: true, rightsizingWindow2Elapsed: true },
  },
  {
    id: "rightsizing-fully-drained-elapsed",
    atMs: RIGHTSIZING_FULLY_DRAINED_MS,
    type: "TRIGGER_SET",
    message:
      "Enough elapsed drain time has passed for a fully-engaged rightsizing lever to have brought running instance count down to its new, genuinely safe target.",
    setTriggers: {
      rightsizingWindow1Elapsed: true,
      rightsizingWindow2Elapsed: true,
      rightsizingFullyDrainedElapsed: true,
    },
  },
];
