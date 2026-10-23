import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CROSS_REGION_DEPENDENCY_KEY,
  GENERAL_CONSISTENCY_MODE_KEY,
  PAYMENT_AUTH_CONSISTENCY_MODE_KEY,
  READ_ROUTING_KEY,
  REGIONAL_FAILOVER_KEY,
  TRAFFIC_LOCALITY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "us-region": "healthy",
  "global-services": "healthy",
  "eu-region": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "us-region": "degraded",
  "global-services": "degraded",
  "eu-region": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "us-region": "critical",
  "global-services": "critical",
  "eu-region": "critical",
};

// Payment auth relaxed while still cross-region-dependent: customer-
// facing latency looks fine in both regions, but the correctness-
// critical path is unsafe. Both regions read as individually "healthy"
// here deliberately — the danger is invisible to a health-check view,
// which is exactly the trap this scenario's audit requirement exists to
// catch.
const unsafeLooksHealthyHealth: Record<string, ComponentHealth> = {
  "us-region": "healthy",
  "global-services": "degraded",
  "eu-region": "healthy",
};

/**
 * Authored rule table for Cross-Region Latency Spike, ordered
 * most-specific first.
 *
 * Pre-incident baseline: general (non-payment) traffic is synchronous
 * cross-region (every write acknowledged by both regions) and reads
 * always go to the current primary region, as does payment
 * authorization — which the business additionally REQUIRES to stay
 * strongly consistent, because a payment authorized independently by
 * both regions during a network-degraded window risks a double charge
 * no engineer can safely undo after the fact
 * (paymentAuthConsistencyMode/paymentAuthConsistency).
 *
 * Once the backbone RTT spikes, every one of those synchronous/
 * primary-routed paths is now bounded below by the degraded
 * round-trip time, which is why regional customer latency rises even
 * though both regions are individually healthy. Two genuinely
 * different, legitimate responses exist for the GENERAL (non-payment)
 * traffic:
 *
 *   (a) Patient / correctness-maximal: leave general traffic exactly as
 *       configured (synchronous, required, primary-region reads,
 *       nearest locality). Nothing is unsafe, but regional latency for
 *       every one of those paths — general AND payment — stays
 *       elevated for as long as the backbone issue persists. This is
 *       the scenario's ACCEPTABLE tier: a real, deliberate "nothing
 *       here is broken enough to warrant changing a correctness
 *       property" judgment, not merely "did nothing."
 *   (b) Fast / relax general traffic only: switch
 *       crossRegionDependencyUsage to localOnly, generalConsistencyMode
 *       to eventual, and readRouting to localRegion, while leaving
 *       paymentAuthConsistencyMode untouched at synchronous. Regional
 *       latency recovers close to normal immediately for everything
 *       EXCEPT payment (which legitimately stays elevated, because it
 *       is still correctly synchronous) — at the cost of a bounded,
 *       authored replication-lag window on the now-eventual general
 *       data. This is the scenario's OPTIMAL tier: faster, and still
 *       fully safe, because the one correctness-critical operation was
 *       deliberately left alone.
 *
 * Relaxing paymentAuthConsistencyMode itself is the one genuinely
 * unsafe move (see payment-consistency-relaxed-unsafe below) — the
 * business constraint explicitly singles that operation out, per the
 * briefing. trafficLocality=alwaysGlobal and regionalFailover=true are
 * both harmful traps: they force MORE traffic across the degraded link
 * rather than less, making things strictly worse than doing nothing.
 */
export const crossRegionLatencySpikeRules: Rule[] = [
  // ── UNSAFE TRAP (checked first — this must win over every other
  // combination): payment authorization itself has been relaxed to
  // eventual consistency. Both regions can now authorize independently
  // without waiting on each other, so every customer-facing latency
  // metric looks fully healthy — but a payment authorized in both
  // regions during the same network-degraded window can diverge into a
  // double authorization. paymentAuthConsistency flips to
  // "relaxed-unsafe" and stays nonzero/true for as long as this control
  // holds this value, gating successCondition directly regardless of
  // how healthy availability looks.
  {
    id: "payment-consistency-relaxed-unsafe",
    when: {
      triggerEquals: { rttSpiking: true },
      controlEquals: { [PAYMENT_AUTH_CONSISTENCY_MODE_KEY]: "eventual" },
    },
    incidentState: "payment-consistency-relaxed",
    values: {
      interRegionRttMs: 480,
      replicationLagMs: 820,
      syncWriteLatencyMs: 55,
      usCustomerLatencyMs: 90,
      euCustomerLatencyMs: 95,
      crossRegionRequestVolume: 1_250,
      backboneStatus: "warning",
      paymentAuthConsistency: "relaxed-unsafe",
    },
    componentHealth: unsafeLooksHealthyHealth,
  },

  // ── Second wave, patient path deepened: the backbone issue has not
  // cleared on its own. Observable precursor (syncWriteLatencyMs and
  // both regions' customer latency already elevated since rttSpiking
  // first fired) means this is never a surprise — just confirmation
  // that waiting alone will not resolve it. Checked before the
  // steady-state patient rule below so it wins once rttSustained has
  // fired, for whichever combination of general-traffic controls the
  // candidate has left untouched.
  {
    id: "sustained-degradation-no-relaxation",
    when: {
      triggerEquals: { rttSpiking: true, rttSustained: true },
      controlEquals: {
        [CROSS_REGION_DEPENDENCY_KEY]: "required",
        [PAYMENT_AUTH_CONSISTENCY_MODE_KEY]: "synchronous",
        [REGIONAL_FAILOVER_KEY]: false,
        [TRAFFIC_LOCALITY_KEY]: "nearest",
      },
    },
    incidentState: "sustained-degraded-no-relaxation",
    values: {
      interRegionRttMs: 650,
      replicationLagMs: 30,
      syncWriteLatencyMs: 690,
      usCustomerLatencyMs: 720,
      euCustomerLatencyMs: 740,
      crossRegionRequestVolume: 1_150,
      backboneStatus: "critical",
      paymentAuthConsistency: "strong",
    },
    componentHealth: criticalHealth,
  },

  // ── HARMFUL: traffic locality forced to alwaysGlobal. Every request
  // in both regions now makes a round trip across the degraded link —
  // strictly worse than the patient baseline, before touching
  // consistency/routing at all.
  {
    id: "always-global-worsens-latency",
    when: {
      triggerEquals: { rttSpiking: true },
      controlEquals: { [TRAFFIC_LOCALITY_KEY]: "alwaysGlobal" },
    },
    incidentState: "always-global-amplified",
    values: {
      interRegionRttMs: 480,
      replicationLagMs: 60,
      syncWriteLatencyMs: 560,
      usCustomerLatencyMs: 610,
      euCustomerLatencyMs: 640,
      crossRegionRequestVolume: 4_800,
      backboneStatus: "critical",
      paymentAuthConsistency: "strong",
    },
    componentHealth: criticalHealth,
  },

  // ── HARMFUL: regional failover engaged. This is intended for a
  // genuine regional outage, not a link-latency problem between two
  // individually healthy regions — the isolated region's users now pay
  // a full round trip across the degraded backbone for traffic that
  // used to be served without one, worse than leaving routing alone.
  {
    id: "regional-failover-adds-rtt",
    when: {
      triggerEquals: { rttSpiking: true },
      controlEquals: { [REGIONAL_FAILOVER_KEY]: true },
    },
    incidentState: "failover-adds-rtt",
    values: {
      interRegionRttMs: 480,
      replicationLagMs: 30,
      syncWriteLatencyMs: 510,
      usCustomerLatencyMs: 540,
      euCustomerLatencyMs: 610,
      crossRegionRequestVolume: 1_300,
      backboneStatus: "critical",
      paymentAuthConsistency: "strong",
    },
    componentHealth: degradedHealth,
  },

  // ── OPTIMAL (fast, still safe): general traffic relaxed to
  // region-local/eventual — crossRegionDependencyUsage=localOnly,
  // generalConsistencyMode=eventual, readRouting=localRegion — while
  // trafficLocality stays nearest and, critically, payment auth is left
  // untouched at synchronous. Regional customer latency recovers close
  // to normal because the general path no longer waits on the degraded
  // RTT at all; a bounded, authored replication-lag window opens for
  // that non-payment data instead. Payment's own latency stays
  // elevated — correctly, because it is still synchronous — but that
  // alone does not block success below.
  {
    id: "general-traffic-relaxed-fast-recovery",
    when: {
      triggerEquals: { rttSpiking: true },
      controlEquals: {
        [CROSS_REGION_DEPENDENCY_KEY]: "localOnly",
        [GENERAL_CONSISTENCY_MODE_KEY]: "eventual",
        [READ_ROUTING_KEY]: "localRegion",
        [TRAFFIC_LOCALITY_KEY]: "nearest",
        [REGIONAL_FAILOVER_KEY]: false,
      },
    },
    incidentState: "general-traffic-relaxed",
    values: {
      interRegionRttMs: 480,
      replicationLagMs: 850,
      syncWriteLatencyMs: 510,
      usCustomerLatencyMs: 110,
      euCustomerLatencyMs: 120,
      crossRegionRequestVolume: 320,
      backboneStatus: "warning",
      paymentAuthConsistency: "strong",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE (patient, correctness-maximal): general traffic is
  // left exactly as configured (synchronous, required, primary-region
  // reads, nearest locality) — correctness stays maximal across the
  // board, but regional customer latency and synchronous-write latency
  // stay bounded below by the current elevated RTT for as long as the
  // backbone issue persists. Genuinely safe, just slower than the
  // relaxed path above — a legitimate, deliberate judgment that nothing
  // here needs a correctness tradeoff.
  {
    id: "fully-synchronous-patient",
    when: {
      triggerEquals: { rttSpiking: true },
      controlEquals: {
        [GENERAL_CONSISTENCY_MODE_KEY]: "synchronous",
        [CROSS_REGION_DEPENDENCY_KEY]: "required",
        [TRAFFIC_LOCALITY_KEY]: "nearest",
        [READ_ROUTING_KEY]: "primaryRegion",
        [REGIONAL_FAILOVER_KEY]: false,
      },
    },
    incidentState: "fully-synchronous-degraded",
    values: {
      interRegionRttMs: 480,
      replicationLagMs: 25,
      syncWriteLatencyMs: 510,
      usCustomerLatencyMs: 540,
      euCustomerLatencyMs: 560,
      crossRegionRequestVolume: 1_180,
      backboneStatus: "warning",
      paymentAuthConsistency: "strong",
    },
    componentHealth: degradedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      interRegionRttMs: 40,
      replicationLagMs: 50,
      syncWriteLatencyMs: 70,
      usCustomerLatencyMs: 90,
      euCustomerLatencyMs: 95,
      crossRegionRequestVolume: 1_200,
      backboneStatus: "normal",
      paymentAuthConsistency: "strong",
    },
    componentHealth: healthyHealth,
  },
];
