import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation controls (non-destructive) ───────────────────────────
// Each is a toggle a candidate flips to signal "I looked here." None of
// these change component health, revenue loss, or cost — they only
// advance the authored `diagnosisPath`/`investigationQuality` state
// values the rule table sets (see rules.ts). Mirrors the reference
// incident's investigation pattern exactly (packages/scenarios/src/
// checkout-payment-inventory-redis-contention/controls.ts).
export const INSPECT_CONSUMER_REGISTRY_KEY = "inspectConsumerRegistry";
export const INSPECT_GATEWAY_ACCESS_LOGS_KEY = "inspectGatewayAccessLogs";
export const INSPECT_SUPPORT_TICKET_QUEUE_KEY = "inspectSupportTicketQueue";

// ── Remediation controls (state-mutating) ──────────────────────────────
// The branching choice (per this scenario's "branching" structure
// assignment): three independently-selectable remediation strategies
// with genuinely different risk profiles, none of which is a toggle the
// candidate would flip "by accident" — each is a deliberate strategic
// choice.
//
//   - EXTEND_SUNSET_DEADLINE_KEY: push the sunset date out. Lowest risk,
//     slowest resolution — buys time to find and migrate the long tail
//     properly, at the cost of carrying v1's maintenance burden longer.
//   - ENABLE_COMPATIBILITY_SHIM_KEY: stand up a translation shim that
//     rewrites v1-shaped calls onto v2 under the hood. Fast mitigation
//     for most of the long tail, but the shim's field-mapping is lossy
//     for one real v1 request shape (legacy bulk-discount payloads),
//     so running the shim ALONE (without actually finding/fixing that
//     caller) leaves a genuine, lower-volume correctness problem live.
//   - FORCE_HARD_CUTOVER_KEY: block v1 traffic outright at the gateway.
//     This is the plausible-but-inferior path: it looks like "the
//     deprecation shipped" and the gateway's own dashboards go green
//     immediately, but every silent consumer that was never found keeps
//     getting hard failures indefinitely — it resolves nothing for the
//     actual long tail, it just stops looking at the symptom.
export const EXTEND_SUNSET_DEADLINE_KEY = "extendSunsetDeadline";
export const ENABLE_COMPATIBILITY_SHIM_KEY = "enableCompatibilityShim";
export const FORCE_HARD_CUTOVER_KEY = "forceHardCutover";

// ── Supporting remediation control ─────────────────────────────────────
// Only meaningful combined with either EXTEND_SUNSET_DEADLINE_KEY or
// ENABLE_COMPATIBILITY_SHIM_KEY: actively reaching out to and migrating
// the long-tail consumers the registry/logs investigation surfaced. This
// is what actually retires the silent-consumer traffic for good, as
// opposed to merely buying time (extend) or papering over it (shim).
export const MIGRATE_DISCOVERED_CONSUMERS_KEY = "migrateDiscoveredConsumers";

export const controls: ControlDefinition[] = [
  { key: INSPECT_CONSUMER_REGISTRY_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_GATEWAY_ACCESS_LOGS_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_SUPPORT_TICKET_QUEUE_KEY, allowedValues: [false, true], initialValue: false },
  { key: EXTEND_SUNSET_DEADLINE_KEY, allowedValues: [false, true], initialValue: false },
  { key: ENABLE_COMPATIBILITY_SHIM_KEY, allowedValues: [false, true], initialValue: false },
  { key: FORCE_HARD_CUTOVER_KEY, allowedValues: [false, true], initialValue: false },
  { key: MIGRATE_DISCOVERED_CONSUMERS_KEY, allowedValues: [false, true], initialValue: false },
];
