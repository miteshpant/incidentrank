// ─────────────────────────────────────────────────────────────────────────
// The single shared pre-incident timing constant. Every built-in
// scenario's timedEvents[0] (the incident-onset trigger — see
// packages/simulator/src/runtime-view.ts's toRuntimeView() doc comment:
// "derived from the scenario's first timed event, which is by
// construction always the incident-start trigger") should set its atMs
// to this constant rather than an independently-authored local literal.
// Previously every scenario hardcoded its own onset value (84 at 30s, 26
// at 20s, a handful of outliers) with no shared source of truth — tuning
// "how long is the pre-incident countdown" meant editing 116+ files.
// Change this one value to retune the countdown for every scenario at
// once.
// ─────────────────────────────────────────────────────────────────────────

export const SECOND_MS = 1_000;
export const MINUTE_MS = 60 * SECOND_MS;

/** How long the candidate waits after Acknowledge before the incident
 * actually begins and controls unlock. */
export const INCIDENT_START_MS = 10 * SECOND_MS;
