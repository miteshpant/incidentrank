import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // How many work items currently have MORE THAN ONE worker believing
  // it owns them. Distinct from missedWorkItemCount — these items are
  // actively being double-processed, not dropped.
  ownershipConflictCount: 0,
  // How many work items currently have NO worker believing it owns
  // them, even though they still need processing. Distinct from
  // ownershipConflictCount — these items are stalled/orphaned, not
  // duplicated.
  missedWorkItemCount: 0,
  // How many workers are currently idle/blocked waiting on an ownership
  // assignment or reassignment signal that has not arrived.
  stalledWorkerCount: 0,
  // How many ownership leases are currently stale (past their recorded
  // renewal point from the Coordination Service's point of view).
  staleLeaseCount: 0,
  // Work items waiting to be claimed and processed at all.
  schedulerBacklogCount: 0,
  // Work items actually finished (not double-counted) per minute.
  completedWorkPerMinute: 480,
  // Work items processed more than once because two owners both
  // finished the same item — the real, observable duplication count,
  // distinct from ownershipConflictCount (a conflict can exist without
  // either owner having finished yet).
  duplicateWorkCompletedCount: 0,
  // Overall health classification the Coordination Service reports for
  // itself, driving componentHealth/severity bookkeeping.
  coordinationServiceStatus: "normal",
  // Generic string-state field recording WHY the system currently looks
  // the way it does — read only by successCondition/acceptableCondition/
  // scoring, never by any scenario-specific scorer code. "unresolved"
  // until a real mitigation state is reached.
  ownershipIntegrityMode: "unresolved",
};
