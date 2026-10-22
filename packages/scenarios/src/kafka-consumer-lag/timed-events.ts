import type { TimedEvent } from "@incidentrank/simulator";

const PRODUCER_SPIKE_MS = 30_000;
const SLOW_RECORDS_MS = 5 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "producer-spike-begins",
    atMs: PRODUCER_SPIKE_MS,
    type: "TRIGGER_SET",
    message: "Upstream producer throughput has tripled.",
    setTriggers: { producerSpiking: true },
  },
  {
    id: "slow-records-begin",
    atMs: SLOW_RECORDS_MS,
    type: "TRIGGER_SET",
    message: "A batch of records now requires an expensive downstream lookup per message.",
    setTriggers: { producerSpiking: true, slowRecordsPresent: true },
  },
];
