import { getLatestRankSnapshotForUser } from "@/lib/server/engineer-rank";
import { isEngineerRankEnabled } from "@/lib/server/feature-flags";

const BAND_LABEL: Record<string, string> = {
  developing: "Developing",
  intermediate: "Intermediate",
  senior: "Senior",
  staff: "Staff",
  senior_staff: "Senior Staff",
  principal: "Principal",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  low: "Low confidence",
  medium: "Established evidence",
  high: "Strong evidence",
};

// Humanized labels for the real, established scoring-dimension column
// names (recoveryScore/customerImpactScore/.../operationalEfficiencyScore)
// — preserved per docs/implementation_plan/phase10c.md §4's explicit
// instruction not to rename established dimensions for UI convenience.
const DIMENSION_LABEL: Record<string, string> = {
  recovery: "Recovery",
  customerImpact: "Customer Impact",
  dataIntegrity: "Data Integrity",
  reliability: "Reliability",
  costEfficiency: "Cost Efficiency",
  operationalEfficiency: "Operational Efficiency",
};

const DIMENSION_ORDER = [
  "recovery",
  "customerImpact",
  "dataIntegrity",
  "reliability",
  "costEfficiency",
  "operationalEfficiency",
];

/**
 * Self-contained Engineer Rank display (docs/implementation_plan/
 * phase10c.md §13/§14/§60/§61), following IncidentPassPanel's exact
 * self-contained-server-fetch-panel pattern. Always reads only the
 * caller's own userId — never a route parameter (spec §16/§54/§55's
 * privacy boundary). Renders nothing at all when the feature flag is
 * off, so the profile page is unchanged when disabled.
 */
export async function EngineerRankPanel({ userId }: { userId: string }) {
  if (!isEngineerRankEnabled()) {
    return null;
  }

  const snapshot = await getLatestRankSnapshotForUser(userId);

  return (
    <div className="mt-10 border-t border-border pt-6">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Engineer Rank</h2>

      {!snapshot ? (
        <p className="mt-3 text-sm text-muted">
          Not enough evidence yet. Complete more incidents to establish your rank.
        </p>
      ) : snapshot.provisional ? (
        <p className="mt-3 text-sm text-foreground">
          Provisional {BAND_LABEL[snapshot.rankBand] ?? snapshot.rankBand} — Based on{" "}
          {snapshot.qualifyingAttempts} completed incidents.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-foreground">
            IncidentRank level: {BAND_LABEL[snapshot.rankBand] ?? snapshot.rankBand}
          </p>
          <p className="mt-1 text-xs text-muted">
            {CONFIDENCE_LABEL[snapshot.confidence] ?? snapshot.confidence}
          </p>

          <div className="mt-4 space-y-1.5">
            {DIMENSION_ORDER.map((dim) => {
              const scores = snapshot.dimensionScoresJson as Record<string, number>;
              const value = scores[dim];
              if (typeof value !== "number") return null;
              // dimensionScoresJson values are already on the attempts
              // table's native per-dimension raw score scale (e.g.
              // recovery is 0-300), averaged across qualifying attempts —
              // NOT a 0-1 normalized fraction like normalizedScore, so no
              // additional scaling is applied here.
              return (
                <div key={dim} className="flex items-center justify-between text-sm">
                  <span className="text-muted">{DIMENSION_LABEL[dim] ?? dim}</span>
                  <span className="font-mono text-foreground">{Math.round(value)}</span>
                </div>
              );
            })}
          </div>

          <TopSkillAreas skillScoresJson={snapshot.skillScoresJson as Record<string, { attempts: number; avgNormalizedScore: number }>} />

          <p className="mt-4 text-xs text-muted">
            Your IncidentRank level is based on the difficulty, breadth, and consistency of your
            completed practice incidents.
          </p>
        </>
      )}
    </div>
  );
}

function TopSkillAreas({
  skillScoresJson,
}: {
  skillScoresJson: Record<string, { attempts: number; avgNormalizedScore: number }>;
}) {
  const top = Object.entries(skillScoresJson)
    .sort(([, a], [, b]) => b.attempts - a.attempts)
    .slice(0, 4);

  if (top.length === 0) return null;

  return (
    <div className="mt-4">
      <h3 className="font-mono text-[10px] uppercase tracking-wide text-muted">Skill Areas</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {top.map(([category, stats]) => (
          <span
            key={category}
            className="rounded-md border border-border px-2 py-1 text-xs text-foreground"
          >
            {category} <span className="text-muted">({stats.attempts})</span>
          </span>
        ))}
      </div>
    </div>
  );
}
