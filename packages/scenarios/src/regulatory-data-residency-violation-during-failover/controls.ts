import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation controls (non-destructive) ───────────────────────────
// Each is a toggle a candidate flips to signal "I looked here." None of
// these change component health, revenue loss, or cost — they only
// advance the authored `diagnosisPath`/`investigationQuality` state
// values the rule table sets (see rules.ts). Mirrors the reference
// incident's investigation pattern exactly (packages/scenarios/src/
// checkout-payment-inventory-redis-contention/controls.ts).
export const INSPECT_FAILOVER_ROUTING_LOGS_KEY = "inspectFailoverRoutingLogs";
export const INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY = "inspectDataResidencyAuditTrail";
export const INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY = "inspectLegalNotificationRequirements";

// ── Remediation controls (state-mutating) ──────────────────────────────
// The branching choice (per this scenario's "branching" structure
// assignment): a genuinely new principal-tier tradeoff axis — compliance/
// legal risk vs. availability — with no clean answer. None of the three
// strategies below is strictly dominant:
//
//   - FAIL_BACK_TO_EU_KEY: force traffic back onto the (possibly still
//     degraded) EU region immediately. Stops new EU personal data from
//     being processed in the US region right away — the data-residency
//     violation stops accruing — but if the EU region has not actually
//     recovered yet, this reopens the original availability outage for
//     EU customers. A genuine, not merely cosmetic, tradeoff.
//   - STAY_FAILED_OVER_KEY: explicitly accept staying on the US failover
//     region for now. Preserves availability for EU customers, but the
//     regulatory violation keeps accruing for every minute it continues —
//     this is the plausible-but-inferior path for anyone who only reads
//     "all green" on the availability dashboard and stops looking.
//   - ENABLE_EU_DATA_LOCK_GATEWAY_KEY: the real fix once the EU region
//     has actually recovered — route only EU-tagged traffic back through
//     a residency-enforcing gateway while non-EU traffic stays on
//     whichever region is healthiest. Requires the EU region to be
//     recovered first (ROLLBACK_EU_REGION_RECOVERY_CHECK_KEY) — enabling
//     it before the region is actually healthy just reopens the outage
//     under a different control, which is this scenario's second trap.
export const FAIL_BACK_TO_EU_KEY = "failBackToEu";
export const STAY_FAILED_OVER_KEY = "stayFailedOver";
export const ENABLE_EU_DATA_LOCK_GATEWAY_KEY = "enableEuDataLockGateway";

// ── Supporting remediation control ─────────────────────────────────────
// Only meaningful combined with ENABLE_EU_DATA_LOCK_GATEWAY_KEY: confirms
// the EU region's own infrastructure has actually finished recovering
// before routing EU traffic back onto it. Toggling the data-lock gateway
// without this first is the scenario's "looks like the right call, isn't
// actually safe yet" trap.
export const VERIFY_EU_REGION_RECOVERED_KEY = "verifyEuRegionRecovered";

// ── Legal/compliance remediation control ───────────────────────────────
// Filing the mandatory breach notification is its own, separate
// obligation once a residency violation has occurred at all — it does
// not undo the violation and does not affect availability, but omitting
// it when the violation has crossed the notification threshold is a
// distinct compliance failure the rule table tracks independently of
// which availability strategy was chosen.
export const FILE_BREACH_NOTIFICATION_KEY = "fileBreachNotification";

export const controls: ControlDefinition[] = [
  { key: INSPECT_FAILOVER_ROUTING_LOGS_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY, allowedValues: [false, true], initialValue: false },
  {
    key: INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  { key: FAIL_BACK_TO_EU_KEY, allowedValues: [false, true], initialValue: false },
  { key: STAY_FAILED_OVER_KEY, allowedValues: [false, true], initialValue: false },
  { key: VERIFY_EU_REGION_RECOVERED_KEY, allowedValues: [false, true], initialValue: false },
  { key: ENABLE_EU_DATA_LOCK_GATEWAY_KEY, allowedValues: [false, true], initialValue: false },
  { key: FILE_BREACH_NOTIFICATION_KEY, allowedValues: [false, true], initialValue: false },
];
