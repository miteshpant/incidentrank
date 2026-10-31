import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  ENABLE_COMPATIBILITY_SHIM_KEY,
  EXTEND_SUNSET_DEADLINE_KEY,
  FORCE_HARD_CUTOVER_KEY,
  INSPECT_CONSUMER_REGISTRY_KEY,
  INSPECT_GATEWAY_ACCESS_LOGS_KEY,
  INSPECT_SUPPORT_TICKET_QUEUE_KEY,
  MIGRATE_DISCOVERED_CONSUMERS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "orders-api-v1": "healthy",
  "orders-api-v2": "healthy",
  "consumer-registry": "healthy",
};

const breakingHealth: Record<string, ComponentHealth> = {
  "api-gateway": "degraded",
  "orders-api-v1": "critical",
  "orders-api-v2": "healthy",
  "consumer-registry": "degraded",
};

const cutoverMaskedHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "orders-api-v1": "healthy",
  "orders-api-v2": "healthy",
  "consumer-registry": "degraded",
};

const partiallyRelievedHealth: Record<string, ComponentHealth> = {
  "api-gateway": "degraded",
  "orders-api-v1": "degraded",
  "orders-api-v2": "healthy",
  "consumer-registry": "degraded",
};

/**
 * Authored rule table for the API Version Sunset / silent-consumers
 * incident. The real root cause: the team's consumer registry says every
 * REGISTERED integration finished migrating off v1 — true, and
 * completely beside the point, because a long tail of internal callers
 * nobody registered (`unregisteredV1CallerCount`) never showed up in
 * that inventory at all. `registeredV1ConsumerMigratedPercent` staying
 * pinned at 100% throughout is the misleading "looks done" signal; only
 * gateway access-log traffic (unregistered caller count) and the
 * resulting error/ticket symptoms reveal the real scope of the problem.
 *
 * Branching structure (per this scenario's assignment): the candidate
 * chooses one of three genuinely different remediation strategies, each
 * with its own risk/cost/completeness tradeoff — captured in the coarser
 * `remediationStrategy` field (narrative/golden-path identification
 * only):
 *   - "extend-then-migrated": extend the sunset deadline AND actively
 *     migrate the long-tail consumers the investigation surfaced. Full,
 *     durable fix — slowest, but the real fix.
 *   - "shim-then-migrated": stand up the compatibility shim immediately
 *     (fast mitigation) AND still go find/migrate the long tail behind
 *     it. Also a full, durable fix, on a different timeline/cost
 *     profile (ongoing shim infra cost instead of extended v1
 *     maintenance cost).
 *   - "shim-only": the shim alone, with no follow-through migration.
 *     Mitigates most of the volume immediately, but the shim's lossy
 *     field-mapping for legacy bulk-discount payloads leaves a real,
 *     lower-volume correctness problem live indefinitely — this is the
 *     plausible-but-inferior path for anyone who stops at "the alerts
 *     went quiet."
 *   - "extend-only": extended the deadline but never followed through
 *     with the migration — buys time, fixes nothing yet.
 *   - "hard-cutover": block v1 traffic outright. The gateway's own
 *     dashboards go fully green immediately (`v1ErrorRate5xxPercent`
 *     back to near zero, `componentHealth` all healthy) — but every
 *     silent consumer that was never found keeps getting hard failures
 *     from their own side, which this scenario's state never improves
 *     for (`unregisteredV1CallerCount` stays pinned high,
 *     `supportTicketBacklogCount` keeps climbing). This is the
 *     scenario's "looks resolved, isn't" trap and is classified
 *     "harmful" in action-classifications.ts.
 *
 * `diagnosisPath` mirrors `remediationStrategy` at the per-rule-id level
 * (debugging/golden-path identification). `investigationQuality` is the
 * SEPARATE, coarser field scoring.ts's dataIntegrity dimension actually
 * reads via the generic `finalStringEquals` measure — "correlated" for
 * EITHER fully-investigated correct branch (extend-then-migrated or
 * shim-then-migrated: the dataIntegrity dimension rewards whether the
 * candidate correlated registry + access logs + ticket queue before
 * acting, not which of the two valid strategies they picked), "guessed"
 * for a correct remediation applied without that full investigation,
 * and "inferior"/"not-attempted" otherwise. This is the exact
 * investigationQuality/diagnosisPath split Graceful Shutdown's rule
 * table already uses for the same reason: collapsing multiple equally-
 * valid branches into one scoring value needs a field distinct from the
 * identity-level one, since `finalStringEquals` compares against
 * exactly one string (see packages/scenarios/src/graceful-shutdown-
 * drops-in-flight-requests/rules.ts).
 *
 * Note: the engine matches rules against a CURRENT snapshot of
 * triggers/controlValues every tick — these fields capture WHAT the
 * candidate had set by the time a given tick is evaluated, not strict
 * temporal ordering, exactly like every other scenario's rule table in
 * this codebase.
 */
export const sunsetRules: Rule[] = [
  // ── Best path A: extended the sunset deadline AND migrated the
  // discovered long-tail consumers, having correlated all three
  // investigation signals first. Full durable fix.
  {
    id: "investigated-extend-then-migrated",
    when: {
      triggerEquals: { v1Sunset: true },
      controlEquals: {
        [INSPECT_CONSUMER_REGISTRY_KEY]: true,
        [INSPECT_GATEWAY_ACCESS_LOGS_KEY]: true,
        [INSPECT_SUPPORT_TICKET_QUEUE_KEY]: true,
        [EXTEND_SUNSET_DEADLINE_KEY]: true,
        [MIGRATE_DISCOVERED_CONSUMERS_KEY]: true,
      },
    },
    incidentState: "recovering",
    values: {
      v1ErrorRate5xxPercent: 0.3,
      orderCreationFailureRatePercent: 0.4,
      unregisteredV1CallerCount: 1,
      registeredV1ConsumerMigratedPercent: 100,
      supportTicketBacklogCount: 4,
      gatewayTlsHandshakeFailureCount: 12,
      diagnosisPath: "investigated-extend-then-migrated",
      remediationStrategy: "extend-then-migrated",
      investigationQuality: "correlated",
    },
    componentHealth: healthyHealth,
  },

  // ── Best path B: stood up the compatibility shim AND migrated the
  // discovered long-tail consumers behind it, having correlated all
  // three investigation signals first. Also a full, durable fix.
  {
    id: "investigated-shim-then-migrated",
    when: {
      triggerEquals: { v1Sunset: true },
      controlEquals: {
        [INSPECT_CONSUMER_REGISTRY_KEY]: true,
        [INSPECT_GATEWAY_ACCESS_LOGS_KEY]: true,
        [INSPECT_SUPPORT_TICKET_QUEUE_KEY]: true,
        [ENABLE_COMPATIBILITY_SHIM_KEY]: true,
        [MIGRATE_DISCOVERED_CONSUMERS_KEY]: true,
      },
    },
    incidentState: "recovering",
    values: {
      v1ErrorRate5xxPercent: 0.4,
      orderCreationFailureRatePercent: 0.4,
      unregisteredV1CallerCount: 1,
      registeredV1ConsumerMigratedPercent: 100,
      supportTicketBacklogCount: 4,
      gatewayTlsHandshakeFailureCount: 12,
      diagnosisPath: "investigated-shim-then-migrated",
      remediationStrategy: "shim-then-migrated",
      investigationQuality: "correlated",
    },
    componentHealth: healthyHealth,
  },

  // ── Either correct strategy applied WITHOUT the full investigation
  // first (guessed/rushed the right call but never actually correlated
  // registry + access logs + ticket queue before acting). Still reaches
  // a durable fix, but investigation-quality scoring reflects it.
  {
    id: "guessed-extend-then-migrated",
    when: {
      triggerEquals: { v1Sunset: true },
      controlEquals: {
        [EXTEND_SUNSET_DEADLINE_KEY]: true,
        [MIGRATE_DISCOVERED_CONSUMERS_KEY]: true,
      },
    },
    incidentState: "recovering",
    values: {
      v1ErrorRate5xxPercent: 0.3,
      orderCreationFailureRatePercent: 0.4,
      unregisteredV1CallerCount: 1,
      registeredV1ConsumerMigratedPercent: 100,
      supportTicketBacklogCount: 4,
      gatewayTlsHandshakeFailureCount: 12,
      diagnosisPath: "guessed-extend-then-migrated",
      remediationStrategy: "extend-then-migrated",
      investigationQuality: "guessed",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "guessed-shim-then-migrated",
    when: {
      triggerEquals: { v1Sunset: true },
      controlEquals: {
        [ENABLE_COMPATIBILITY_SHIM_KEY]: true,
        [MIGRATE_DISCOVERED_CONSUMERS_KEY]: true,
      },
    },
    incidentState: "recovering",
    values: {
      v1ErrorRate5xxPercent: 0.4,
      orderCreationFailureRatePercent: 0.4,
      unregisteredV1CallerCount: 1,
      registeredV1ConsumerMigratedPercent: 100,
      supportTicketBacklogCount: 4,
      gatewayTlsHandshakeFailureCount: 12,
      diagnosisPath: "guessed-shim-then-migrated",
      remediationStrategy: "shim-then-migrated",
      investigationQuality: "guessed",
    },
    componentHealth: healthyHealth,
  },

  // ── Inferior path: shim enabled, but nobody ever went and migrated
  // the discovered long tail behind it. Most volume disappears (shim
  // translates the bulk of v1-shaped traffic to v2), but the lossy
  // legacy bulk-discount payload mapping leaves a real, lower-volume
  // correctness problem live indefinitely.
  {
    id: "shim-only",
    when: {
      triggerEquals: { v1Sunset: true },
      controlEquals: { [ENABLE_COMPATIBILITY_SHIM_KEY]: true, [MIGRATE_DISCOVERED_CONSUMERS_KEY]: false },
    },
    incidentState: "degraded",
    values: {
      v1ErrorRate5xxPercent: 2.4,
      orderCreationFailureRatePercent: 3.1,
      unregisteredV1CallerCount: 14,
      registeredV1ConsumerMigratedPercent: 100,
      supportTicketBacklogCount: 9,
      gatewayTlsHandshakeFailureCount: 12,
      diagnosisPath: "shim-only",
      remediationStrategy: "shim-only",
      investigationQuality: "inferior",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Extended deadline alone, no follow-through migration: buys time,
  // doesn't fix anything yet — same breakage continues on the same
  // schedule (v1 stays up and unmigrated callers keep calling the same
  // broken-flow-adjacent surface), just with the hard sunset not yet
  // enforced.
  {
    id: "extend-only",
    when: {
      triggerEquals: { v1Sunset: true },
      controlEquals: { [EXTEND_SUNSET_DEADLINE_KEY]: true, [MIGRATE_DISCOVERED_CONSUMERS_KEY]: false },
    },
    incidentState: "degraded",
    values: {
      v1ErrorRate5xxPercent: 4.5,
      orderCreationFailureRatePercent: 3.8,
      unregisteredV1CallerCount: 40,
      registeredV1ConsumerMigratedPercent: 100,
      supportTicketBacklogCount: 20,
      gatewayTlsHandshakeFailureCount: 12,
      diagnosisPath: "extend-only",
      remediationStrategy: "extend-only",
      investigationQuality: "inferior",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Plausible-but-harmful path: forced the hard cutover instead.
  // Gateway-side dashboards go green immediately (v1 traffic is simply
  // blocked), but every silent consumer that was never found keeps
  // failing hard on their own end — this scenario's state never
  // recovers that, by design: unregisteredV1CallerCount and the support
  // ticket backlog keep climbing even though the gateway's own error
  // rate reads healthy.
  {
    id: "hard-cutover",
    when: {
      triggerEquals: { v1Sunset: true },
      controlEquals: { [FORCE_HARD_CUTOVER_KEY]: true },
    },
    incidentState: "degraded",
    values: {
      v1ErrorRate5xxPercent: 0.2,
      orderCreationFailureRatePercent: 0.3,
      unregisteredV1CallerCount: 46,
      registeredV1ConsumerMigratedPercent: 100,
      supportTicketBacklogCount: 64,
      gatewayTlsHandshakeFailureCount: 12,
      diagnosisPath: "hard-cutover",
      remediationStrategy: "hard-cutover",
      investigationQuality: "inferior",
    },
    componentHealth: cutoverMaskedHealth,
  },

  // ── Baseline critical: sunset has taken effect, no mitigation applied
  // yet. registeredV1ConsumerMigratedPercent is deliberately pinned at
  // 100 throughout — the misleading "the registry says we're done"
  // signal the candidate must notice is NOT the whole truth.
  {
    id: "sunset-baseline",
    when: { triggerEquals: { v1Sunset: true } },
    incidentState: "breaking",
    values: {
      v1ErrorRate5xxPercent: 38,
      orderCreationFailureRatePercent: 22,
      unregisteredV1CallerCount: 46,
      registeredV1ConsumerMigratedPercent: 100,
      supportTicketBacklogCount: 58,
      gatewayTlsHandshakeFailureCount: 12,
      diagnosisPath: "not-attempted",
      remediationStrategy: "not-attempted",
      investigationQuality: "not-attempted",
    },
    componentHealth: breakingHealth,
  },

  // ── Default/fallback: before the sunset takes effect.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      v1ErrorRate5xxPercent: 0.2,
      orderCreationFailureRatePercent: 0.3,
      unregisteredV1CallerCount: 2,
      registeredV1ConsumerMigratedPercent: 100,
      supportTicketBacklogCount: 3,
      gatewayTlsHandshakeFailureCount: 4,
      diagnosisPath: "not-attempted",
      remediationStrategy: "not-attempted",
      investigationQuality: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];
