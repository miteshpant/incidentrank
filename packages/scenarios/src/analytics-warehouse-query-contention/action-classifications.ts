import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  AD_HOC_ACCESS_POLICY_KEY,
  AD_HOC_QUERY_CAP_KEY,
  ADMISSION_POLICY_KEY,
  DEADLINE_COMMUNICATION_KEY,
  LONG_RUNNING_QUERY_POLICY_KEY,
  WAREHOUSE_CAPACITY_TIER_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── admissionPolicy ──────────────────────────────────────────────────
  {
    id: "acc_1",
    controlKey: ADMISSION_POLICY_KEY,
    valueEquals: "priority-queue",
    whenTriggerEquals: { queryContention: true },
    outcome: "beneficial",
    feedback: {
      title: "Priority-queue admission let critical report jobs jump ahead of ad-hoc load",
      explanation:
        "Admitting Scheduled Reports' critical jobs ahead of ad-hoc BI/Data Science load whenever both contend for the same Query Gateway slots is one of this scenario's two legitimate alternate strong paths. It protects the SLA by reordering who gets served first — ad-hoc queries still eventually run, just later — without revoking anyone's access. The pre-existing ad-hoc backlog still takes real elapsed time to drain; this does not make queued ad-hoc work vanish instantly.",
    },
  },
  {
    id: "acc_2",
    controlKey: ADMISSION_POLICY_KEY,
    valueEquals: "fifo",
    whenTriggerEquals: { queryContention: true },
    outcome: "neutral",
    feedback: {
      title: "FIFO admission treats the critical report job as no more urgent than any ad-hoc query",
      explanation:
        "Leaving admission at strict arrival order is not itself unsafe, but during a genuine contention spike it means the critical scheduled-report job queues behind exploratory BI queries and long-running Data Science jobs exactly as if they were equally urgent. Either adHocQueryCap=capped or warehouseCapacityTier=scaled can still protect the SLA while admission stays FIFO — but FIFO alone, with ad-hoc uncapped, leaves the SLA unprotected.",
    },
  },

  // ── adHocQueryCap ────────────────────────────────────────────────────
  {
    id: "acc_3",
    controlKey: AD_HOC_QUERY_CAP_KEY,
    valueEquals: "capped",
    whenTriggerEquals: { queryContention: true },
    outcome: "beneficial",
    feedback: {
      title: "Capping ad-hoc concurrency bounded contention without revoking anyone's access",
      explanation:
        "Bounding concurrent ad-hoc (BI + Data Science) admission to a sustainable level — queueing the rest rather than running everything at once — is this scenario's other legitimate alternate strong path, materially different from priority-queue admission: it changes how MUCH ad-hoc load may contend at all, rather than reordering who wins when it does. Ad-hoc access is never revoked, only throttled, satisfying the business invariant that BI/Data Science access must remain available.",
    },
  },
  {
    id: "acc_4",
    controlKey: AD_HOC_QUERY_CAP_KEY,
    valueEquals: "unlimited",
    whenTriggerEquals: { queryContention: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving ad-hoc concurrency unlimited lets ad-hoc load consume effectively all admission slots",
      explanation:
        "Unlimited ad-hoc concurrency is fine under ordinary load, but during a genuine contention spike it means ad-hoc queries can consume effectively every Query Gateway admission slot, starving the critical report job even if priority-queue admission is also engaged (priority only breaks ties for slots that exist; it does not create more of them). Capping, prioritizing, or both together are the real remediations.",
    },
  },

  // ── longRunningQueryPolicy ───────────────────────────────────────────
  {
    id: "acc_5",
    controlKey: LONG_RUNNING_QUERY_POLICY_KEY,
    valueEquals: "hard-kill",
    whenTriggerEquals: { queryContention: true, sustainedContention: true },
    outcome: "harmful",
    feedback: {
      title: "Hard-killing the long-running Data Science job destroyed its work with zero warning",
      explanation:
        "Terminating a long-running Data Science job immediately, with no checkpoint grace, looks like the fastest and most decisive fix — the SLA reads protected right away. But it destroys the job's entire accumulated compute with no warning and no chance to save partial work, a real, uncounted cost this scenario never treats as free. That lost-work exposure is permanent for this attempt (dataScienceLostWorkHoursCumulative only ever grows while a kill is active) and is penalized regardless of how healthy the SLA number looks afterward.",
    },
  },
  {
    id: "acc_6",
    controlKey: LONG_RUNNING_QUERY_POLICY_KEY,
    valueEquals: "graceful-stop",
    whenTriggerEquals: { queryContention: true, sustainedContention: true },
    outcome: "beneficial",
    feedback: {
      title: "Graceful-stop checkpointed the long-running job before terminating it",
      explanation:
        "Signaling a long-running Data Science job to checkpoint, then terminating it only once checkpointed, accepts a real but bounded lost-work cost (only the tail of work since the last checkpoint) instead of hard-kill's total loss. An honest middle ground: not free, but never catastrophic, and the job's owner retains most of its progress.",
    },
  },
  {
    id: "acc_7",
    controlKey: LONG_RUNNING_QUERY_POLICY_KEY,
    valueEquals: "allow",
    whenTriggerEquals: { queryContention: true, sustainedContention: true },
    outcome: "neutral",
    feedback: {
      title: "Allowing the long-running job to run to completion avoids any lost-work cost, but does not itself protect the SLA",
      explanation:
        "Never intervening on the long-running Data Science job means it keeps its full accumulated work, but by itself this neither protects nor threatens the critical report job's SLA — that outcome is governed by admissionPolicy and adHocQueryCap, independent of this control.",
    },
  },

  // ── adHocAccessPolicy ────────────────────────────────────────────────
  {
    id: "acc_8",
    controlKey: AD_HOC_ACCESS_POLICY_KEY,
    valueEquals: "revoked",
    whenTriggerEquals: { queryContention: true },
    outcome: "harmful",
    feedback: {
      title: "Revoking ad-hoc access entirely is an overcorrection that violates a real business invariant",
      explanation:
        "Cutting off all BI/Data Science ad-hoc query access \"guarantees\" the critical report job never contends for a slot — contention literally cannot happen if one side has no access at all. But this violates the explicit business requirement that ad-hoc access must never be revoked entirely, only throttled or queued, and it breaks real downstream consumers of ad-hoc output (dashboards, scheduled BI exports, other teams' own deadlines) with zero warning. Throttling (adHocQueryCap=capped) or prioritizing (admissionPolicy=priority-queue) is the correct bounded version of the same instinct.",
    },
  },
  {
    id: "acc_9",
    controlKey: AD_HOC_ACCESS_POLICY_KEY,
    valueEquals: "open",
    whenTriggerEquals: { queryContention: true },
    outcome: "beneficial",
    feedback: {
      title: "Keeping ad-hoc access open preserved BI/Data Science's real business need for warehouse access",
      explanation:
        "Leaving ad-hoc query access open — subject to whatever admission or cap policy is in effect — honors the business invariant that BI/Data Science access must not be revoked outright, even while the SLA is being protected through prioritization or capping instead.",
    },
  },

  // ── warehouseCapacityTier ────────────────────────────────────────────
  {
    id: "acc_10",
    controlKey: WAREHOUSE_CAPACITY_TIER_KEY,
    valueEquals: "scaled",
    whenTriggerEquals: { queryContention: true },
    outcome: "neutral",
    feedback: {
      title: "Scaling the Warehouse raised throughput but did not by itself protect the SLA",
      explanation:
        "Adding Warehouse capacity genuinely raises how many concurrent queries can execute and lowers utilization/latency — a real, legitimate accelerant on top of prioritization. But left with admissionPolicy=fifo and adHocQueryCap=unlimited, more capacity still gets consumed by whichever queries arrive first, which under heavy ad-hoc load is still mostly ad-hoc queries. Scaling alone is a real, continuous cost that does not substitute for workload prioritization.",
    },
  },
  {
    id: "acc_11",
    controlKey: WAREHOUSE_CAPACITY_TIER_KEY,
    valueEquals: "standard",
    whenTriggerEquals: { queryContention: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving Warehouse capacity at standard avoids the extra spend, relying entirely on prioritization",
      explanation:
        "Standard capacity is sufficient once admission is actually prioritized or ad-hoc load is capped — it simply means there is no extra throughput headroom on top of whichever prioritization strategy is in effect, without the real ongoing cost that scaling would add.",
    },
  },

  // ── reportDeadlineCommunication ──────────────────────────────────────
  {
    id: "acc_12",
    controlKey: DEADLINE_COMMUNICATION_KEY,
    valueEquals: "proactive-notice",
    whenTriggerEquals: { queryContention: true },
    outcome: "beneficial",
    feedback: {
      title: "Proactive notice told BI/Data Science stakeholders what was being throttled and why",
      explanation:
        "Surfacing which window is being bounded, why, and for how long — at the moment throttling or prioritization engages — never changes Warehouse mechanics or the SLA outcome by itself, but is the scenario's required \"bound and communicate the tradeoff rather than silently starving a stakeholder group\" behavior. A real, small ongoing cost (notification tooling), and a genuine operational-maturity distinction credited separately from whether the SLA itself is protected.",
    },
  },
  {
    id: "acc_13",
    controlKey: DEADLINE_COMMUNICATION_KEY,
    valueEquals: "silent",
    whenTriggerEquals: { queryContention: true },
    outcome: "neutral",
    feedback: {
      title: "Silent throttling applies the same policy with no stakeholder notice",
      explanation:
        "Leaving communication silent does not change whether the SLA is protected or ad-hoc access remains open — those outcomes are governed entirely by admissionPolicy, adHocQueryCap, and adHocAccessPolicy. But BI/Data Science stakeholders now experience slower or queued queries with no explanation, discovering the tradeoff only by noticing their own jobs are slow — a real, avoidable operational-maturity gap even on an otherwise fully safe path.",
    },
  },
];
