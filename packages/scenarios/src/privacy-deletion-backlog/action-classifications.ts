import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  ANALYTICS_STORE_PROCESSING_KEY,
  BACKUP_INDEX_PROCESSING_MODE_KEY,
  COMPLETION_MARKING_POLICY_KEY,
  DELETION_WORKER_ALLOCATION_KEY,
  HIGH_RISK_PRIORITY_BOOST_KEY,
  QUEUE_PRIORITY_POLICY_KEY,
  RETRY_POLICY_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── completionMarkingPolicy ──────────────────────────────────────────
  {
    id: "acc_1",
    controlKey: COMPLETION_MARKING_POLICY_KEY,
    valueEquals: "mark-on-verified-complete",
    whenTriggerEquals: { backlogForming: true },
    outcome: "beneficial",
    feedback: {
      title: "Verified-only completion marking closed the false-complete gap",
      explanation:
        "Marking a request complete only once every required downstream store (Product Databases and Analytics Store) has independently confirmed deletion is the scenario's central fix — it stops the system from reporting a request as done while data about that person still exists somewhere it must not. This is the invariant distinguishing 'accepted' from 'actually deleted.' It does not, by itself, protect the oldest/deadline-nearest requests from breaching their own deadline (see queuePriorityPolicy) and does not make the Analytics Store or Backup Index obligations real on its own if either is separately skipped/untracked.",
    },
  },
  {
    id: "acc_2",
    controlKey: COMPLETION_MARKING_POLICY_KEY,
    valueEquals: "mark-on-accept",
    whenTriggerEquals: { backlogForming: true },
    outcome: "harmful",
    feedback: {
      title: "Marking requests complete on acceptance created false completion records",
      explanation:
        "Marking a deletion request 'complete' the instant the Privacy API accepts it — before any downstream store has actually executed the deletion — creates a FALSE completion record. Every request marked this way while a required store (Product Databases or Analytics Store) still holds the data is a real, permanent audit-trail falsehood: the system now asserts something untrue about whether a person's data was actually deleted, and that false assertion stays on the historical record (falseCompletionCount's tracked peak) even after the policy is later corrected.",
    },
  },

  // ── queuePriorityPolicy ──────────────────────────────────────────────
  {
    id: "acc_3",
    controlKey: QUEUE_PRIORITY_POLICY_KEY,
    valueEquals: "oldest-deadline-first",
    whenTriggerEquals: { backlogForming: true },
    outcome: "beneficial",
    feedback: {
      title: "Oldest-deadline-first prioritization protected the requests closest to breach",
      explanation:
        "Reordering the Workflow Queue to always drain the oldest, deadline-nearest requests first directly prevents those requests from silently aging past their mandated deletion deadline while newer, easier requests get processed ahead of them. A genuine, targeted deadline-protection strategy (Alternate Strong Path A) — materially different from, but equally valid as, prioritizing high-risk requests specifically (queuePriorityPolicy='high-risk-first' + highRiskPriorityBoost).",
    },
  },
  {
    id: "acc_4",
    controlKey: QUEUE_PRIORITY_POLICY_KEY,
    valueEquals: "high-risk-first",
    whenTriggerEquals: { backlogForming: true },
    outcome: "beneficial",
    feedback: {
      title: "High-risk-first prioritization protected the most legally sensitive requests",
      explanation:
        "Prioritizing legal-class/high-risk deletion requests specifically, while keeping a bounded SLA for everything else, is a genuinely different, also-valid deadline-protection strategy (Alternate Strong Path B) from oldest-deadline-first. On its own this control selects the STRATEGY; it only actually reorders the queue once highRiskPriorityBoost is also turned on — selecting this strategy without the boost never actually fast-tracks anything.",
    },
  },
  {
    id: "acc_5",
    controlKey: QUEUE_PRIORITY_POLICY_KEY,
    valueEquals: "newest-first",
    whenTriggerEquals: { backlogForming: true },
    outcome: "harmful",
    feedback: {
      title: "Newest-first prioritization let the oldest requests silently breach deadline",
      explanation:
        "Processing the most recently accepted requests first is the easiest queue discipline to implement, but it means the oldest, deadline-nearest requests keep getting pushed behind newer ones indefinitely — they age past their mandated deletion deadline while the backlog dashboard might otherwise look like it's draining. A real, independent violation from the false-completion problem: this happens even when completion marking is correctly verified-only.",
    },
  },

  // ── highRiskPriorityBoost ────────────────────────────────────────────
  {
    id: "acc_6",
    controlKey: HIGH_RISK_PRIORITY_BOOST_KEY,
    valueEquals: "on",
    whenTriggerEquals: { backlogForming: true },
    outcome: "beneficial",
    feedback: {
      title: "Boosting high-risk requests reduced their time exposed in the backlog",
      explanation:
        "Giving legal-class/high-risk deletion requests an additional priority boost on top of the general queue policy directly reduces how long the most legally sensitive requests sit incomplete. Required alongside queuePriorityPolicy='high-risk-first' to make that strategy actually take effect — on its own, without that strategy selected, it still helps (high-risk requests get boosted regardless of the general policy) but does not by itself protect the rest of the backlog from deadline risk.",
    },
  },
  {
    id: "acc_7",
    controlKey: HIGH_RISK_PRIORITY_BOOST_KEY,
    valueEquals: "off",
    whenTriggerEquals: { backlogForming: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the high-risk boost off is fine under oldest-deadline-first, but incomplete under high-risk-first",
      explanation:
        "Not boosting high-risk requests specifically is harmless when queuePriorityPolicy='oldest-deadline-first' is already protecting every request by age — but if queuePriorityPolicy='high-risk-first' was selected as the strategy, leaving this off means that strategy never actually takes effect: selecting the strategy name alone does not reorder anything.",
    },
  },

  // ── analyticsStoreProcessing ─────────────────────────────────────────
  {
    id: "acc_8",
    controlKey: ANALYTICS_STORE_PROCESSING_KEY,
    valueEquals: "enforced",
    whenTriggerEquals: { backlogForming: true },
    outcome: "beneficial",
    feedback: {
      title: "Keeping Analytics Store processing enforced preserved a required deletion obligation",
      explanation:
        "Continuing to execute deletion against the Analytics Store, exactly like every other required downstream system, means this obligation is never silently dropped. There was never a reason to treat this store differently from Product Databases — both are required for a request to be genuinely, honestly complete.",
    },
  },
  {
    id: "acc_9",
    controlKey: ANALYTICS_STORE_PROCESSING_KEY,
    valueEquals: "skipped",
    whenTriggerEquals: { backlogForming: true },
    outcome: "harmful",
    feedback: {
      title: "Skipping the Analytics Store looked faster but left a permanent, silent completeness gap",
      explanation:
        "Skipping deletion execution against the Analytics Store makes the backlog look like it's clearing faster (one fewer store to wait on), and a Product-Databases-only dashboard would stay green — but every request processed this way never actually reaches the Analytics Store at all. This is a real, independent violation from the false-completion problem: it happens even when completionMarkingPolicy is correctly verified-only, because the Analytics Store obligation itself was never attempted.",
    },
  },

  // ── backupIndexProcessingMode ────────────────────────────────────────
  {
    id: "acc_10",
    controlKey: BACKUP_INDEX_PROCESSING_MODE_KEY,
    valueEquals: "tracked-pending",
    whenTriggerEquals: { backlogForming: true },
    outcome: "beneficial",
    feedback: {
      title: "Keeping Backup Index obligations tracked preserved auditability",
      explanation:
        "Backups genuinely may lag the live stores on their own rotation schedule — that is an acceptable, expected difference in semantics — but keeping that status visibly tracked and reported means nobody has to guess whether the obligation was ever actually met. Auditability, not speed, is what this control protects.",
    },
  },
  {
    id: "acc_11",
    controlKey: BACKUP_INDEX_PROCESSING_MODE_KEY,
    valueEquals: "excluded-from-completion",
    whenTriggerEquals: { backlogForming: true },
    outcome: "harmful",
    feedback: {
      title: "Excluding the Backup Index from tracking created an invisible auditability gap",
      explanation:
        "Stopping tracking/reporting of Backup Index status for in-flight requests does not, by itself, mark anything falsely complete — but it means nobody, not the candidate and not a future auditor, can see whether the Backup Index obligation was ever actually met for those requests. An invisible gap is its own kind of failure, independent of whether anything was falsely marked done.",
    },
  },

  // ── deletionWorkerAllocation ─────────────────────────────────────────
  {
    id: "acc_12",
    controlKey: DELETION_WORKER_ALLOCATION_KEY,
    valueEquals: "scaled-up",
    whenTriggerEquals: { backlogForming: true },
    outcome: "beneficial",
    feedback: {
      title: "Scaling up workers increased real throughput at a real ongoing cost",
      explanation:
        "Adding deletion worker capacity directly increases throughput against every downstream store, draining the backlog faster once a correct strategy is engaged — a real, if secondary, recovery-speed lever at a real, ongoing infrastructure cost. It does not, by itself, stop false completions or deadline breaches if the actual correctness levers (completionMarkingPolicy, queuePriorityPolicy) are left unaddressed — it only makes an already-correct strategy finish sooner.",
    },
  },
  {
    id: "acc_13",
    controlKey: DELETION_WORKER_ALLOCATION_KEY,
    valueEquals: "baseline",
    whenTriggerEquals: { backlogForming: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving worker allocation at baseline avoided extra cost, at the price of a slower drain",
      explanation:
        "Not scaling up deletion workers avoids the real, ongoing extra infrastructure cost scaling up would incur, at the cost of a slower backlog drain once a correct strategy is engaged. Not unsafe on its own — the same correctness guarantees apply either way — purely a recovery-speed/cost tradeoff.",
    },
  },

  // ── retryPolicy ──────────────────────────────────────────────────────
  {
    id: "acc_14",
    controlKey: RETRY_POLICY_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { backlogForming: true },
    outcome: "beneficial",
    feedback: {
      title: "Aggressive retries absorbed transient downstream failures faster, at a modest extra cost",
      explanation:
        "Retrying a transiently-failed downstream deletion call more persistently before giving up increases successful same-pass completions against flaky stores, at a real, modest extra compute cost. This never changes WHETHER a request is eventually completed on its own — only how quickly transient failures are absorbed.",
    },
  },
  {
    id: "acc_15",
    controlKey: RETRY_POLICY_KEY,
    valueEquals: "standard",
    whenTriggerEquals: { backlogForming: true },
    outcome: "neutral",
    feedback: {
      title: "Standard retries avoided extra cost, at the price of more re-queued passes on flaky calls",
      explanation:
        "Keeping the default, bounded retry policy avoids the extra compute cost aggressive retrying would incur. Transiently-failed downstream calls simply get re-queued for a later pass instead of being retried immediately and persistently — a minor, secondary throughput/cost tradeoff, never a correctness issue on its own.",
    },
  },
];
