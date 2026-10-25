import type { TimedEvent } from "@incidentrank/simulator";

// The Fraud Provider begins degrading on the path EU calls it over --
// EU risk checks start failing/timing out at an elevated rate while US
// risk checks (same provider, different regional path/latency budget)
// remain largely unaffected. This is the first, misleading symptom: it
// LOOKS like a Fraud Provider outage, but US's own calls to the same
// provider stay healthy, so the real root cause is EU's regional path
// to that dependency, not the provider globally.
const EU_DEPENDENCY_DEGRADED_MS = 30_000;

// Independently, cross-region ledger replication begins lagging --
// authored as a second, simultaneous root cause rather than a
// consequence of the EU dependency issue, consistent with
// phase6dsupport's "at least three things interact" requirement. This
// alone is mild; it becomes dangerous once write volume increases
// (e.g. from shifting EU traffic onto US capacity).
const REPLICATION_LAG_ONSET_MS = 45_000;

// Natural recovery window: if left alone, the EU dependency path
// recovers on its own schedule. This does not retroactively undo any
// correctness damage (divergent writes, bypassed fraud checks) that
// occurred while it was degraded.
const EU_DEPENDENCY_RECOVERED_MS = EU_DEPENDENCY_DEGRADED_MS + 6 * 60_000;

// Recovery-lag window (phase6dsupport.md section 14): ledger
// replication lag / settlement backlog do NOT clear the instant a
// candidate applies a correct mitigation. `catchUpWindowElapsed`
// fires a real, fixed number of simulated minutes after replication
// lag first became active. Rules.ts gates the fully-drained values on
// THIS trigger, not merely on the mitigating control being set -- so
// even a candidate who reacts immediately must observe a real,
// time-bounded "draining" state (lower pressure, nonzero backlog)
// before the fully-recovered numbers appear. A candidate who never
// relieves write pressure never reaches the drained values at all,
// regardless of how much real time passes (see rules.ts's
// catchUpWindowElapsed-gated rules, which still require safe control
// values to reach the fully-drained numbers).
const CATCHUP_WINDOW_ELAPSED_MS = REPLICATION_LAG_ONSET_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "eu-dependency-degraded",
    atMs: EU_DEPENDENCY_DEGRADED_MS,
    type: "TRIGGER_SET",
    message:
      "EU Risk Service calls to the Fraud Provider are failing/timing out at an elevated rate over the EU regional path. US calls to the same provider remain healthy.",
    setTriggers: { euDependencyDegraded: true },
  },
  {
    id: "replication-lag-onset",
    atMs: REPLICATION_LAG_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "Cross-region ledger replication from US to the EU Ledger Replica has begun lagging behind the write stream.",
    setTriggers: { euDependencyDegraded: true, replicationLagActive: true },
  },
  // NOTE: ordered strictly by ascending atMs -- tickOnce processes
  // timedEvents purely by array position (scenario.timedEvents[index]),
  // never by sorting atMs itself, so an out-of-order array would
  // silently stall later (chronologically-earlier) events behind an
  // earlier-indexed-but-later-firing one.
  {
    id: "catchup-window-elapsed",
    atMs: CATCHUP_WINDOW_ELAPSED_MS,
    type: "TRIGGER_SET",
    message:
      "Enough time has passed for replication/settlement catch-up to complete, provided write pressure has actually been brought back within safe bounds.",
    setTriggers: {
      replicationLagActive: true,
      catchUpWindowElapsed: true,
    },
  },
  {
    id: "eu-dependency-recovered",
    atMs: EU_DEPENDENCY_RECOVERED_MS,
    type: "TRIGGER_SET",
    message:
      "The EU regional path to the Fraud Provider has recovered. EU risk checks are succeeding at normal rates again.",
    setTriggers: {
      euDependencyDegraded: false,
      replicationLagActive: true,
      catchUpWindowElapsed: true,
    },
  },
];

export {
  EU_DEPENDENCY_DEGRADED_MS,
  REPLICATION_LAG_ONSET_MS,
  EU_DEPENDENCY_RECOVERED_MS,
  CATCHUP_WINDOW_ELAPSED_MS,
};
