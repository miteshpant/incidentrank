import type { ScenarioDefinition } from "./types";
import {
  writeAmplificationFromMisconfiguredCompactionSimulation,
  INSPECT_DISK_IOPS_METRICS_KEY,
  INSPECT_WRITE_AMPLIFICATION_METRICS_KEY,
  INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
  COMPACTION_LEVEL_MULTIPLIER_KEY,
  SCALE_UP_DISK_IOPS_KEY,
  THROTTLE_COMPACTION_BACKGROUND_IO_KEY,
} from "./write-amplification-from-misconfigured-compaction/definition";
import { writeAmplificationFromMisconfiguredCompactionCandidateUI } from "./write-amplification-from-misconfigured-compaction/candidate-ui";
import { WRITE_AMPLIFICATION_FROM_MISCONFIGURED_COMPACTION_SCORING } from "./write-amplification-from-misconfigured-compaction/scoring";

/**
 * A storage engine's compaction level-size multiplier was quietly
 * lowered from 8 to 2 roughly three weeks before this incident (an
 * attempt to shrink per-compaction-round memory use during a prior,
 * unrelated incident). That change produced no immediate symptom —
 * write amplification only rose modestly, never crossing any alerting
 * threshold — but it silently ate disk IOPS headroom the whole time.
 * A routine, unremarkable increase in write traffic is what finally
 * exhausts that headroom. Disk IOPS utilization and write latency spike
 * together, and the storage engine looks saturated — but nothing about
 * the storage engine or the config service changed just now. The
 * candidate must reason backward from the present symptom to a
 * configuration change made weeks earlier, rather than assuming the
 * cause is the traffic bump itself (which is merely what exposed it).
 */
export const writeAmplificationFromMisconfiguredCompaction: ScenarioDefinition = {
  id: "write-amplification-from-misconfigured-compaction",
  slug: "write-amplification-from-misconfigured-compaction",
  version: 1,
  name: "Write Amplification from Misconfigured Storage Compaction",
  description:
    "Disk IOPS utilization and write latency have both spiked during a routine, unremarkable traffic increase. Nothing about the storage engine's deployment or configuration changed today — but something did change three weeks ago: a compaction tuning parameter that quietly raised write amplification without ever crossing an alert threshold on its own. The traffic bump didn't cause this; it only exposed headroom that was already gone. Diagnose the configuration root cause rather than treating this as a simple capacity problem.",
  difficulty: "senior_staff",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: writeAmplificationFromMisconfiguredCompactionSimulation,
  library: {
    category: "Databases & Storage",
    tags: ["Storage Engine", "Compaction", "Write Amplification", "LSM Tree", "IOPS", "Configuration Drift"],
    primarySkill: "Reasoning backward from a current symptom to a delayed configuration root cause",
    skills: [
      "Distinguishing a demand-driven capacity problem from a configuration-driven amplification problem",
      "Reading write amplification and compaction backlog as leading indicators, not just disk IOPS",
      "Recognizing a plausible-but-inferior capacity-scaling remediation that masks rather than fixes the cause",
      "Investigating configuration change history, not just current deploys, when nothing obviously changed today",
    ],
    shortDescription:
      "Disk IOPS saturate under routine traffic — but the real cause is a compaction setting misconfigured three weeks earlier, not the traffic itself.",
  },
};

export {
  writeAmplificationFromMisconfiguredCompactionSimulation,
  writeAmplificationFromMisconfiguredCompactionCandidateUI,
  WRITE_AMPLIFICATION_FROM_MISCONFIGURED_COMPACTION_SCORING,
  INSPECT_DISK_IOPS_METRICS_KEY,
  INSPECT_WRITE_AMPLIFICATION_METRICS_KEY,
  INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
  COMPACTION_LEVEL_MULTIPLIER_KEY,
  SCALE_UP_DISK_IOPS_KEY,
  THROTTLE_COMPACTION_BACKGROUND_IO_KEY,
};
