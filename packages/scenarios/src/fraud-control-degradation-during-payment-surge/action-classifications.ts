import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  EXTERNAL_RISK_PROVIDER_FALLBACK_KEY,
  FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY,
  MANUAL_REVIEW_QUEUE_PRIORITY_KEY,
  RISK_PROVIDER_CIRCUIT_BREAKER_KEY,
  RULES_ENGINE_MODE_KEY,
  TRANSACTION_VELOCITY_THRESHOLD_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── fraudReviewModeByRiskTier ────────────────────────────────────
  {
    id: "acr_1",
    controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY,
    valueEquals: "bypass-all",
    whenTriggerEquals: { riskProviderDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Broad fraud-review bypass removed mandatory screening for high-risk transactions",
      explanation:
        "Setting fraud review policy to bypass everyone, including high-risk and high-velocity transactions, made checkout success rate and latency look dramatically better — nothing had to round-trip to the degraded External Risk Provider at all. That apparent recovery is not real: it directly violates the invariant that high-risk transaction categories may never bypass mandatory fraud review. Every tick this stayed active added to a permanent, non-resetting count of fraud-review bypasses on transactions that should have been reviewed, which stays on the record even after the policy is restored, and materially penalizes Data Integrity and Reliability regardless of how healthy checkout metrics looked.",
    },
  },
  {
    id: "acr_2",
    controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY,
    valueEquals: "risk-tiered-bounded-fallback",
    whenTriggerEquals: { riskProviderDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Risk-tiered bounded fallback preserved mandatory review while restoring low-risk throughput",
      explanation:
        "Switching to the risk-tiered bounded-fallback policy let low-risk transactions use the explicitly-allowed fallback risk-check flow instead of being needlessly held, while keeping high-risk transactions subject to mandatory fraud review. This only works safely because the Rules Engine is still producing a usable local risk signal — pairing this with a disabled Rules Engine would have removed that safety net.",
    },
  },
  {
    id: "acr_3",
    controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY,
    valueEquals: "mandatory-all",
    whenTriggerEquals: { riskProviderDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Mandatory review for everyone is safe but holds low-risk transactions needlessly",
      explanation:
        "Keeping fraud review mandatory for every transaction protects against the central risk this incident poses, but it also holds low-risk transactions that did not need full review at all while the External Risk Provider is degraded — a real, if safe, throughput cost that a risk-tiered policy could have avoided.",
    },
  },

  // ── externalRiskProviderFallback ─────────────────────────────────
  {
    id: "acr_4",
    controlKey: EXTERNAL_RISK_PROVIDER_FALLBACK_KEY,
    valueEquals: "approve-on-timeout",
    whenTriggerEquals: { riskProviderDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Approve-on-timeout turned every provider timeout into an automatic approval",
      explanation:
        "Treating a timed-out risk check as an automatic approval applies equally to high-risk transactions as to low-risk ones — a direct violation of the invariant that mandatory fraud review may never be bypassed to relieve latency or throughput pressure. This adds to the same permanent, non-resetting historical count as a broad bypass, and stays there even after this setting is reverted.",
    },
  },
  {
    id: "acr_5",
    controlKey: EXTERNAL_RISK_PROVIDER_FALLBACK_KEY,
    valueEquals: "cached-risk-scores",
    whenTriggerEquals: { riskProviderDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Cached risk scores kept a usable risk signal available without waiting on the degraded provider",
      explanation:
        "Serving a short-lived cached risk classification instead of waiting on a live provider call keeps a genuine risk-tiering signal available during the incident, supporting the bounded-fallback policy's ability to safely distinguish low-risk from high-risk transactions.",
    },
  },

  // ── rulesEngineMode ──────────────────────────────────────────────
  {
    id: "acr_6",
    controlKey: RULES_ENGINE_MODE_KEY,
    valueEquals: "disabled",
    whenTriggerEquals: { riskProviderDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Disabling the Rules Engine removed the only remaining local risk signal",
      explanation:
        "With local rule evaluation disabled, there is no reliable signal at all to distinguish a low-risk transaction from a high-risk one — any risk-tiered-bounded-fallback policy set alongside this falls back to treating every transaction as potentially high-risk, needlessly holding low-risk transactions that could otherwise have used the bounded fallback flow.",
    },
  },
  {
    id: "acr_7",
    controlKey: RULES_ENGINE_MODE_KEY,
    valueEquals: "reduced",
    whenTriggerEquals: { riskProviderDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Reduced local rules kept risk tiering usable at lower cost during the incident",
      explanation:
        "Running a smaller local rule subset still produces a genuine, bounded fraud-scoring signal, keeping risk-tiered-bounded-fallback able to safely distinguish low-risk from high-risk transactions while relieving Rules Engine load during the surge.",
    },
  },

  // ── transactionVelocityThreshold ─────────────────────────────────
  {
    id: "acr_8",
    controlKey: TRANSACTION_VELOCITY_THRESHOLD_KEY,
    valueEquals: "relaxed",
    whenTriggerEquals: { riskProviderDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Relaxing the velocity threshold routed transactions that should have required review into the fallback path",
      explanation:
        "Widening what counts as 'low-risk' purely to relieve queue pressure routes a measurably larger share of transactions that should have required full mandatory review into the bounded-fallback path instead. This is a bounded but real erosion of the invariant that high-risk categories must never bypass review regardless of throughput pressure, and adds its own smaller, distinct contribution to the permanent fraud-review-bypass count — separate from, and in addition to, any broad-bypass exposure.",
    },
  },
  {
    id: "acr_9",
    controlKey: TRANSACTION_VELOCITY_THRESHOLD_KEY,
    valueEquals: "strict",
    whenTriggerEquals: { riskProviderDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Strict velocity threshold kept mandatory-review coverage broad",
      explanation:
        "Leaving the velocity threshold at its strict default keeps a wide band of transactions correctly classified as high-risk and therefore ineligible for any fallback mode, protecting the invariant at the cost of some additional review-queue volume that a relaxed threshold would have diverted.",
    },
  },

  // ── riskProviderCircuitBreaker ───────────────────────────────────
  {
    id: "acr_10",
    controlKey: RISK_PROVIDER_CIRCUIT_BREAKER_KEY,
    valueEquals: "half-open-probe",
    whenTriggerEquals: { riskProviderDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Half-open circuit breaker relieved provider load while still testing for recovery",
      explanation:
        "Routing most traffic directly to the authored fallback path while probing a small fraction of traffic against the External Risk Provider relieves real load on the already-struggling dependency without fully losing recovery detection — a genuine relief lever, not a bypass of fraud-review policy itself.",
    },
  },
  {
    id: "acr_11",
    controlKey: RISK_PROVIDER_CIRCUIT_BREAKER_KEY,
    valueEquals: "closed",
    whenTriggerEquals: { riskProviderDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Leaving the circuit breaker closed sent every risk check through the failing provider",
      explanation:
        "Sending every risk check straight through to a provider that is already degraded wastes retries against a failing dependency and forces every transaction to pay the provider's full degraded latency before any fallback logic even applies, needlessly worsening checkout latency during the surge.",
    },
  },

  // ── manualReviewQueuePriority ────────────────────────────────────
  {
    id: "acr_12",
    controlKey: MANUAL_REVIEW_QUEUE_PRIORITY_KEY,
    valueEquals: "risk-weighted",
    whenTriggerEquals: { riskProviderDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Risk-weighted triage reviewed the highest-risk held transactions first",
      explanation:
        "Reordering the manual review queue so the highest-risk held transactions are reviewed first reduces how long a genuinely high-risk transaction sits unresolved behind a backlog of lower-risk holds that simply arrived earlier — a real operational-efficiency improvement that does not change whether mandatory review happens, only how quickly the queue works through a surge-sized backlog.",
    },
  },
  {
    id: "acr_13",
    controlKey: MANUAL_REVIEW_QUEUE_PRIORITY_KEY,
    valueEquals: "fifo",
    whenTriggerEquals: { riskProviderDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Plain arrival-order triage leaves high-risk holds waiting behind the backlog",
      explanation:
        "Reviewing strictly in arrival order is a safe default, but under surge volume it can leave a long-held high-risk transaction sitting behind a large backlog of low-risk holds that arrived first, extending the window during which a genuinely high-risk transaction is neither cleared nor denied.",
    },
  },
];
