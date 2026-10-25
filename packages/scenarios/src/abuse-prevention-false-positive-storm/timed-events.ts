import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: the bad detection-rule version's false-positive
// blocking becomes visible. Real abusive traffic is present from this
// same moment onward (it was already in the mix beforehand) — the
// detection rule did not create the abuse, it only ALSO started
// blocking legitimate users.
export const FALSE_POSITIVE_ONSET_MS = 30_000;

// If left unaddressed this long, the false-positive blocking has
// compounded (more legitimate users accumulate into the blocked
// population the longer the bad rule stays live).
export const SUSTAINED_FALSE_POSITIVES_MS = FALSE_POSITIVE_ONSET_MS + 4 * 60_000;

// Enough investigation/triage time for a corrected rule version
// ("v3-patched") to actually exist as an option — modeling real
// diagnosis time, not an instantly-available forward-fix. Before this
// point, v3-patched is not yet a meaningful choice (see rules.ts: the
// control technically accepts the value early, but the only genuinely
// different, safe resolution reachable before this point is the
// rollback to v1-stable or the false-positive exemption).
export const PATCHED_RULE_AVAILABLE_MS = FALSE_POSITIVE_ONSET_MS + 6 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "false-positive-onset",
    atMs: FALSE_POSITIVE_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "The newly deployed detection rule (v2) has begun blocking a significant population of legitimate users as false positives. Real abusive traffic, already present before this change, continues at its ongoing baseline rate.",
    setTriggers: { falsePositivesActive: true },
  },
  {
    id: "sustained-false-positives",
    atMs: SUSTAINED_FALSE_POSITIVES_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "The false-positive blocking has compounded: a materially larger population of legitimate users has now been affected the longer the faulty rule has stayed live.",
    setTriggers: { falsePositivesActive: true, sustainedFalsePositives: true },
  },
  {
    id: "patched-rule-available",
    atMs: PATCHED_RULE_AVAILABLE_MS,
    type: "TRIGGER_SET",
    message:
      "Investigation has produced a corrected detection-rule version (v3) that preserves real abuse detection without the v2 over-match defect.",
    setTriggers: {
      falsePositivesActive: true,
      sustainedFalsePositives: true,
      patchedRuleAvailable: true,
    },
  },
];
