/**
 * Phase 10A §52: shown on every organization page when the organization
 * is suspended. Historical data remains visible — this is purely
 * informational, the real enforcement is server-side via
 * requireActiveOrganization on mutation routes.
 */
export function SuspendedOrgBanner() {
  return (
    <p className="mb-6 rounded-md border border-[#dc2626]/40 bg-[#dc2626]/5 p-3 text-sm">
      This organization has been suspended by IncidentRank. Existing data remains visible, but
      new scenarios, assessments, candidates, and member invitations cannot be created until it
      is reactivated. Contact support@incidentrank.com with questions.
    </p>
  );
}
