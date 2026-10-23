import type { TimedEvent } from "@incidentrank/simulator";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const DEPENDENCY_DEGRADES_MS = 45 * SECOND_MS;
// A deliberate second escalation: if the candidate has left retries
// unbounded and the DLQ disabled, the dependency's own error rate worsens
// further under the sustained retry pressure it is receiving — not a
// hidden surprise, but the authored continuation of a trend the candidate
// can already see rising in queueDepth/retryRatePerMinute well before this
// fires (observable-evidence rule, phase6b.md section 7). A candidate who
// bounded retries and enabled the DLQ before this point never reaches the
// trigger-gated worsening rule at all, since the dependency is no longer
// receiving amplified traffic.
export const DEPENDENCY_WORSENS_MS = DEPENDENCY_DEGRADES_MS + 3 * MINUTE_MS;

export const timedEvents: TimedEvent[] = [
  {
    id: "dependency-degrades",
    atMs: DEPENDENCY_DEGRADES_MS,
    type: "TRIGGER_SET",
    message:
      "The downstream dependency has become partially unhealthy — a rising share of its requests are failing or timing out.",
    setTriggers: { dependencyDegraded: true },
  },
  {
    id: "dependency-worsens",
    atMs: DEPENDENCY_WORSENS_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained retry volume against the still-degraded dependency has pushed its error rate even higher.",
    setTriggers: { dependencyDegraded: true, dependencyWorsened: true },
  },
];
