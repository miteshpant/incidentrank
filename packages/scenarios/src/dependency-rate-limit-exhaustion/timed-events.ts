import type { TimedEvent } from "@incidentrank/simulator";

// The rolling quota window is 10 minutes. Draw-down begins at T=30s: the
// Aggregation Service's call volume against the third-party dependency
// starts consuming the window's quota faster than it can be expected to
// last. This is immediately observable (quotaRemainingPct falling,
// dependencyCallVolumePerMin elevated) well before any 429s occur.
const QUOTA_DRAWDOWN_MS = 30_000;

// Second wave: with no mitigation, sustained over-quota call volume
// finally drives the provider to start returning 429s. This is never a
// surprise flip — quotaRemainingPct has already been visibly falling for
// minutes beforehand, and dependency429RatePerMin is itself a
// candidate-visible metric the rules table drives upward from this point
// on for the unmitigated/harmful paths.
const PROVIDER_THROTTLING_MS = QUOTA_DRAWDOWN_MS + 4 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "quota-drawdown-begins",
    atMs: QUOTA_DRAWDOWN_MS,
    type: "TRIGGER_SET",
    message:
      "Call volume to the third-party dependency is climbing, and remaining quota for this rolling window is falling faster than the window's own pace would allow.",
    setTriggers: { quotaDrawingDown: true },
  },
  {
    id: "provider-throttling-begins",
    atMs: PROVIDER_THROTTLING_MS,
    type: "TRIGGER_SET",
    message:
      "The third-party dependency has started returning 429 Too Many Requests as the rolling window's quota approaches zero.",
    setTriggers: { quotaDrawingDown: true, providerThrottling: true },
  },
];

export { QUOTA_DRAWDOWN_MS, PROVIDER_THROTTLING_MS };
