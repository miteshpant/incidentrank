import "server-only";
import { sql } from "drizzle-orm";
import { organizationCreditLedger } from "@incidentrank/db";
import { db } from "./db";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export interface OrganizationCreditBalance {
  purchased: number;
  consumed: number;
  adjusted: number;
  available: number;
}

/**
 * The one central credit-balance reader (docs/implementation_plan/
 * phase10b.md §13). Every UI/route that needs a balance calls this —
 * never re-derive balance logic separately elsewhere. The ledger
 * (organization_credit_ledger) is the sole source of truth; `available`
 * is always SUM(quantity) over the organization's rows, broken out by
 * transaction-type bucket purely for display (purchased/consumed/
 * adjusted never need to independently sum to `available` via anything
 * other than straight addition, since quantities are already signed).
 */
export async function getOrganizationCreditBalance(
  organizationId: string,
  tx: TxOrDb = db,
): Promise<OrganizationCreditBalance> {
  const rows = await tx
    .select({
      purchased: sql<string>`COALESCE(SUM(${organizationCreditLedger.quantity}) FILTER (WHERE ${organizationCreditLedger.transactionType} = 'purchase'), 0)`,
      consumed: sql<string>`COALESCE(SUM(${organizationCreditLedger.quantity}) FILTER (WHERE ${organizationCreditLedger.transactionType} = 'assessment_started'), 0)`,
      adjusted: sql<string>`COALESCE(SUM(${organizationCreditLedger.quantity}) FILTER (WHERE ${organizationCreditLedger.transactionType} NOT IN ('purchase', 'assessment_started')), 0)`,
      available: sql<string>`COALESCE(SUM(${organizationCreditLedger.quantity}), 0)`,
    })
    .from(organizationCreditLedger)
    .where(sql`${organizationCreditLedger.organizationId} = ${organizationId}`);

  const row = rows[0];
  return {
    purchased: Number(row?.purchased ?? 0),
    // Stored as a negative signed quantity; surfaced to callers/UI as a
    // positive "credits consumed" count. `|| 0` normalizes -0 to 0.
    consumed: -Number(row?.consumed ?? 0) || 0,
    adjusted: Number(row?.adjusted ?? 0),
    available: Number(row?.available ?? 0),
  };
}

export interface RecordOrganizationCreditPurchaseResult {
  inserted: boolean; // false = already recorded (idempotent webhook replay)
}

/**
 * Inserts exactly one purchase ledger entry, keyed by Stripe Checkout
 * Session ID (phase10b.md §12/§20/§21). Relies on
 * organization_credit_ledger_purchase_session_idx (the partial unique
 * index on stripeCheckoutSessionId WHERE transaction_type = 'purchase')
 * to make webhook replay/concurrent delivery a safe no-op rather than a
 * double-credit — onConflictDoNothing against that exact target, exactly
 * like paid_entitlements_one_founding_per_user_idx's established
 * pattern. Caller (the webhook handler) is responsible for having
 * already validated the Price ID and resolved the organization/quantity
 * before calling this — this function only performs the insert.
 */
export async function recordOrganizationCreditPurchase(
  tx: TxOrDb,
  input: {
    organizationId: string;
    quantity: number;
    stripeCheckoutSessionId: string;
    stripePaymentIntentId: string | null;
    purchasingUserId: string | null;
    amountTotalUsdCents?: number | null;
    currency?: string | null;
    discountAmountUsdCents?: number | null;
  },
): Promise<RecordOrganizationCreditPurchaseResult> {
  const [inserted] = await tx
    .insert(organizationCreditLedger)
    .values({
      organizationId: input.organizationId,
      transactionType: "purchase",
      quantity: input.quantity,
      stripeCheckoutSessionId: input.stripeCheckoutSessionId,
      stripePaymentIntentId: input.stripePaymentIntentId,
      createdByUserId: input.purchasingUserId,
      // phase10e.md §15: the real amount actually collected for this
      // purchase — never estimated from list price.
      amountTotalUsdCents: input.amountTotalUsdCents ?? null,
      currency: input.currency ?? null,
      discountAmountUsdCents: input.discountAmountUsdCents ?? null,
    })
    .onConflictDoNothing({
      target: organizationCreditLedger.stripeCheckoutSessionId,
      where: sql`${organizationCreditLedger.transactionType} = 'purchase'`,
    })
    .returning();

  return { inserted: Boolean(inserted) };
}

export type ConsumeOrganizationCreditResult =
  | { ok: true; inserted: true }
  | { ok: true; inserted: false } // already consumed for this attempt — idempotent replay
  | { ok: false; reason: "insufficient_balance" };

/**
 * Race-safe credit consumption (phase10b.md §24-§28). Must be called
 * inside the same transaction that creates/starts the attempt — the
 * caller (the assessment-start route) is responsible for that framing;
 * this function's own job is: lock the organization's existing ledger
 * rows, verify available balance >= 1, then insert the -1 consumption
 * entry keyed by attemptId.
 *
 * Locking strategy: `SELECT ... FOR UPDATE` against the organization's
 * ledger rows serializes concurrent consumption attempts for the SAME
 * organization (two candidates racing for the last credit), while the
 * partial unique index on (attemptId) WHERE transaction_type =
 * 'assessment_started' is the backstop for the SAME attempt being
 * started twice concurrently (phase10b.md §28) — mirroring founding-
 * allocation.ts's dual-layer pattern (lock for the scarce-resource race,
 * unique index for the same-identity-twice race) rather than relying on
 * either alone. A fresh organization with zero ledger rows has nothing
 * to lock, which is correct: FOR UPDATE on an empty result set simply
 * locks nothing, and the balance check below still reads 0 either way.
 */
export async function consumeOrganizationCreditForAttempt(
  tx: TxOrDb,
  input: {
    organizationId: string;
    assessmentId: string;
    attemptId: string;
  },
): Promise<ConsumeOrganizationCreditResult> {
  // Lock this organization's ledger rows for the duration of the
  // transaction so a concurrent consumption attempt for the same
  // organization blocks here until this transaction commits/rolls back,
  // rather than both readers observing the same pre-consumption balance.
  await tx.execute(sql`
    SELECT id FROM organization_credit_ledger
    WHERE organization_id = ${input.organizationId}
    FOR UPDATE
  `);

  const balance = await getOrganizationCreditBalance(input.organizationId, tx);
  if (balance.available < 1) {
    return { ok: false, reason: "insufficient_balance" };
  }

  try {
    const [inserted] = await tx
      .insert(organizationCreditLedger)
      .values({
        organizationId: input.organizationId,
        transactionType: "assessment_started",
        quantity: -1,
        assessmentId: input.assessmentId,
        attemptId: input.attemptId,
      })
      .onConflictDoNothing({
        target: organizationCreditLedger.attemptId,
        where: sql`${organizationCreditLedger.transactionType} = 'assessment_started'`,
      })
      .returning();

    return inserted ? { ok: true, inserted: true } : { ok: true, inserted: false };
  } catch (error) {
    // Postgres unique-violation on a genuinely concurrent duplicate
    // insert for the same attemptId that the onConflictDoNothing target
    // didn't catch pre-execution (defense in depth — mirrors founding-
    // allocation.ts's identical 23505 handling).
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: unknown }).code === "23505"
    ) {
      return { ok: true, inserted: false };
    }
    throw error;
  }
}

export type AdjustOrganizationCreditResult =
  | { ok: true }
  | { ok: false; reason: "would_go_negative" };

/**
 * Platform-admin credit adjustment (phase10b.md §39/§40). Allows +/-N
 * but requires a reason and never permits an adjustment that would drive
 * `available` below 0 — this is the only guard against an invalid
 * negative balance for admin-initiated changes (consumption's own
 * guard is consumeOrganizationCreditForAttempt above). Never edits or
 * deletes historical ledger rows; always inserts a new one.
 */
export async function adjustOrganizationCredit(
  tx: TxOrDb,
  input: {
    organizationId: string;
    quantity: number;
    reason: string;
    createdByUserId: string;
    relatedAttemptId?: string | null;
  },
): Promise<AdjustOrganizationCreditResult> {
  await tx.execute(sql`
    SELECT id FROM organization_credit_ledger
    WHERE organization_id = ${input.organizationId}
    FOR UPDATE
  `);

  const balance = await getOrganizationCreditBalance(input.organizationId, tx);
  if (balance.available + input.quantity < 0) {
    return { ok: false, reason: "would_go_negative" };
  }

  await tx.insert(organizationCreditLedger).values({
    organizationId: input.organizationId,
    transactionType: "admin_adjustment",
    quantity: input.quantity,
    attemptId: input.relatedAttemptId ?? null,
    reason: input.reason,
    createdByUserId: input.createdByUserId,
  });

  return { ok: true };
}
