import type { TimedEvent } from "@incidentrank/simulator";

/** The shared dependency's regional divergence begins — not sequentially,
 * but all at once: US stays healthy, EU goes slow, APAC starts
 * intermittently failing. */
const REGIONAL_DIVERGENCE_MS = 30_000;

/** A second wave: APAC's intermittent failures, left unmitigated, grow
 * from intermittent into sustained — but only as the continuation of an
 * already-visible trend (apacSuccessRate has already been degraded and
 * apacDependencyHealth has already been "critical" since
 * REGIONAL_DIVERGENCE_MS), never a surprise flip from a healthy-looking
 * state. */
const APAC_WORSENING_MS = REGIONAL_DIVERGENCE_MS + 2 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "regional-dependency-divergence",
    atMs: REGIONAL_DIVERGENCE_MS,
    type: "TRIGGER_SET",
    message:
      "The shared dependency is behaving differently by region: US calls are healthy, EU calls are running slow, and APAC calls are intermittently failing.",
    setTriggers: { regionalDivergence: true },
  },
  {
    id: "apac-failures-worsening",
    atMs: APAC_WORSENING_MS,
    type: "TRIGGER_SET",
    message:
      "APAC's intermittent dependency failures have grown more frequent, now affecting the majority of APAC calls.",
    setTriggers: { regionalDivergence: true, apacWorsening: true },
  },
];

export { REGIONAL_DIVERGENCE_MS, APAC_WORSENING_MS };
