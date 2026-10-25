import type { TimedEvent } from "@incidentrank/simulator";

const PROVIDER_OUTAGE_MS = 30_000;
// A second wave: sustained unmitigated retry pressure against the still-
// unreachable destination subset finally exhausts enough attempts that
// webhooks begin escalating to the dead-letter queue in volume — but
// only as the continuation of an already-visible trend (webhookBacklog,
// retryVolumePerMinute, and dlqDepth have already been climbing since
// PROVIDER_OUTAGE_MS), never a surprise flip from a healthy-looking
// state. A candidate watching the backlog and retry volume climb has
// every reason to expect this.
const DLQ_ESCALATION_MS = PROVIDER_OUTAGE_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "shared-provider-outage",
    atMs: PROVIDER_OUTAGE_MS,
    type: "TRIGGER_SET",
    message:
      "A subset of customer webhook endpoints that share a common downstream mail/notification provider have become slow or unreachable. The dispatcher is retrying failed deliveries to them aggressively.",
    setTriggers: { destinationsDegraded: true },
  },
  {
    id: "dlq-escalation-wave",
    atMs: DLQ_ESCALATION_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained retry exhaustion against the still-unreachable destination subset has pushed a large volume of webhooks into the dead-letter queue.",
    setTriggers: { destinationsDegraded: true, dlqEscalating: true },
  },
];

export { PROVIDER_OUTAGE_MS, DLQ_ESCALATION_MS };
