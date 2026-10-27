# Phase 7.3 Representative Scenario Coverage Matrix

| Scenario | Why selected | Stories |
|---|---|---|
| `cache-eviction-storm` | formerly automatic completion; senior | B01, B03, B08, C01, K |
| `cache-node-failure` | plain-paragraph briefing; automatic failure; intermediate | B02, B07, K |
| `payment-retry-storm` | free scenario; original hand-authored flow; alternate paths | A01, G01, B01, B06, K |
| `kafka-partition-skew` | staff level; sequencing sensitivity (`orderingMode`) | B04, K |
| `cross-region-replication-cost-explosion` | cost-efficiency; ACCEPTABLE vs OPTIMAL | B04, D01, K |
| `runaway-cloud-spend-during-healthy-traffic` | cost-efficiency; tempting harmful path | B06, K |
| `expensive-retry-and-logging-amplification` | historical/non-resetting damage; senior_staff | D03, K |
| `privilege-escalation-via-stale-authorization-cache` | security/authorization theme | K |
| `ml-inference-cost-vs-quality-incident` | model/decision-quality | K |
| `model-feature-freshness-degradation` | decision-quality + historical damage; alternate paths (#90) | D03, K |
| `certificate-expiry-across-large-fleet` | alternate strong paths (#98); recovery lag | K |
| `emergency-capacity-reservation-decision` | alternate strong paths (#99) | K |
| `enterprise-wide-dependency-deprecation` | #100; long structured briefing; flagship | A01, B02, B03, D01, D02, I, J, K |

Cross-cutting stories not tied to a specific sampled scenario (A02-A04, C02-C05, E*, F*, G02-G04, H*) use whichever scenario is fastest to reach a relevant state — noted per-story in `execution_log.md`.
