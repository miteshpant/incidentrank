import type { TimedEvent } from "@incidentrank/simulator";

const BOT_SURGE_RISING_MS = 30_000;
// A second wave: the bot operator, having found a working request shape,
// scales up further once the initial surge goes unmitigated — but only
// as a continuation of an already-visible trend (requestVolumePerSec and
// suspiciousTrafficRatioPct have already been climbing since
// BOT_SURGE_RISING_MS), never a surprise flip from a healthy-looking
// state. A candidate watching backendLoadPct and suspiciousTrafficRatioPct
// climb has every reason to expect this.
const BOT_SURGE_ESCALATING_MS = BOT_SURGE_RISING_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "bot-surge-rising",
    atMs: BOT_SURGE_RISING_MS,
    type: "TRIGGER_SET",
    message:
      "Automated traffic is climbing sharply. It carries realistic user-agents and is distributed across many source IPs, closely resembling legitimate usage.",
    setTriggers: { botSurgeRising: true },
  },
  {
    id: "bot-surge-escalating",
    atMs: BOT_SURGE_ESCALATING_MS,
    type: "TRIGGER_SET",
    message:
      "The automated traffic has continued scaling up; suspicious-traffic ratio and backend load keep climbing without a mitigation in place.",
    setTriggers: { botSurgeRising: true, botSurgeEscalating: true },
  },
];

export { BOT_SURGE_RISING_MS, BOT_SURGE_ESCALATING_MS };
