import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  ANALYTICS_STORE_PROCESSING_KEY,
  BACKUP_INDEX_PROCESSING_MODE_KEY,
  COMPLETION_MARKING_POLICY_KEY,
  DELETION_WORKER_ALLOCATION_KEY,
  HIGH_RISK_PRIORITY_BOOST_KEY,
  QUEUE_PRIORITY_POLICY_KEY,
  RETRY_POLICY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "deletion-requests": "healthy",
  "privacy-api": "healthy",
  "workflow-queue": "healthy",
  "product-databases": "healthy",
  "analytics-store": "healthy",
  "backup-index": "healthy",
};

// Deletion Requests and Privacy API NEVER leave "healthy" in this
// scenario, in any rule, including every unsafe one — acceptance is
// never the problem. Only Workflow Queue and the three downstream
// fan-out nodes communicate severity, and only for the
// execution-completeness axis.
const falseCompleteHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "workflow-queue": "critical",
  "product-databases": "critical",
};

const analyticsSkippedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "workflow-queue": "critical",
  "analytics-store": "critical",
};

const backupUntrackedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "workflow-queue": "degraded",
  "backup-index": "critical",
};

const deadlineBreachHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "workflow-queue": "critical",
};

const draininHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "workflow-queue": "degraded",
};

/**
 * Authored rule table for Privacy Deletion Backlog, ordered
 * most-specific-first (first-match-wins, top-to-bottom). Every
 * correctness-violation trap is checked before the generic safe/
 * baseline families below it, because a live false-completion,
 * untracked-obligation, or deadline-breach violation is never
 * acceptable however healthy request acceptance looks.
 *
 * ROOT CAUSE: downstream deletion EXECUTION across the Workflow Queue's
 * fan-out (Product Databases, Analytics Store, Backup Index) falls
 * behind acceptance. requestAcceptanceSuccessRate never moves in ANY
 * rule below — per the brief, this must never look like a generic
 * availability incident. The central, defining trap is marking a
 * request "complete" before every required downstream store has
 * actually finished (completionMarkingPolicy="mark-on-accept").
 *
 * CENTRAL JUDGMENT (business invariants, see definition.ts): a request
 * must never be marked complete while a required downstream store
 * remains undeleted; every accepted request must eventually complete
 * across every required system; regulatory/policy deadlines matter and
 * must not be silently breached by a "process the easiest ones first"
 * strategy; backups/indexes may lag on their own rotation schedule but
 * that lag must always be explicitly tracked, never hidden.
 *
 * REQUIRED TEMPTING-BUT-UNSAFE TRAPS, each independent of the others:
 *   1. completionMarkingPolicy="mark-on-accept" (the PRIMARY trap, the
 *      scenario's defining lesson) — requests look done the instant
 *      they're accepted; nothing downstream has actually run yet.
 *   2. analyticsStoreProcessing="skipped" — looks like it clears the
 *      backlog faster (one fewer store to wait on); the Analytics Store
 *      obligation is never met for any request processed this way.
 *   3. backupIndexProcessingMode="excluded-from-completion" — does not
 *      by itself falsely complete anything, but makes the Backup Index
 *      obligation invisible/unauditable for in-flight requests.
 *   4. queuePriorityPolicy="newest-first" with no high-risk boost — the
 *      oldest, deadline-nearest requests silently breach their mandated
 *      deadline while newer, easier requests keep getting processed
 *      ahead of them.
 *
 * ALTERNATE STRONG PATHS (both reach OPTIMAL once genuinely engaged and
 * drained; see the alternate-strong-path audit in the completion
 * report):
 *   A. Oldest-deadline-first: queuePriorityPolicy="oldest-deadline-
 *      first" — directly drains the oldest/deadline-nearest requests
 *      first, preventing any deadline breach.
 *   B. High-risk-first + boost: queuePriorityPolicy="high-risk-first" +
 *      highRiskPriorityBoost="on" — prioritizes legal-class/high-risk
 *      requests specifically while keeping a bounded SLA for everything
 *      else, a genuinely different, also-valid prioritization strategy.
 *
 * deletionWorkerAllocation and retryPolicy are genuinely secondary
 * levers (recovery speed / cost), left at their untouched defaults
 * ("baseline"/"standard") by BOTH alternate strong paths above — every
 * rule representing either path below is therefore enumerated at both
 * values of each, so leaving either at its default never falls through
 * to an unrelated baseline/unsafe rule purely from elapsed time (the
 * batch's binding default-value path completeness requirement).
 */
export const privacyDeletionBacklogRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE CORRECTNESS TRAPS — checked first: win regardless of every
  // other control, because a live violation is never acceptable however
  // healthy request acceptance looks.
  // ══════════════════════════════════════════════════════════════════

  // Primary trap, sustained: mark-on-accept keeps falsely completing
  // requests the entire time the backlog persists.
  {
    id: "false-complete-sustained",
    when: {
      triggerEquals: { backlogForming: true, sustainedBacklog: true },
      controlEquals: { [COMPLETION_MARKING_POLICY_KEY]: "mark-on-accept" },
    },
    incidentState: "false-complete-sustained",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 420,
      oldestRequestAgeDays: 46,
      endToEndCompletionPercent: 58,
      productDbCompletionPercent: 70,
      analyticsStoreCompletionPercent: 65,
      backupIndexCompletionPercent: 60,
      deadlineRiskCount: 90,
      falseCompletionCount: 420,
      deadlineBreachedCount: 40,
      deletionWorkflowStatus: "false-complete-active",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "critical",
    },
    componentHealth: falseCompleteHealth,
  },
  {
    id: "false-complete-active",
    when: {
      triggerEquals: { backlogForming: true },
      controlEquals: { [COMPLETION_MARKING_POLICY_KEY]: "mark-on-accept" },
    },
    incidentState: "false-complete-active",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 120,
      oldestRequestAgeDays: 12,
      endToEndCompletionPercent: 78,
      productDbCompletionPercent: 85,
      analyticsStoreCompletionPercent: 82,
      backupIndexCompletionPercent: 80,
      deadlineRiskCount: 20,
      falseCompletionCount: 55,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "false-complete-active",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "critical",
    },
    componentHealth: falseCompleteHealth,
  },

  // Independent trap: skipping the Analytics Store entirely, even once
  // completion marking is correctly verified-only. Never reachable
  // "accidentally" through the primary trap alone — proves this is an
  // independent lever.
  {
    id: "analytics-store-skipped-trap",
    when: {
      triggerEquals: { backlogForming: true, sustainedBacklog: true },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "skipped",
      },
    },
    incidentState: "analytics-store-skipped-trap",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 95,
      oldestRequestAgeDays: 40,
      endToEndCompletionPercent: 60,
      productDbCompletionPercent: 100,
      analyticsStoreCompletionPercent: 0,
      backupIndexCompletionPercent: 95,
      deadlineRiskCount: 30,
      falseCompletionCount: 0,
      deadlineBreachedCount: 10,
      deletionWorkflowStatus: "backlog-draining",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "critical",
    },
    componentHealth: analyticsSkippedHealth,
  },

  // Independent trap: Backup Index obligations go untracked, even once
  // completion marking is correctly verified-only and Analytics Store
  // is correctly enforced. Never falsely completes anything, but
  // creates an invisible auditability gap.
  {
    id: "backup-index-untracked-trap",
    when: {
      triggerEquals: { backlogForming: true, sustainedBacklog: true },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "excluded-from-completion",
      },
    },
    incidentState: "backup-index-untracked-trap",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 95,
      oldestRequestAgeDays: 40,
      endToEndCompletionPercent: 70,
      productDbCompletionPercent: 100,
      analyticsStoreCompletionPercent: 100,
      backupIndexCompletionPercent: 0,
      deadlineRiskCount: 25,
      falseCompletionCount: 0,
      deadlineBreachedCount: 5,
      deletionWorkflowStatus: "untracked-gap-active",
      backupIndexTrackingStatus: "untracked",
      deletionIntegritySeverity: "critical",
    },
    componentHealth: backupUntrackedHealth,
  },

  // Independent trap: newest-first prioritization with no high-risk
  // boost, even once completion marking/analytics/backup-index are ALL
  // correctly configured — the oldest requests still silently breach
  // deadline because nothing reorders the queue to protect them.
  {
    id: "deadline-breach-newest-first-trap",
    when: {
      triggerEquals: { backlogForming: true, sustainedBacklog: true },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "newest-first",
        [HIGH_RISK_PRIORITY_BOOST_KEY]: "off",
      },
    },
    incidentState: "deadline-breach-newest-first-trap",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 95,
      oldestRequestAgeDays: 52,
      endToEndCompletionPercent: 72,
      productDbCompletionPercent: 80,
      analyticsStoreCompletionPercent: 78,
      backupIndexCompletionPercent: 85,
      deadlineRiskCount: 35,
      falseCompletionCount: 0,
      deadlineBreachedCount: 48,
      deletionWorkflowStatus: "deadline-breach-active",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "critical",
    },
    componentHealth: deadlineBreachHealth,
  },

  // Independent half-measure trap: turning highRiskPriorityBoost "on"
  // while the general queue strategy is still "newest-first" boosts
  // only the high-risk/legal-class subset — it does nothing for the
  // large majority of ordinary oldest requests, which still silently
  // breach deadline exactly as in the pure newest-first trap above.
  // Explicit so the authored consequence stays honest (completion
  // marking IS correctly verified here — zero false completions) rather
  // than falling through to the generic baseline, which would wrongly
  // author a false-completion count.
  {
    id: "deadline-breach-newest-first-with-boost-trap",
    when: {
      triggerEquals: { backlogForming: true, sustainedBacklog: true },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "newest-first",
        [HIGH_RISK_PRIORITY_BOOST_KEY]: "on",
      },
    },
    incidentState: "deadline-breach-newest-first-with-boost-trap",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 95,
      oldestRequestAgeDays: 50,
      endToEndCompletionPercent: 74,
      productDbCompletionPercent: 82,
      analyticsStoreCompletionPercent: 80,
      backupIndexCompletionPercent: 86,
      deadlineRiskCount: 28,
      falseCompletionCount: 0,
      deadlineBreachedCount: 36,
      deletionWorkflowStatus: "deadline-breach-active",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "critical",
    },
    componentHealth: deadlineBreachHealth,
  },

  // Independent half-measure trap: selecting "high-risk-first" as the
  // queue strategy WITHOUT also turning highRiskPriorityBoost "on" never
  // actually fast-tracks anything — the strategy name alone does not
  // reorder the queue; the boost control is what actually applies it
  // (see controls.ts's doc comment). Without this explicit rule, this
  // genuinely-incomplete combination would silently fall through to the
  // generic "did nothing" baseline below, which authors a false-
  // completion count that is NOT honest here (completion marking IS
  // correctly verified-only in this combination) — this rule exists so
  // the authored consequence of this exact half-measure is correct: a
  // real deadline-breach violation, but zero false completions.
  {
    id: "deadline-breach-high-risk-first-no-boost-trap",
    when: {
      triggerEquals: { backlogForming: true, sustainedBacklog: true },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "high-risk-first",
        [HIGH_RISK_PRIORITY_BOOST_KEY]: "off",
      },
    },
    incidentState: "deadline-breach-high-risk-first-no-boost-trap",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 95,
      oldestRequestAgeDays: 50,
      endToEndCompletionPercent: 73,
      productDbCompletionPercent: 81,
      analyticsStoreCompletionPercent: 79,
      backupIndexCompletionPercent: 85,
      deadlineRiskCount: 32,
      falseCompletionCount: 0,
      deadlineBreachedCount: 42,
      deletionWorkflowStatus: "deadline-breach-active",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "critical",
    },
    componentHealth: deadlineBreachHealth,
  },

  // Pre-sustained mirror of deadline-breach-newest-first-with-boost-trap
  // above: identical half-measure (newest-first general policy +
  // highRiskPriorityBoost "on" fast-tracks only the high-risk subset,
  // doing nothing for the ordinary-oldest majority), matched BEFORE
  // sustainedBacklog fires. Without this rule, this exact combination
  // during the routine pre-sustained window (every attempt passes
  // through it, not an edge case) would silently fall through every
  // sustained-gated rule above and both corrected-before-sustained
  // rules below (which require the fully-correct queue value, not this
  // half-measure) all the way to the unconstrained baseline-untouched
  // fallback — which would WRONGLY fabricate a false-completion count,
  // even though completionMarkingPolicy IS correctly verified-only here.
  // Authors the same honest consequence category as its sustained
  // sibling (a real, independent deadline-risk violation, zero false
  // completions), scaled down for the shorter elapsed exposure window.
  {
    id: "deadline-breach-newest-first-with-boost-pre-sustained-trap",
    when: {
      triggerEquals: { backlogForming: true, sustainedBacklog: false },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "newest-first",
        [HIGH_RISK_PRIORITY_BOOST_KEY]: "on",
      },
    },
    incidentState: "deadline-breach-newest-first-with-boost-pre-sustained-trap",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 25,
      oldestRequestAgeDays: 9,
      endToEndCompletionPercent: 88,
      productDbCompletionPercent: 91,
      analyticsStoreCompletionPercent: 90,
      backupIndexCompletionPercent: 93,
      deadlineRiskCount: 12,
      falseCompletionCount: 0,
      deadlineBreachedCount: 4,
      deletionWorkflowStatus: "deadline-breach-active",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "critical",
    },
    componentHealth: deadlineBreachHealth,
  },

  // Pre-sustained mirror of deadline-breach-high-risk-first-no-boost-trap
  // above: identical half-measure (selecting "high-risk-first" without
  // also turning highRiskPriorityBoost "on" never actually reorders the
  // queue — the strategy name alone does nothing), matched BEFORE
  // sustainedBacklog fires, for the same default-value-path-completeness
  // reason as its sibling immediately above. Authors the same honest
  // consequence category as its sustained sibling (a real, independent
  // deadline-risk violation, zero false completions), scaled down for
  // the shorter elapsed exposure window.
  {
    id: "deadline-breach-high-risk-first-no-boost-pre-sustained-trap",
    when: {
      triggerEquals: { backlogForming: true, sustainedBacklog: false },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "high-risk-first",
        [HIGH_RISK_PRIORITY_BOOST_KEY]: "off",
      },
    },
    incidentState: "deadline-breach-high-risk-first-no-boost-pre-sustained-trap",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 25,
      oldestRequestAgeDays: 9,
      endToEndCompletionPercent: 87,
      productDbCompletionPercent: 90,
      analyticsStoreCompletionPercent: 89,
      backupIndexCompletionPercent: 92,
      deadlineRiskCount: 14,
      falseCompletionCount: 0,
      deadlineBreachedCount: 5,
      deletionWorkflowStatus: "deadline-breach-active",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "critical",
    },
    componentHealth: deadlineBreachHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE FAMILY — completionMarkingPolicy verified-only + analytics
  // store enforced + backup index tracked + a real deadline-protecting
  // prioritization strategy (Path A or Path B), with
  // deletionWorkerAllocation/retryPolicy left untouched or scaled. Every
  // combination at each drain stage is enumerated explicitly so that
  // leaving deletionWorkerAllocation/retryPolicy at their untouched
  // defaults never falls through to an unrelated baseline/unsafe rule
  // purely from elapsed time — the batch's binding default-value path
  // completeness requirement.
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL: Path A (oldest-deadline-first), baseline workers,
  // standard retries — every secondary lever left at its untouched
  // default.
  {
    id: "fully-recovered-path-a-baseline-standard",
    when: {
      triggerEquals: { backlogForming: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "oldest-deadline-first",
        [DELETION_WORKER_ALLOCATION_KEY]: "baseline",
        [RETRY_POLICY_KEY]: "standard",
      },
    },
    incidentState: "fully-recovered-path-a-baseline-standard",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 0,
      oldestRequestAgeDays: 0,
      endToEndCompletionPercent: 100,
      productDbCompletionPercent: 100,
      analyticsStoreCompletionPercent: 100,
      backupIndexCompletionPercent: 100,
      deadlineRiskCount: 0,
      falseCompletionCount: 0,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "healthy",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL: Path A, scaled-up workers, aggressive retries — proves
  // the secondary levers are real (faster drain, see timed-events
  // reached earlier in practice / cost in revenue-and-cost.ts) without
  // being REQUIRED for safety.
  {
    id: "fully-recovered-path-a-scaled-aggressive",
    when: {
      triggerEquals: { backlogForming: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "oldest-deadline-first",
        [DELETION_WORKER_ALLOCATION_KEY]: "scaled-up",
        [RETRY_POLICY_KEY]: "aggressive",
      },
    },
    incidentState: "fully-recovered-path-a-scaled-aggressive",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 0,
      oldestRequestAgeDays: 0,
      endToEndCompletionPercent: 100,
      productDbCompletionPercent: 100,
      analyticsStoreCompletionPercent: 100,
      backupIndexCompletionPercent: 100,
      deadlineRiskCount: 0,
      falseCompletionCount: 0,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "healthy",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL: Path A, scaled-up workers only (retryPolicy left at its
  // untouched default "standard").
  {
    id: "fully-recovered-path-a-scaled-standard",
    when: {
      triggerEquals: { backlogForming: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "oldest-deadline-first",
        [DELETION_WORKER_ALLOCATION_KEY]: "scaled-up",
        [RETRY_POLICY_KEY]: "standard",
      },
    },
    incidentState: "fully-recovered-path-a-scaled-standard",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 0,
      oldestRequestAgeDays: 0,
      endToEndCompletionPercent: 100,
      productDbCompletionPercent: 100,
      analyticsStoreCompletionPercent: 100,
      backupIndexCompletionPercent: 100,
      deadlineRiskCount: 0,
      falseCompletionCount: 0,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "healthy",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL: Path A, baseline workers, aggressive retries only
  // (deletionWorkerAllocation left at its untouched default "baseline").
  {
    id: "fully-recovered-path-a-baseline-aggressive",
    when: {
      triggerEquals: { backlogForming: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "oldest-deadline-first",
        [DELETION_WORKER_ALLOCATION_KEY]: "baseline",
        [RETRY_POLICY_KEY]: "aggressive",
      },
    },
    incidentState: "fully-recovered-path-a-baseline-aggressive",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 0,
      oldestRequestAgeDays: 0,
      endToEndCompletionPercent: 100,
      productDbCompletionPercent: 100,
      analyticsStoreCompletionPercent: 100,
      backupIndexCompletionPercent: 100,
      deadlineRiskCount: 0,
      falseCompletionCount: 0,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "healthy",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL: Path B (high-risk-first + boost), baseline workers,
  // standard retries — every secondary lever left at its untouched
  // default. Without this rule (and its 3 sibling combinations below),
  // a candidate who used Path B while leaving deletionWorkerAllocation/
  // retryPolicy untouched would fall through every scaled/aggressive-
  // gated rule all the way to baseline — exactly the default-value
  // completeness bug this batch must avoid.
  {
    id: "fully-recovered-path-b-baseline-standard",
    when: {
      triggerEquals: { backlogForming: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "high-risk-first",
        [HIGH_RISK_PRIORITY_BOOST_KEY]: "on",
        [DELETION_WORKER_ALLOCATION_KEY]: "baseline",
        [RETRY_POLICY_KEY]: "standard",
      },
    },
    incidentState: "fully-recovered-path-b-baseline-standard",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 0,
      oldestRequestAgeDays: 0,
      endToEndCompletionPercent: 100,
      productDbCompletionPercent: 100,
      analyticsStoreCompletionPercent: 100,
      backupIndexCompletionPercent: 100,
      deadlineRiskCount: 0,
      falseCompletionCount: 0,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "healthy",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "fully-recovered-path-b-scaled-aggressive",
    when: {
      triggerEquals: { backlogForming: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "high-risk-first",
        [HIGH_RISK_PRIORITY_BOOST_KEY]: "on",
        [DELETION_WORKER_ALLOCATION_KEY]: "scaled-up",
        [RETRY_POLICY_KEY]: "aggressive",
      },
    },
    incidentState: "fully-recovered-path-b-scaled-aggressive",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 0,
      oldestRequestAgeDays: 0,
      endToEndCompletionPercent: 100,
      productDbCompletionPercent: 100,
      analyticsStoreCompletionPercent: 100,
      backupIndexCompletionPercent: 100,
      deadlineRiskCount: 0,
      falseCompletionCount: 0,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "healthy",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "fully-recovered-path-b-scaled-standard",
    when: {
      triggerEquals: { backlogForming: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "high-risk-first",
        [HIGH_RISK_PRIORITY_BOOST_KEY]: "on",
        [DELETION_WORKER_ALLOCATION_KEY]: "scaled-up",
        [RETRY_POLICY_KEY]: "standard",
      },
    },
    incidentState: "fully-recovered-path-b-scaled-standard",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 0,
      oldestRequestAgeDays: 0,
      endToEndCompletionPercent: 100,
      productDbCompletionPercent: 100,
      analyticsStoreCompletionPercent: 100,
      backupIndexCompletionPercent: 100,
      deadlineRiskCount: 0,
      falseCompletionCount: 0,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "healthy",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "fully-recovered-path-b-baseline-aggressive",
    when: {
      triggerEquals: { backlogForming: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "high-risk-first",
        [HIGH_RISK_PRIORITY_BOOST_KEY]: "on",
        [DELETION_WORKER_ALLOCATION_KEY]: "baseline",
        [RETRY_POLICY_KEY]: "aggressive",
      },
    },
    incidentState: "fully-recovered-path-b-baseline-aggressive",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 0,
      oldestRequestAgeDays: 0,
      endToEndCompletionPercent: 100,
      productDbCompletionPercent: 100,
      analyticsStoreCompletionPercent: 100,
      backupIndexCompletionPercent: 100,
      deadlineRiskCount: 0,
      falseCompletionCount: 0,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "healthy",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE tiers: a correct strategy (Path A or Path B) is
  // genuinely engaged — no live false-completion, no live deadline
  // breach, every store tracked — but the backlog has not yet fully
  // drained (still a nonzero backlog / completion percent below 100).
  // Each path is enumerated at this drain stage too, for the identical
  // default-value completeness reason as the OPTIMAL tier above.
  {
    id: "draining-window1-path-a",
    when: {
      triggerEquals: {
        backlogForming: true,
        sustainedBacklog: true,
        drainWindow1Elapsed: true,
        drainWindowFullyRecoveredElapsed: false,
      },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "oldest-deadline-first",
      },
    },
    incidentState: "draining-window1-path-a",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 60,
      oldestRequestAgeDays: 6,
      endToEndCompletionPercent: 88,
      productDbCompletionPercent: 92,
      analyticsStoreCompletionPercent: 90,
      backupIndexCompletionPercent: 90,
      deadlineRiskCount: 8,
      falseCompletionCount: 0,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "backlog-draining",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "warning",
    },
    componentHealth: draininHealth,
  },
  {
    id: "draining-window1-path-b",
    when: {
      triggerEquals: {
        backlogForming: true,
        sustainedBacklog: true,
        drainWindow1Elapsed: true,
        drainWindowFullyRecoveredElapsed: false,
      },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "high-risk-first",
        [HIGH_RISK_PRIORITY_BOOST_KEY]: "on",
      },
    },
    incidentState: "draining-window1-path-b",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 65,
      oldestRequestAgeDays: 7,
      endToEndCompletionPercent: 87,
      productDbCompletionPercent: 91,
      analyticsStoreCompletionPercent: 89,
      backupIndexCompletionPercent: 90,
      deadlineRiskCount: 6,
      falseCompletionCount: 0,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "backlog-draining",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "warning",
    },
    componentHealth: draininHealth,
  },

  // ── Just-engaged tick-zero proof: a correct strategy flipped this
  // instant (no elapsed drain window yet) — the backlog/completion
  // numbers are exactly what they are at the moment the fix landed,
  // proving the drain is not instant. Each rule requires ALL FOUR
  // correctness-critical controls (completionMarkingPolicy,
  // analyticsStoreProcessing, backupIndexProcessingMode, AND a real
  // deadline-protecting queue strategy) — exactly the same four gates
  // the unsafe traps above check independently — so a candidate who
  // fixed the first three but left queuePriorityPolicy at its unsafe
  // "newest-first" default is correctly caught by
  // deadline-breach-newest-first-trap above, never silently waved
  // through here. Deliberately has NO deletionWorkerAllocation/
  // retryPolicy constraint, since at tick-zero the backlog numbers
  // depend only on whether the correct strategy is engaged, never on
  // the secondary levers.
  {
    id: "just-corrected-no-drain-yet-path-a",
    when: {
      triggerEquals: {
        backlogForming: true,
        sustainedBacklog: true,
        drainWindow1Elapsed: false,
      },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "oldest-deadline-first",
      },
    },
    incidentState: "just-corrected-no-drain-yet",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 95,
      oldestRequestAgeDays: 40,
      endToEndCompletionPercent: 70,
      productDbCompletionPercent: 80,
      analyticsStoreCompletionPercent: 78,
      backupIndexCompletionPercent: 85,
      deadlineRiskCount: 20,
      falseCompletionCount: 0,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "backlog-draining",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "warning",
    },
    componentHealth: draininHealth,
  },
  {
    id: "just-corrected-no-drain-yet-path-b",
    when: {
      triggerEquals: {
        backlogForming: true,
        sustainedBacklog: true,
        drainWindow1Elapsed: false,
      },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "high-risk-first",
        [HIGH_RISK_PRIORITY_BOOST_KEY]: "on",
      },
    },
    incidentState: "just-corrected-no-drain-yet",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 95,
      oldestRequestAgeDays: 40,
      endToEndCompletionPercent: 70,
      productDbCompletionPercent: 80,
      analyticsStoreCompletionPercent: 78,
      backupIndexCompletionPercent: 85,
      deadlineRiskCount: 20,
      falseCompletionCount: 0,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "backlog-draining",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "warning",
    },
    componentHealth: draininHealth,
  },

  // ── Corrected before sustained-backlog even fires (fast candidate
  // reaction) — same four-gate correctness check as above, but matched
  // before the sustained-exposure window, so the false-completion/
  // backlog numbers are much smaller. Deliberately placed after every
  // sustained-gated safe rule above (more specific trigger set wins)
  // but before the generic unmitigated baseline below.
  {
    id: "corrected-before-sustained-path-a",
    when: {
      triggerEquals: { backlogForming: true },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "oldest-deadline-first",
      },
    },
    incidentState: "corrected-before-sustained",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 25,
      oldestRequestAgeDays: 3,
      endToEndCompletionPercent: 90,
      productDbCompletionPercent: 93,
      analyticsStoreCompletionPercent: 92,
      backupIndexCompletionPercent: 94,
      deadlineRiskCount: 2,
      falseCompletionCount: 0,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "backlog-draining",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "warning",
    },
    componentHealth: draininHealth,
  },
  {
    id: "corrected-before-sustained-path-b",
    when: {
      triggerEquals: { backlogForming: true },
      controlEquals: {
        [COMPLETION_MARKING_POLICY_KEY]: "mark-on-verified-complete",
        [ANALYTICS_STORE_PROCESSING_KEY]: "enforced",
        [BACKUP_INDEX_PROCESSING_MODE_KEY]: "tracked-pending",
        [QUEUE_PRIORITY_POLICY_KEY]: "high-risk-first",
        [HIGH_RISK_PRIORITY_BOOST_KEY]: "on",
      },
    },
    incidentState: "corrected-before-sustained",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 25,
      oldestRequestAgeDays: 3,
      endToEndCompletionPercent: 90,
      productDbCompletionPercent: 93,
      analyticsStoreCompletionPercent: 92,
      backupIndexCompletionPercent: 94,
      deadlineRiskCount: 2,
      falseCompletionCount: 0,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "backlog-draining",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "warning",
    },
    componentHealth: draininHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // NO MITIGATION — completionMarkingPolicy left "mark-on-accept" is
  // already caught above; this baseline covers the case where it is
  // correctly verified BUT the queue strategy was never updated at all
  // (still "newest-first"/"off", the untouched defaults) once sustained
  // — functionally identical to deadline-breach-newest-first-trap
  // above, included here as the generic "did nothing at all" baseline
  // for completeness/symmetry with every other Phase 6E sibling's rule
  // table shape, reachable when backlogForming is true but
  // sustainedBacklog has not yet fired.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "baseline-sustained-untouched",
    when: { triggerEquals: { backlogForming: true, sustainedBacklog: true } },
    incidentState: "baseline-sustained-untouched",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 420,
      oldestRequestAgeDays: 46,
      endToEndCompletionPercent: 58,
      productDbCompletionPercent: 70,
      analyticsStoreCompletionPercent: 65,
      backupIndexCompletionPercent: 60,
      deadlineRiskCount: 90,
      falseCompletionCount: 420,
      deadlineBreachedCount: 40,
      deletionWorkflowStatus: "false-complete-active",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "critical",
    },
    componentHealth: falseCompleteHealth,
  },
  {
    id: "baseline-untouched",
    when: { triggerEquals: { backlogForming: true } },
    incidentState: "baseline-untouched",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 120,
      oldestRequestAgeDays: 12,
      endToEndCompletionPercent: 78,
      productDbCompletionPercent: 85,
      analyticsStoreCompletionPercent: 82,
      backupIndexCompletionPercent: 80,
      deadlineRiskCount: 20,
      falseCompletionCount: 55,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "false-complete-active",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "critical",
    },
    componentHealth: falseCompleteHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestAcceptanceSuccessRate: 100,
      deletionBacklogCount: 0,
      oldestRequestAgeDays: 0,
      endToEndCompletionPercent: 100,
      productDbCompletionPercent: 100,
      analyticsStoreCompletionPercent: 100,
      backupIndexCompletionPercent: 100,
      deadlineRiskCount: 0,
      falseCompletionCount: 0,
      deadlineBreachedCount: 0,
      deletionWorkflowStatus: "healthy",
      backupIndexTrackingStatus: "tracked",
      deletionIntegritySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
];
