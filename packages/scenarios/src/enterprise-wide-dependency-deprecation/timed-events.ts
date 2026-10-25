import type { TimedEvent } from "@incidentrank/simulator";

// ─────────────────────────────────────────────────────────────────────────
// Deterministic simulated deadline phases (batch-defining requirement 4):
// every checkpoint below is an authored elapsed-millisecond timed event,
// exactly like every other built-in scenario's recovery-lag windows —
// just labeled to read as calendar/deadline phases in the candidate-
// facing timeline strings below. No wall-clock dependency, no new engine
// capability: tickOnce (packages/simulator/src/tick.ts) walks this array
// via a monotonically-increasing index pointer in ARRAY ORDER — it never
// sorts by atMs — so every entry below is deliberately laid out in
// strictly ascending atMs order already.
// ─────────────────────────────────────────────────────────────────────────

// Incident start: candidates see the real, mixed migration starting
// point immediately (see metrics.ts/rules.ts) — Product A migrated but
// never verified, Product B partially migrated, Product C blocked on a
// real compatibility issue, Product D untouched. Every live traffic
// metric reads healthy; nothing fails a request yet.
export const PHASE_T30D_MS = 20_000;

// T-14 days: still plenty of runway. Nothing forces action yet — this is
// deliberately the window where the "wait, dashboards are green" trap is
// most tempting.
export const PHASE_T14D_MS = PHASE_T30D_MS + 2 * 60_000;

// ── Recovery-lag windows (batch requirement: at least 2 of 3; this
// scenario genuinely gates all three) — anchored off the phase
// checkpoints above/below so every one is reachable regardless of which
// controls a candidate sets, exactly like a sibling scenario's drain
// windows. ──────────────────────────────────────────────────────────────

// Verification convergence: once a product is set to "migrate" under
// migrationVerificationMode="verify-before-complete", it takes real
// elapsed time for the compatibility/correctness checks to actually
// finish — flipping the controls does not instantly produce a verified
// product.
export const VERIFICATION_WINDOW_MS = 90_000;
export const VERIFICATION_WINDOW_ELAPSED_MS = PHASE_T14D_MS + VERIFICATION_WINDOW_MS;

// T-7 days: deadline risk should now read "elevated" for any product
// that is not yet migrated-and-verified, regardless of how healthy live
// traffic looks.
export const PHASE_T7D_MS = VERIFICATION_WINDOW_ELAPSED_MS + 30_000;

// Compatibility convergence: once the Compatibility Layer is activated,
// it takes real elapsed time for Product C's specific compatibility
// exceptions against the Replacement API to actually clear.
export const COMPATIBILITY_CONVERGENCE_WINDOW_MS = 60_000;
export const COMPATIBILITY_CONVERGENCE_WINDOW_ELAPSED_MS = PHASE_T7D_MS + COMPATIBILITY_CONVERGENCE_WINDOW_MS;

// Traffic-drain convergence: once replacementTrafficPercent reaches 100,
// it takes real elapsed time for deprecatedApiTrafficPercent to actually
// drain to 0 and for replacementApiErrorRate to settle to its healthy
// floor — an instant flip does not instantly converge live traffic.
export const TRAFFIC_DRAIN_WINDOW_MS = 75_000;
export const TRAFFIC_DRAIN_WINDOW_ELAPSED_MS = COMPATIBILITY_CONVERGENCE_WINDOW_ELAPSED_MS + TRAFFIC_DRAIN_WINDOW_MS;

// T-48 hours: deadline risk escalates to "critical" for any product not
// yet migrated-and-verified. This is the phase where deadline-escalation
// panic (forced-cutover) becomes most tempting.
export const PHASE_T48H_MS = TRAFFIC_DRAIN_WINDOW_ELAPSED_MS + 60_000;

// T-12 hours: final warning phase before the hard cutover.
export const PHASE_T12H_MS = PHASE_T48H_MS + 60_000;

// The hard deadline itself: the Deprecated External API is EXTERNALLY
// retired at this instant, unconditionally, regardless of any candidate
// control. Any product still depending on it (directly, or indirectly
// through an unmigrated Shared SDK path) breaks for real the moment this
// fires — this is the external fact the whole scenario is organized
// around, not a candidate-controllable event.
export const DEADLINE_MS = PHASE_T12H_MS + 60_000;

// ── Debt-linger checkpoints (used ONLY in combination with a candidate
// having left a temporary lever on — see rules.ts's "*-debt-lingering"
// family) ───────────────────────────────────────────────────────────────
// These fire unconditionally on wall-clock, exactly like every other
// timed event here; they are what makes "Compatibility Layer left active
// forever" / "dual-support left enabled forever" a REAL, elapsed-time-
// gated consequence rather than an instant judgment the moment the lever
// is touched — mirroring every sibling scenario's recovery-lag
// discipline, applied in the opposite direction (a penalty for NOT
// winding a temporary lever back down after it is no longer needed,
// instead of a reward for waiting out a drain).
export const COMPATIBILITY_LAYER_LINGER_WINDOW_MS = DEADLINE_MS + 2 * 60_000;
export const DUAL_SUPPORT_LINGER_WINDOW_MS = COMPATIBILITY_LAYER_LINGER_WINDOW_MS + 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "phase-t30d",
    atMs: PHASE_T30D_MS,
    type: "TRIGGER_SET",
    message:
      "DEADLINE PROGRESSION: T-30 days. The Deprecated External API's hard deprecation deadline is now 30 days out. Current migration state: Product A reports migrated (never independently verified), Product B partially migrated, Product C blocked by a known compatibility issue with the Replacement API, Product D untouched. Every live traffic/error/latency metric currently reads fully healthy — this is a governance and sequencing problem, not an outage.",
    setTriggers: { deadlineAnnounced: true },
  },
  {
    id: "phase-t14d",
    atMs: PHASE_T14D_MS,
    type: "TRIGGER_SET",
    message: "DEADLINE PROGRESSION: T-14 days. 14 days remain before the Deprecated External API is retired.",
    setTriggers: { deadlineAnnounced: true, t14dElapsed: true },
  },
  {
    id: "verification-window-elapsed",
    atMs: VERIFICATION_WINDOW_ELAPSED_MS,
    type: "TRIGGER_SET",
    message:
      "ELAPSED RECOVERY: enough time has elapsed for an in-progress compatibility/correctness verification pass to have genuinely finished.",
    setTriggers: { deadlineAnnounced: true, t14dElapsed: true, verificationWindowElapsed: true },
  },
  {
    id: "phase-t7d",
    atMs: PHASE_T7D_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "DEADLINE PROGRESSION: T-7 days. Deadline risk is now elevated for any product that is not yet migrated-and-verified — every live dashboard can still read green while this risk quietly compounds.",
    setTriggers: { deadlineAnnounced: true, t14dElapsed: true, t7dElapsed: true, verificationWindowElapsed: true },
  },
  {
    id: "compatibility-convergence-window-elapsed",
    atMs: COMPATIBILITY_CONVERGENCE_WINDOW_ELAPSED_MS,
    type: "TRIGGER_SET",
    message:
      "ELAPSED RECOVERY: enough time has elapsed for Product C's compatibility exceptions against the Replacement API to fully clear once the Compatibility Layer is active.",
    setTriggers: {
      deadlineAnnounced: true,
      t14dElapsed: true,
      t7dElapsed: true,
      verificationWindowElapsed: true,
      compatibilityConvergenceWindowElapsed: true,
    },
  },
  {
    id: "traffic-drain-window-elapsed",
    atMs: TRAFFIC_DRAIN_WINDOW_ELAPSED_MS,
    type: "TRIGGER_SET",
    message:
      "ELAPSED RECOVERY: enough time has elapsed for a staged Replacement-API traffic shift to fully drain the deprecated path.",
    setTriggers: {
      deadlineAnnounced: true,
      t14dElapsed: true,
      t7dElapsed: true,
      verificationWindowElapsed: true,
      compatibilityConvergenceWindowElapsed: true,
      trafficDrainWindowElapsed: true,
    },
  },
  {
    id: "phase-t48h",
    atMs: PHASE_T48H_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "DEADLINE PROGRESSION: T-48 hours. Deadline risk is now critical for any product that is not yet migrated-and-verified. Forcing an immediate cutover now, before every critical product is ready, trades a visible risk for a guaranteed outage.",
    setTriggers: {
      deadlineAnnounced: true,
      t14dElapsed: true,
      t7dElapsed: true,
      t48hElapsed: true,
      verificationWindowElapsed: true,
      compatibilityConvergenceWindowElapsed: true,
      trafficDrainWindowElapsed: true,
    },
  },
  {
    id: "phase-t12h",
    atMs: PHASE_T12H_MS,
    type: "THRESHOLD_CROSSED",
    message: "DEADLINE PROGRESSION: T-12 hours. Final warning phase before the Deprecated External API is externally retired.",
    setTriggers: {
      deadlineAnnounced: true,
      t14dElapsed: true,
      t7dElapsed: true,
      t48hElapsed: true,
      t12hElapsed: true,
      verificationWindowElapsed: true,
      compatibilityConvergenceWindowElapsed: true,
      trafficDrainWindowElapsed: true,
    },
  },
  {
    id: "deadline-reached",
    atMs: DEADLINE_MS,
    type: "STATUS_CHANGED",
    message:
      "EXTERNAL PROGRESSION: the hard deprecation deadline has arrived. The Deprecated External API is now externally retired, unconditionally — any product still depending on it, directly or through an unmigrated Shared SDK path, breaks for real starting now, regardless of any candidate control.",
    setTriggers: {
      deadlineAnnounced: true,
      t14dElapsed: true,
      t7dElapsed: true,
      t48hElapsed: true,
      t12hElapsed: true,
      deadlineReached: true,
      verificationWindowElapsed: true,
      compatibilityConvergenceWindowElapsed: true,
      trafficDrainWindowElapsed: true,
    },
  },
  {
    id: "compatibility-layer-linger-window-elapsed",
    atMs: COMPATIBILITY_LAYER_LINGER_WINDOW_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "HISTORICAL CONSEQUENCE: enough time has elapsed past the hard deadline that a Compatibility Layer still left active is no longer a bridge — it is now unresolved technical debt in its own right.",
    setTriggers: {
      deadlineAnnounced: true,
      t14dElapsed: true,
      t7dElapsed: true,
      t48hElapsed: true,
      t12hElapsed: true,
      deadlineReached: true,
      verificationWindowElapsed: true,
      compatibilityConvergenceWindowElapsed: true,
      trafficDrainWindowElapsed: true,
      compatibilityLayerLingerWindowElapsed: true,
    },
  },
  {
    id: "dual-support-linger-window-elapsed",
    atMs: DUAL_SUPPORT_LINGER_WINDOW_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "HISTORICAL CONSEQUENCE: enough time has elapsed past the hard deadline that dual-support left enabled is no longer a temporary bridge — it is now indefinite hidden debt.",
    setTriggers: {
      deadlineAnnounced: true,
      t14dElapsed: true,
      t7dElapsed: true,
      t48hElapsed: true,
      t12hElapsed: true,
      deadlineReached: true,
      verificationWindowElapsed: true,
      compatibilityConvergenceWindowElapsed: true,
      trafficDrainWindowElapsed: true,
      compatibilityLayerLingerWindowElapsed: true,
      dualSupportLingerWindowElapsed: true,
    },
  },
];
