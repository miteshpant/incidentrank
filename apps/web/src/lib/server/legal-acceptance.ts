import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { legalAcceptances, type LegalAcceptance, type User } from "@incidentrank/db";
import { db } from "./db";
import {
  CURRENT_ASSESSMENT_NOTICE_VERSION,
  CURRENT_ORG_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  legalAcceptanceGateCutoverAt,
} from "./legal-versions";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export type LegalAcceptanceType =
  | "platform_terms"
  | "privacy_policy"
  | "candidate_assessment_notice"
  | "organization_business_terms";

/**
 * Phase 10D (docs/implementation_plan/phasse10d.md §55). userId is always
 * derived server-side by the caller (from getOrCreateCurrentUser()) —
 * this module never accepts a client-supplied user id. The version
 * recorded is always one of this module's own CURRENT_* constants,
 * never a client-supplied version string (§55: "reject unknown/future
 * versions supplied by client").
 */
export async function recordLegalAcceptance(
  userId: string,
  type: LegalAcceptanceType,
  opts: { organizationId?: string; assessmentId?: string; source?: string } = {},
  tx: TxOrDb = db,
): Promise<LegalAcceptance> {
  const base = {
    userId,
    acceptanceType: type,
    acceptanceSource: opts.source ?? "web",
  };

  const versionFields =
    type === "platform_terms"
      ? { termsVersion: CURRENT_TERMS_VERSION }
      : type === "privacy_policy"
        ? { privacyVersion: CURRENT_PRIVACY_VERSION }
        : type === "candidate_assessment_notice"
          ? { assessmentNoticeVersion: CURRENT_ASSESSMENT_NOTICE_VERSION }
          : { orgTermsVersion: CURRENT_ORG_TERMS_VERSION };

  const [created] = await tx
    .insert(legalAcceptances)
    .values({
      ...base,
      ...versionFields,
      organizationId: opts.organizationId ?? null,
      assessmentId: opts.assessmentId ?? null,
    })
    .returning();

  if (!created) throw new Error("Failed to record legal acceptance");
  return created;
}

/**
 * Latest acceptance row for (userId, type[, organizationId, assessmentId])
 * — a single-tuple lookup, so a plain orderBy+limit(1) is the right tool
 * here (unlike global-leaderboard.ts's bulk "latest row per every user"
 * scan, which needs a ROW_NUMBER() CTE because it reads many users at
 * once). Scoped lookups (organization_business_terms /
 * candidate_assessment_notice) must pass the matching scope id, or this
 * would return a different organization's/assessment's acceptance.
 */
async function getLatestAcceptance(
  userId: string,
  type: LegalAcceptanceType,
  scope: { organizationId?: string; assessmentId?: string } = {},
  tx: TxOrDb = db,
): Promise<LegalAcceptance | null> {
  const conditions = [eq(legalAcceptances.userId, userId), eq(legalAcceptances.acceptanceType, type)];
  conditions.push(
    scope.organizationId
      ? eq(legalAcceptances.organizationId, scope.organizationId)
      : isNull(legalAcceptances.organizationId),
  );
  conditions.push(
    scope.assessmentId
      ? eq(legalAcceptances.assessmentId, scope.assessmentId)
      : isNull(legalAcceptances.assessmentId),
  );

  const row = await tx.query.legalAcceptances.findFirst({
    where: and(...conditions),
    orderBy: [desc(legalAcceptances.createdAt)],
  });
  return row ?? null;
}

export interface LegalAcceptanceStatus {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  /** True only when BOTH current-version rows exist. */
  allCurrent: boolean;
}

export async function getCurrentAcceptanceStatus(
  userId: string,
  tx: TxOrDb = db,
): Promise<LegalAcceptanceStatus> {
  const [terms, privacy] = await Promise.all([
    getLatestAcceptance(userId, "platform_terms", {}, tx),
    getLatestAcceptance(userId, "privacy_policy", {}, tx),
  ]);

  const termsAccepted = terms?.termsVersion === CURRENT_TERMS_VERSION;
  const privacyAccepted = privacy?.privacyVersion === CURRENT_PRIVACY_VERSION;

  return {
    termsAccepted,
    privacyAccepted,
    allCurrent: termsAccepted && privacyAccepted,
  };
}

/**
 * The sign-up-time gate (confirmed product decision — see the approved
 * Phase 10D plan's "Gate mechanism" design decision; deliberately
 * deviates from spec §28's "gate all existing users without current
 * acceptance" in favor of gating only users created at or after
 * legalAcceptanceGateCutoverAt()). A user created before the cutover is
 * NEVER redirected here, even with zero acceptance rows — this is an
 * intentional, confirmed scope reduction, not an oversight.
 */
export async function requireCurrentLegalAcceptance(
  user: User,
): Promise<{ ok: true } | { ok: false; redirectTo: "/legal/accept" }> {
  if (user.createdAt < legalAcceptanceGateCutoverAt()) {
    return { ok: true };
  }
  const status = await getCurrentAcceptanceStatus(user.id);
  if (status.allCurrent) return { ok: true };
  return { ok: false, redirectTo: "/legal/accept" };
}

export async function requireCurrentAssessmentNotice(
  userId: string,
  organizationId: string,
  assessmentId: string,
  tx: TxOrDb = db,
): Promise<boolean> {
  const row = await getLatestAcceptance(
    userId,
    "candidate_assessment_notice",
    { organizationId, assessmentId },
    tx,
  );
  return row?.assessmentNoticeVersion === CURRENT_ASSESSMENT_NOTICE_VERSION;
}

export async function hasCurrentOrgBusinessTermsAcceptance(
  userId: string,
  organizationId: string,
  tx: TxOrDb = db,
): Promise<boolean> {
  const row = await getLatestAcceptance(userId, "organization_business_terms", { organizationId }, tx);
  return row?.orgTermsVersion === CURRENT_ORG_TERMS_VERSION;
}

export type { TxOrDb };
