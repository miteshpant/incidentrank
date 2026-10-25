import { computeMonthlyCost } from "./cost";
import { matchRule } from "./rules";
import { severityRank } from "./severity";
import { evaluateStateConditions } from "./conditions";
import type {
  ScenarioSimulationDefinition,
  SimulationEvent,
  SimulationState,
  StateValue,
} from "./types";

function nextEventId(state: SimulationState, suffix: string): string {
  return `evt-${state.simulationTimeMs}-${suffix}`;
}

/**
 * Advances the simulation by exactly one tick (one simulated second).
 * Pure function: given identical state + scenario definition, always
 * produces identical next state + events. Entirely scenario-agnostic —
 * every field name, threshold, and narrated message comes from the
 * scenario definition; this function has no built-in knowledge of
 * "checkout", "payment provider", "Kafka", or any other domain concept.
 */
export function tickOnce(
  scenario: ScenarioSimulationDefinition,
  state: SimulationState,
): { state: SimulationState; events: SimulationEvent[] } {
  const events: SimulationEvent[] = [];
  const nextTimeMs = state.simulationTimeMs + scenario.tickMs;

  let triggers = state.triggers;
  let incidentStartedAtMs = state.incidentStartedAtMs;
  let nextTimedEventIndex = state.transitions.nextTimedEventIndex;

  while (
    nextTimedEventIndex < scenario.timedEvents.length &&
    scenario.timedEvents[nextTimedEventIndex]!.atMs <= nextTimeMs
  ) {
    const timedEvent = scenario.timedEvents[nextTimedEventIndex]!;

    if (timedEvent.setTriggers) {
      triggers = { ...triggers, ...timedEvent.setTriggers };
      // By convention, the first timed event that sets any trigger true
      // marks incident start — generalizing the old
      // setProviderDegraded-specific check.
      if (
        incidentStartedAtMs === null &&
        Object.values(timedEvent.setTriggers).some(Boolean)
      ) {
        incidentStartedAtMs = timedEvent.atMs;
      }
    }

    events.push({
      id: timedEvent.id,
      timestampMs: timedEvent.atMs,
      type: timedEvent.type,
      message: timedEvent.message,
    });

    nextTimedEventIndex += 1;
  }

  const matched = matchRule(scenario.rules, triggers, state.controlValues);
  const values: Record<string, StateValue> = matched
    ? matched.values
    : scenario.initialValues;
  const componentHealth = matched
    ? matched.componentHealth
    : scenario.initialComponentHealth;
  const incidentState = matched ? matched.incidentState : "healthy";

  // Revenue loss accrues per authored rate for the current incident state,
  // pro-rated for one tick.
  const ratePerMinute = scenario.revenueLossRatePerMinute[incidentState] ?? 0;
  const revenueLossUsd =
    state.customerImpact.revenueLossUsd +
    (ratePerMinute * scenario.tickMs) / 60_000;

  const currentSeverityRank = severityRank(scenario.severityFields, values);
  const totalTimeInCriticalMs =
    state.customerImpact.totalTimeInCriticalMs +
    (currentSeverityRank >= 2 ? scenario.tickMs : 0);
  const totalTimeInDegradedMs =
    state.customerImpact.totalTimeInDegradedMs +
    (currentSeverityRank === 1 ? scenario.tickMs : 0);

  const currentMonthlyCostUsd = computeMonthlyCost(
    scenario.infrastructureCost,
    state.controlValues,
  );

  // ── Success / failure sustain tracking ────────────────────────────────
  // This sustain-window bookkeeping runs every tick regardless of
  // completion mode. A sustained successCondition is NEVER auto-written
  // to status="resolved" here — the engine may only ever mark an attempt
  // "failed" automatically. Reaching success just accumulates
  // consecutiveSuccessSeconds/consecutiveAcceptableSeconds; finishAttempt
  // (server-side) reads this exact same tracked state when the candidate
  // explicitly clicks Finish, rather than re-implementing success
  // evaluation a second time. See docs/implementation_plan/
  // phase7.action.md's core doctrine: "The system may fail a candidate
  // automatically, but it must never pass a candidate automatically."
  const acceptableCondition = scenario.completion?.acceptableCondition;

  const meetsSuccess =
    incidentStartedAtMs !== null &&
    evaluateStateConditions(scenario.successCondition.conditions, values, triggers);

  const meetsFailure =
    incidentStartedAtMs !== null &&
    evaluateStateConditions(scenario.failureCondition.conditions, values, triggers);

  const meetsAcceptable =
    incidentStartedAtMs !== null &&
    acceptableCondition !== undefined &&
    evaluateStateConditions(acceptableCondition.conditions, values, triggers);

  const consecutiveSuccessSeconds = meetsSuccess
    ? state.transitions.consecutiveSuccessSeconds + scenario.tickMs / 1000
    : 0;
  const consecutiveFailureSeconds = meetsFailure
    ? state.transitions.consecutiveFailureSeconds + scenario.tickMs / 1000
    : 0;
  const consecutiveAcceptableSeconds = meetsAcceptable
    ? state.transitions.consecutiveAcceptableSeconds + scenario.tickMs / 1000
    : 0;

  let status = state.status;
  const resolvedAtMs = state.resolvedAtMs;
  let failedAtMs = state.failedAtMs;

  if (status !== "resolved" && status !== "failed") {
    if (
      incidentStartedAtMs !== null &&
      consecutiveFailureSeconds >= scenario.failureCondition.sustainedSeconds
    ) {
      // Failure is always automatic, in every completion mode — a
      // candidate cannot stay in an attempt past a true failure condition
      // merely by not having clicked Finish (docs/implementation_plan/
      // phase6.1.md's "Failure Remains Automatic").
      status = "failed";
      failedAtMs = nextTimeMs;
      events.push({
        id: nextEventId(state, "incident-failed"),
        timestampMs: nextTimeMs,
        type: "INCIDENT_FAILED",
        message: "Incident failed: failure condition remained true.",
      });
    } else if (incidentStartedAtMs === null) {
      status = "healthy";
    } else if (currentSeverityRank >= 2) {
      status = "critical";
    } else {
      status = "degraded";
    }
  }

  if (status !== state.status) {
    events.push({
      id: nextEventId(state, "status-changed"),
      timestampMs: nextTimeMs,
      type: "STATUS_CHANGED",
      message: `Status changed from ${state.status} to ${status}.`,
      metadata: { previousStatus: state.status, newStatus: status },
    });
  }

  // ── Severity-field crossing narration (author-declared, generic) ──────
  const severityAnnounced: Record<string, boolean> = {};
  for (const field of scenario.severityFields) {
    const value = values[field.key];
    const isCritical = value === "critical";
    severityAnnounced[field.key] = isCritical;

    if (!field.announceCritical) continue;
    const wasCritical = state.transitions.severityAnnounced[field.key] ?? false;

    if (isCritical && !wasCritical) {
      events.push({
        id: nextEventId(state, `severity-${field.key}-critical`),
        timestampMs: nextTimeMs,
        type: field.announceCritical.enteringType,
        message: field.announceCritical.enteringMessage,
      });
    } else if (!isCritical && wasCritical) {
      events.push({
        id: nextEventId(state, `severity-${field.key}-recovered`),
        timestampMs: nextTimeMs,
        type: field.announceCritical.recoveringType,
        message: field.announceCritical.recoveringMessage,
      });
    }
  }

  // ── Numeric watch-field peak tracking + threshold narration ───────────
  const peakValues: Record<string, number> = { ...state.peaks.peakValues };
  const thresholdAnnounced: Record<string, boolean> = {};
  for (const field of scenario.numericWatchFields) {
    const rawValue = values[field.key];
    const value = typeof rawValue === "number" ? rawValue : 0;

    if (field.trackPeak) {
      peakValues[field.key] = Math.max(peakValues[field.key] ?? value, value);
    }

    if (!field.threshold) continue;
    const isOverThreshold = value >= field.threshold.value;
    thresholdAnnounced[field.key] = isOverThreshold;
    const wasOverThreshold = state.transitions.thresholdAnnounced[field.key] ?? false;

    if (isOverThreshold && !wasOverThreshold) {
      events.push({
        id: nextEventId(state, `threshold-${field.key}-crossed`),
        timestampMs: nextTimeMs,
        type: field.threshold.enteringType,
        message: field.threshold.enteringMessage,
      });
    } else if (!isOverThreshold && wasOverThreshold) {
      events.push({
        id: nextEventId(state, `threshold-${field.key}-recovered`),
        timestampMs: nextTimeMs,
        type: field.threshold.recoveringType,
        message: field.threshold.recoveringMessage,
      });
    }
  }

  const peakSeverityRank = Math.max(state.peaks.peakSeverityRank, currentSeverityRank);
  const peakMonthlyCostUsd = Math.max(state.peaks.peakMonthlyCostUsd, currentMonthlyCostUsd);

  return {
    state: {
      ...state,
      simulationTimeMs: nextTimeMs,
      status,
      incidentStartedAtMs,
      resolvedAtMs,
      failedAtMs,
      values,
      componentHealth,
      triggers,
      customerImpact: {
        revenueLossUsd,
        totalTimeInCriticalMs,
        totalTimeInDegradedMs,
      },
      cost: { currentMonthlyCostUsd },
      transitions: {
        matchedRuleId: matched ? matched.id : null,
        incidentState,
        consecutiveSuccessSeconds,
        consecutiveFailureSeconds,
        consecutiveAcceptableSeconds,
        severityAnnounced,
        thresholdAnnounced,
        nextTimedEventIndex,
      },
      peaks: {
        peakSeverityRank,
        peakValues,
        peakMonthlyCostUsd,
      },
    },
    events,
  };
}
