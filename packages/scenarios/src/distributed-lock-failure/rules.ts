import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  ACQUIRE_RETRY_BACKOFF_ENABLED_KEY,
  FENCING_TOKEN_ENABLED_KEY,
  LEASE_DURATION_SECONDS_KEY,
  LEASE_RENEWAL_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  workers: "healthy",
  "lock-service": "healthy",
  "shared-resource": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  workers: "degraded",
  "lock-service": "degraded",
  "shared-resource": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  workers: "critical",
  "lock-service": "critical",
  "shared-resource": "critical",
};

// Resource visibly blocked (crash scenario), but no correctness
// violation — the lock service itself is fine, the shared resource is
// just unreachable for whoever is waiting on the stuck lease.
const resourceBlockedHealth: Record<string, ComponentHealth> = {
  workers: "degraded",
  "lock-service": "healthy",
  "shared-resource": "critical",
};

/**
 * Authored rule table for Distributed Lock Failure, ordered
 * most-specific first.
 *
 * A downstream dependency slowdown makes job processing duration
 * (~50s) routinely outlive a short lock lease. Three independent
 * mechanisms interact:
 *
 *   - leaseDurationSeconds: a short lease (5/15/30s, all < ~50s
 *     processing) expires mid-job, letting a second worker acquire the
 *     "same" lock. A long lease (60/120s, > ~50s processing) avoids
 *     that expiry-during-processing — BUT if a worker genuinely
 *     crashes while holding it, the shared resource stays blocked for
 *     the full lease duration before anyone can take over
 *     (resourceBlockedSeconds). Longer lease trades correctness-risk
 *     frequency for slower crash recovery — it is never free.
 *   - leaseRenewalEnabled: a heartbeat lets a still-alive worker renew
 *     its own lease, so expiry-during-processing never happens
 *     regardless of lease duration — but a CRASHED worker can no
 *     longer send the heartbeat, so crash recovery is still bounded by
 *     leaseDurationSeconds.
 *   - fencingTokenEnabled: the shared resource rejects any write
 *     carrying a token older than the highest it has already accepted.
 *     Even when a lease DOES expire mid-processing and a second worker
 *     acquires it, the original (now-superseded) worker's eventual
 *     write is rejected rather than applied — overlapping ownership
 *     can occur, but it is rendered harmless. This is the only
 *     mechanism that keeps correctnessViolationCount at zero
 *     independent of lease duration, which is what lets a SHORT lease
 *     (fast crash recovery) be chosen safely.
 *
 * workerConcurrency raises contention/duplicate-work volume when
 * overlapping ownership is already happening, but neither causes nor
 * prevents it on its own. acquireRetryBackoffEnabled=false (tight
 * retry loop) raises lock-service load/contention independent of the
 * lease/fencing mechanics — a separate, secondary harmful trap.
 */
export const distributedLockFailureRules: Rule[] = [
  // ── OPTIMAL (crash case, fenced): even after a worker genuinely
  // crashes, fencing means no stale write can land once a new owner
  // takes over — and because fencing makes a short lease safe, the
  // candidate who chose fencing can also keep leaseDurationSeconds
  // short, so crash recovery stays fast too. Checked before the
  // crash-agnostic fencing rule below, since `workerCrashed` is a
  // strict superset of `processingSlow` and must be matched first.
  {
    id: "fencing-enabled-safe-after-crash",
    when: {
      triggerEquals: { processingSlow: true, workerCrashed: true },
      controlEquals: { [FENCING_TOKEN_ENABLED_KEY]: true },
      controlAtMost: { [LEASE_DURATION_SECONDS_KEY]: 15 },
    },
    incidentState: "fenced-safe-fast-recovery",
    values: {
      lockContentionRate: 6,
      leaseExpiryDuringProcessingCount: 5,
      overlappingOwnerCount: 1,
      duplicateWorkCount: 0,
      correctnessViolationCount: 0,
      processingDurationMs: 50_000,
      resourceBlockedSeconds: 15,
      lockServiceStatus: "normal",
      lockSafetyMechanism: "fenced",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL: fencing enabled. Even with a short lease and no
  // renewal, the stale writer's commit is rejected by the shared
  // resource, so correctness stays safe regardless of how often leases
  // expire mid-processing. This is intentionally checked before every
  // other lease/renewal-driven rule below so it wins whenever fencing
  // is on (including after a crash, if the lease was long enough that
  // the fenced-fast-recovery rule above didn't already match).
  {
    id: "fencing-enabled-safe-short-lease",
    when: {
      triggerEquals: { processingSlow: true },
      controlEquals: { [FENCING_TOKEN_ENABLED_KEY]: true },
    },
    incidentState: "fenced-safe",
    values: {
      lockContentionRate: 6,
      leaseExpiryDuringProcessingCount: 4,
      overlappingOwnerCount: 1,
      duplicateWorkCount: 0,
      correctnessViolationCount: 0,
      processingDurationMs: 50_000,
      resourceBlockedSeconds: 0,
      lockServiceStatus: "normal",
      lockSafetyMechanism: "fenced",
    },
    componentHealth: healthyHealth,
  },

  // ── Renewal enabled, no fencing, worker crashes, short/medium lease
  // (<= 30s): the crashed worker can no longer heartbeat, so its
  // lease stops being renewed and simply runs out on its own
  // schedule — but the earlier choice of a short lease pays off here,
  // the blocked window is small. Checked before the crash-agnostic
  // renewal rule below, since `workerCrashed` is a strict superset of
  // `processingSlow` and must be matched first.
  {
    id: "renewal-enabled-crash-fast-recovery",
    when: {
      triggerEquals: { processingSlow: true, workerCrashed: true },
      controlEquals: {
        [LEASE_RENEWAL_ENABLED_KEY]: true,
        [FENCING_TOKEN_ENABLED_KEY]: false,
      },
      controlAtMost: { [LEASE_DURATION_SECONDS_KEY]: 30 },
    },
    incidentState: "renewed-crash-fast-recovery",
    values: {
      lockContentionRate: 3,
      leaseExpiryDuringProcessingCount: 0,
      overlappingOwnerCount: 0,
      duplicateWorkCount: 0,
      correctnessViolationCount: 0,
      processingDurationMs: 50_000,
      resourceBlockedSeconds: 20,
      lockServiceStatus: "warning",
      lockSafetyMechanism: "renewed",
    },
    componentHealth: resourceBlockedHealth,
  },

  // ── Renewal enabled, no fencing, worker crashes, long lease (>=
  // 60s): the crashed worker can no longer heartbeat, so its lease
  // stops being renewed and simply runs out on its own, now much
  // longer, schedule — the shared resource stays blocked for the FULL
  // configured lease duration before another worker can take over.
  // This is the direct, visible cost of having chosen a long lease
  // earlier: renewal protects a live worker perfectly, but does
  // nothing for a dead one.
  {
    id: "renewal-enabled-crash-blocks-for-full-lease",
    when: {
      triggerEquals: { processingSlow: true, workerCrashed: true },
      controlEquals: {
        [LEASE_RENEWAL_ENABLED_KEY]: true,
        [FENCING_TOKEN_ENABLED_KEY]: false,
      },
      controlAtLeast: { [LEASE_DURATION_SECONDS_KEY]: 60 },
    },
    incidentState: "renewed-crash-slow-recovery",
    values: {
      lockContentionRate: 3,
      leaseExpiryDuringProcessingCount: 0,
      overlappingOwnerCount: 0,
      duplicateWorkCount: 0,
      correctnessViolationCount: 0,
      processingDurationMs: 50_000,
      resourceBlockedSeconds: 90,
      lockServiceStatus: "warning",
      lockSafetyMechanism: "renewed",
    },
    componentHealth: resourceBlockedHealth,
  },

  // ── Renewal enabled, no fencing: a still-alive worker's heartbeat
  // keeps renewing the lease, so expiry-during-processing never
  // happens and there is no second owner to conflict with — genuinely
  // safe for as long as no worker actually crashes. Checked after both
  // crash-specific renewal rules above so those win whenever a crash
  // has actually occurred.
  {
    id: "renewal-enabled-safe-while-alive",
    when: {
      triggerEquals: { processingSlow: true },
      controlEquals: {
        [LEASE_RENEWAL_ENABLED_KEY]: true,
        [FENCING_TOKEN_ENABLED_KEY]: false,
      },
    },
    incidentState: "renewed-safe",
    values: {
      lockContentionRate: 2,
      leaseExpiryDuringProcessingCount: 0,
      overlappingOwnerCount: 0,
      duplicateWorkCount: 0,
      correctnessViolationCount: 0,
      processingDurationMs: 50_000,
      resourceBlockedSeconds: 0,
      lockServiceStatus: "normal",
      lockSafetyMechanism: "renewed",
    },
    componentHealth: healthyHealth,
  },

  // ── UNSAFE, crash case, short/medium lease, no mitigation at all:
  // with no renewal and no fencing, a lease this short was already
  // expiring mid-processing and producing real correctness violations
  // even before any crash. A worker crash on top of that additionally
  // blocks the shared resource for the remainder of this (short)
  // lease — a smaller block than the long-lease case below, but this
  // state is unsafe for an independent reason (ongoing correctness
  // violations), not because of the block duration. Checked before
  // every crash-agnostic unsafe rule below, since `workerCrashed` is a
  // strict superset of `processingSlow` and must be matched first.
  {
    id: "short-lease-no-mitigation-crash",
    when: {
      triggerEquals: { processingSlow: true, workerCrashed: true },
      controlEquals: { [FENCING_TOKEN_ENABLED_KEY]: false, [LEASE_RENEWAL_ENABLED_KEY]: false },
      controlAtMost: { [LEASE_DURATION_SECONDS_KEY]: 30 },
    },
    incidentState: "short-lease-no-mitigation-crash",
    values: {
      lockContentionRate: 60,
      leaseExpiryDuringProcessingCount: 22,
      overlappingOwnerCount: 8,
      duplicateWorkCount: 9,
      correctnessViolationCount: 9,
      processingDurationMs: 50_000,
      resourceBlockedSeconds: 25,
      lockServiceStatus: "critical",
      lockSafetyMechanism: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── THE TRAP, crash case: long lease, no renewal, no fencing, and a
  // worker genuinely crashes while holding the lock. There is no
  // renewal and no fencing to help — the shared resource is
  // unreachable for the FULL long lease duration. This is the real,
  // visible cost of "fixing" lease-expiry frequency purely by
  // lengthening the lease: it looked safe right up until a worker
  // actually died. Checked before the crash-agnostic long-lease rule
  // below, since `workerCrashed` is a strict superset of
  // `processingSlow` and must be matched first.
  {
    id: "long-lease-no-fencing-crash-very-slow-recovery",
    when: {
      triggerEquals: { processingSlow: true, workerCrashed: true },
      controlEquals: { [FENCING_TOKEN_ENABLED_KEY]: false, [LEASE_RENEWAL_ENABLED_KEY]: false },
      controlAtLeast: { [LEASE_DURATION_SECONDS_KEY]: 60 },
    },
    incidentState: "long-lease-no-fencing-crash",
    values: {
      lockContentionRate: 3,
      leaseExpiryDuringProcessingCount: 0,
      overlappingOwnerCount: 0,
      duplicateWorkCount: 0,
      correctnessViolationCount: 0,
      processingDurationMs: 50_000,
      resourceBlockedSeconds: 120,
      lockServiceStatus: "critical",
      lockSafetyMechanism: "unresolved",
    },
    componentHealth: resourceBlockedHealth,
  },

  // ── THE TRAP: long lease, no renewal, no fencing. Expiry-during-
  // processing gets much RARER because the lease (>= 60s) now usually
  // outlasts the ~50s job — lockContentionRate and lockServiceStatus
  // read as mostly-healthy — but job duration still occasionally
  // exceeds even this longer lease under tail-latency variance, so
  // overlapping ownership and real correctness violations still occur,
  // just far less often than the short-lease baseline. This is NOT the
  // clean fix: the candidate has only reduced the FREQUENCY of the
  // unsafe condition, never eliminated it, while simultaneously making
  // crash recovery much worse (the rule above). The reduced-but-
  // nonzero correctnessViolationCount below is the direct, observable
  // evidence that this state never actually reaches safe — it must
  // never satisfy successCondition.
  {
    id: "long-lease-reduces-expiry-frequency",
    when: {
      triggerEquals: { processingSlow: true },
      controlEquals: { [FENCING_TOKEN_ENABLED_KEY]: false, [LEASE_RENEWAL_ENABLED_KEY]: false },
      controlAtLeast: { [LEASE_DURATION_SECONDS_KEY]: 60 },
    },
    incidentState: "long-lease-no-fencing",
    values: {
      lockContentionRate: 8,
      leaseExpiryDuringProcessingCount: 3,
      overlappingOwnerCount: 2,
      duplicateWorkCount: 2,
      correctnessViolationCount: 2,
      processingDurationMs: 50_000,
      resourceBlockedSeconds: 0,
      lockServiceStatus: "warning",
      lockSafetyMechanism: "unresolved",
    },
    componentHealth: degradedHealth,
  },

  // ── UNSAFE, worst: short-to-medium lease, no renewal, no fencing,
  // high worker concurrency (>= 8), AND a tight immediate retry loop
  // on lock-acquire failure (no backoff). This combines both harmful
  // mechanisms — frequent expiry-during-processing from the lease, and
  // a thundering herd of acquisition retries from the tight loop — so
  // it is checked first among the unsafe states: lock-service load and
  // overlapping-owner volume are both at their worst here.
  {
    id: "short-lease-no-mitigation-overlap-retry-storm",
    when: {
      triggerEquals: { processingSlow: true },
      controlEquals: {
        [FENCING_TOKEN_ENABLED_KEY]: false,
        [LEASE_RENEWAL_ENABLED_KEY]: false,
        [ACQUIRE_RETRY_BACKOFF_ENABLED_KEY]: false,
      },
      controlAtMost: { [LEASE_DURATION_SECONDS_KEY]: 30 },
      controlAtLeast: { [WORKER_CONCURRENCY_KEY]: 8 },
    },
    incidentState: "overlapping-owners-retry-storm",
    values: {
      lockContentionRate: 140,
      leaseExpiryDuringProcessingCount: 34,
      overlappingOwnerCount: 15,
      duplicateWorkCount: 17,
      correctnessViolationCount: 17,
      processingDurationMs: 50_000,
      resourceBlockedSeconds: 0,
      lockServiceStatus: "critical",
      lockSafetyMechanism: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── UNSAFE, worse: same short-lease trap, but with high worker
  // concurrency (>= 8) and backoff-on-retry-failure enabled. More
  // workers racing to acquire the same frequently-expiring lease
  // produces more simultaneous overlapping owners and more
  // duplicate/conflicting writes per unit time than the low-
  // concurrency case below, without the additional retry-storm load.
  {
    id: "short-lease-no-mitigation-overlap-high-concurrency",
    when: {
      triggerEquals: { processingSlow: true },
      controlEquals: { [FENCING_TOKEN_ENABLED_KEY]: false, [LEASE_RENEWAL_ENABLED_KEY]: false },
      controlAtMost: { [LEASE_DURATION_SECONDS_KEY]: 30 },
      controlAtLeast: { [WORKER_CONCURRENCY_KEY]: 8 },
    },
    incidentState: "overlapping-owners-amplified",
    values: {
      lockContentionRate: 95,
      leaseExpiryDuringProcessingCount: 34,
      overlappingOwnerCount: 15,
      duplicateWorkCount: 17,
      correctnessViolationCount: 17,
      processingDurationMs: 50_000,
      resourceBlockedSeconds: 0,
      lockServiceStatus: "critical",
      lockSafetyMechanism: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── UNSAFE baseline / short-to-medium lease, no renewal, no
  // fencing, low worker concurrency (<= 4): the lease (<= 30s) is
  // shorter than the ~50s processing duration, so it routinely expires
  // while the original worker is still legitimately working. A second
  // worker acquires the "same" lock and both proceed to write against
  // the shared resource — duplicate work and real correctness
  // violations follow, even though nothing has crashed.
  {
    id: "short-lease-no-mitigation-overlap",
    when: {
      triggerEquals: { processingSlow: true },
      controlEquals: { [FENCING_TOKEN_ENABLED_KEY]: false, [LEASE_RENEWAL_ENABLED_KEY]: false },
      controlAtMost: {
        [LEASE_DURATION_SECONDS_KEY]: 30,
        [WORKER_CONCURRENCY_KEY]: 4,
      },
    },
    incidentState: "overlapping-owners",
    values: {
      lockContentionRate: 42,
      leaseExpiryDuringProcessingCount: 18,
      overlappingOwnerCount: 6,
      duplicateWorkCount: 6,
      correctnessViolationCount: 6,
      processingDurationMs: 50_000,
      resourceBlockedSeconds: 0,
      lockServiceStatus: "critical",
      lockSafetyMechanism: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      lockContentionRate: 2,
      leaseExpiryDuringProcessingCount: 0,
      overlappingOwnerCount: 0,
      duplicateWorkCount: 0,
      correctnessViolationCount: 0,
      processingDurationMs: 4_000,
      resourceBlockedSeconds: 0,
      lockServiceStatus: "normal",
      lockSafetyMechanism: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
