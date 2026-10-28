import "server-only";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  foundingEngineerAllocations,
  organizationCreditLedger,
  organizationMembers,
  organizations,
  organizationStripeCustomers,
  paidEntitlements,
  stripeCustomers,
  stripeSubscriptions,
  users,
} from "@incidentrank/db";
import { db } from "./db";
import { getPlanPriceId } from "./stripe/config";
import {
  FOUNDING_LIFETIME_PRICE_USD_CENTS,
  orgCreditPurchaseUsdCentsForQuantity,
  proAnnualMrrUsdCents,
  proMonthlyMrrUsdCents,
} from "./stripe/revenue-pricing";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/**
 * Phase 10C Platform Customer & Revenue Dashboard aggregation module
 * (docs/implementation_plan/phase10c.md Part B). Mirrors
 * organization-credits.ts's shape: pure, independently testable
 * aggregate-query functions, `tx: TxOrDb = db` convention. No auth
 * concept lives here (matches organization-credits.ts's own lack of
 * inline auth) — every caller is an already-admin-gated route/view.
 */

// ─────────────────────────────────────────────────────────────────────────
// Platform summary
// ─────────────────────────────────────────────────────────────────────────

export interface PlatformSummary {
  totalUsers: number;
  totalOrganizations: number;
  freeUsers: number;
  activePro: { monthly: number; annual: number; total: number };
  foundingEngineers: number;
  organizationsWithPurchases: number;
  organizationsWithAvailableCredits: number;
  suspendedOrganizations: number;
  creditsTotals: { purchased: number; consumed: number; available: number };
}

export async function getPlatformSummary(tx: TxOrDb = db): Promise<PlatformSummary> {
  const [userCountRow] = await tx.select({ count: sql<string>`count(*)` }).from(users);
  const [orgCountRow] = await tx.select({ count: sql<string>`count(*)` }).from(organizations);
  const [suspendedRow] = await tx
    .select({ count: sql<string>`count(*)` })
    .from(organizations)
    .where(eq(organizations.status, "suspended"));

  const monthlyPriceId = getPlanPriceId("pro_monthly");
  const annualPriceId = getPlanPriceId("pro_annual");
  const [monthlyRow] = await tx
    .select({ count: sql<string>`count(*)` })
    .from(stripeSubscriptions)
    .where(and(eq(stripeSubscriptions.stripeStatus, "active"), eq(stripeSubscriptions.stripePriceId, monthlyPriceId)));
  const [annualRow] = await tx
    .select({ count: sql<string>`count(*)` })
    .from(stripeSubscriptions)
    .where(and(eq(stripeSubscriptions.stripeStatus, "active"), eq(stripeSubscriptions.stripePriceId, annualPriceId)));

  const [foundingRow] = await tx
    .select({ count: sql<string>`count(*)` })
    .from(paidEntitlements)
    .where(and(eq(paidEntitlements.entitlementType, "founding_lifetime"), eq(paidEntitlements.status, "active")));

  const [proActiveRow] = await tx
    .select({ count: sql<string>`count(distinct ${paidEntitlements.userId})` })
    .from(paidEntitlements)
    .where(and(eq(paidEntitlements.entitlementType, "pro"), eq(paidEntitlements.status, "active")));
  const [foundingActiveUsersRow] = await tx
    .select({ count: sql<string>`count(distinct ${paidEntitlements.userId})` })
    .from(paidEntitlements)
    .where(and(eq(paidEntitlements.entitlementType, "founding_lifetime"), eq(paidEntitlements.status, "active")));

  const totalUsers = Number(userCountRow?.count ?? 0);
  const paidUserCount = Number(proActiveRow?.count ?? 0) + Number(foundingActiveUsersRow?.count ?? 0);

  const creditRows = await tx
    .select({
      purchased: sql<string>`COALESCE(SUM(${organizationCreditLedger.quantity}) FILTER (WHERE ${organizationCreditLedger.transactionType} = 'purchase'), 0)`,
      consumed: sql<string>`COALESCE(SUM(${organizationCreditLedger.quantity}) FILTER (WHERE ${organizationCreditLedger.transactionType} = 'assessment_started'), 0)`,
      available: sql<string>`COALESCE(SUM(${organizationCreditLedger.quantity}), 0)`,
    })
    .from(organizationCreditLedger);
  const creditRow = creditRows[0];

  const [orgsWithPurchasesRow] = await tx
    .select({ count: sql<string>`count(distinct ${organizationCreditLedger.organizationId})` })
    .from(organizationCreditLedger)
    .where(eq(organizationCreditLedger.transactionType, "purchase"));

  const orgsWithAvailableRows = await tx
    .select({
      organizationId: organizationCreditLedger.organizationId,
      available: sql<string>`SUM(${organizationCreditLedger.quantity})`,
    })
    .from(organizationCreditLedger)
    .groupBy(organizationCreditLedger.organizationId)
    .having(sql`SUM(${organizationCreditLedger.quantity}) > 0`);

  return {
    totalUsers,
    totalOrganizations: Number(orgCountRow?.count ?? 0),
    freeUsers: Math.max(0, totalUsers - paidUserCount),
    activePro: {
      monthly: Number(monthlyRow?.count ?? 0),
      annual: Number(annualRow?.count ?? 0),
      total: Number(monthlyRow?.count ?? 0) + Number(annualRow?.count ?? 0),
    },
    foundingEngineers: Number(foundingRow?.count ?? 0),
    organizationsWithPurchases: Number(orgsWithPurchasesRow?.count ?? 0),
    organizationsWithAvailableCredits: orgsWithAvailableRows.length,
    suspendedOrganizations: Number(suspendedRow?.count ?? 0),
    creditsTotals: {
      purchased: Number(creditRow?.purchased ?? 0),
      consumed: -Number(creditRow?.consumed ?? 0) || 0,
      available: Number(creditRow?.available ?? 0),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Date range helper
// ─────────────────────────────────────────────────────────────────────────

export type DateRange = "today" | "7d" | "30d" | "all";

export function resolveDateRangeBounds(range: DateRange, now: Date = new Date()): { from: Date | null; to: Date } {
  const to = now;
  if (range === "all") return { from: null, to };
  if (range === "today") {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  const days = range === "7d" ? 7 : 30;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

// ─────────────────────────────────────────────────────────────────────────
// Revenue summary
// ─────────────────────────────────────────────────────────────────────────

export interface RevenueSummary {
  mrrUsdCents: number;
  foundingGrossUsdCents: number;
  orgCreditGrossUsdCents: number;
  totalGrossCollectedUsdCents: number;
}

/**
 * MRR is always "right now" (a run-rate), never scoped by `range` — it
 * is intentionally computed from currently-active subscriptions
 * regardless of the requested date range. Founding and org-credit gross
 * ARE scoped by range (genuinely one-time, timestamped events).
 *
 * Founding and org credits are structurally absent from the MRR query —
 * no join to paidEntitlements/organizationCreditLedger at all, a
 * stronger guarantee than a runtime filter (phase10c.md §25/§44).
 */
export async function getRevenueSummary(range: DateRange, tx: TxOrDb = db): Promise<RevenueSummary> {
  const { from, to } = resolveDateRangeBounds(range);

  const monthlyPriceId = getPlanPriceId("pro_monthly");
  const annualPriceId = getPlanPriceId("pro_annual");
  const [monthlyActiveRow] = await tx
    .select({ count: sql<string>`count(*)` })
    .from(stripeSubscriptions)
    .where(and(eq(stripeSubscriptions.stripeStatus, "active"), eq(stripeSubscriptions.stripePriceId, monthlyPriceId)));
  const [annualActiveRow] = await tx
    .select({ count: sql<string>`count(*)` })
    .from(stripeSubscriptions)
    .where(and(eq(stripeSubscriptions.stripeStatus, "active"), eq(stripeSubscriptions.stripePriceId, annualPriceId)));

  const mrrUsdCents =
    Number(monthlyActiveRow?.count ?? 0) * proMonthlyMrrUsdCents() +
    Number(annualActiveRow?.count ?? 0) * proAnnualMrrUsdCents();

  const foundingConditions = [eq(foundingEngineerAllocations.status, "issued")];
  if (from) foundingConditions.push(gte(foundingEngineerAllocations.issuedAt, from));
  foundingConditions.push(lt(foundingEngineerAllocations.issuedAt, to));
  const [foundingIssuedRow] = await tx
    .select({ count: sql<string>`count(*)` })
    .from(foundingEngineerAllocations)
    .where(and(...foundingConditions));
  const foundingGrossUsdCents = Number(foundingIssuedRow?.count ?? 0) * FOUNDING_LIFETIME_PRICE_USD_CENTS;

  const orgCreditConditions = [eq(organizationCreditLedger.transactionType, "purchase")];
  if (from) orgCreditConditions.push(gte(organizationCreditLedger.createdAt, from));
  orgCreditConditions.push(lt(organizationCreditLedger.createdAt, to));
  const orgCreditPurchaseRows = await tx
    .select({ quantity: organizationCreditLedger.quantity })
    .from(organizationCreditLedger)
    .where(and(...orgCreditConditions));
  const orgCreditGrossUsdCents = orgCreditPurchaseRows.reduce(
    (sum, row) => sum + orgCreditPurchaseUsdCentsForQuantity(row.quantity),
    0,
  );

  return {
    mrrUsdCents,
    foundingGrossUsdCents,
    orgCreditGrossUsdCents,
    totalGrossCollectedUsdCents: foundingGrossUsdCents + orgCreditGrossUsdCents,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// User customer list
// ─────────────────────────────────────────────────────────────────────────

export interface UserCustomerRow {
  userId: string;
  /** Clerk's identity id — pass this, never userId, to resolveEmailsForUsers. */
  authProviderId: string;
  displayName: string;
  createdAt: Date;
  currentAccess: "free" | "pro" | "founding";
  subscriptionPlan: "monthly" | "annual" | null;
  subscriptionStatus: string | null;
  foundingStatus: "lifetime" | null;
  totalPurchasedUsdCents: number;
  lastPurchaseAt: Date | null;
  stripeCustomerId: string | null;
}

export type CustomerSort = "newest" | "oldest" | "highest_spend" | "recently_purchased";

export interface ListUserCustomersOpts {
  page: number;
  pageSize: number;
  sort: CustomerSort;
  filters?: {
    plan?: "free" | "pro" | "founding";
    hasSubscription?: "active" | "canceled";
    hasPurchased?: boolean;
  };
  /** Pre-resolved from Clerk by the caller before invoking this — never resolved inside. */
  searchAuthProviderIds?: string[];
}

export async function listUserCustomers(
  opts: ListUserCustomersOpts,
  tx: TxOrDb = db,
): Promise<{ rows: UserCustomerRow[]; total: number }> {
  const pageSize = Math.min(Math.max(1, opts.pageSize), 100);
  const page = Math.max(1, opts.page);

  const conditions = [];
  if (opts.searchAuthProviderIds) {
    conditions.push(
      opts.searchAuthProviderIds.length > 0
        ? inArray(users.authProviderId, opts.searchAuthProviderIds)
        : sql`false`,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await tx.select({ count: sql<string>`count(*)` }).from(users).where(whereClause);
  const total = Number(totalRow?.count ?? 0);

  const allUsers = await tx.query.users.findMany({
    where: whereClause,
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  const userIds = allUsers.map((u) => u.id);
  if (userIds.length === 0) return { rows: [], total };

  const entitlements = await tx.query.paidEntitlements.findMany({
    where: and(inArray(paidEntitlements.userId, userIds), eq(paidEntitlements.status, "active")),
  });
  const subscriptions = await tx.query.stripeSubscriptions.findMany({
    where: and(inArray(stripeSubscriptions.userId, userIds), eq(stripeSubscriptions.stripeStatus, "active")),
  });
  const customers = await tx.query.stripeCustomers.findMany({
    where: inArray(stripeCustomers.userId, userIds),
  });

  const monthlyPriceId = getPlanPriceId("pro_monthly");

  const customerById = new Map(customers.map((c) => [c.userId, c]));
  const entitlementsByUser = new Map<string, typeof entitlements>();
  for (const e of entitlements) {
    const list = entitlementsByUser.get(e.userId) ?? [];
    list.push(e);
    entitlementsByUser.set(e.userId, list);
  }
  const subscriptionByUser = new Map(subscriptions.map((s) => [s.userId, s]));

  let rows: UserCustomerRow[] = allUsers.map((u) => {
    const userEntitlements = entitlementsByUser.get(u.id) ?? [];
    const founding = userEntitlements.find((e) => e.entitlementType === "founding_lifetime");
    const pro = userEntitlements.find((e) => e.entitlementType === "pro");
    const subscription = subscriptionByUser.get(u.id);

    const currentAccess: UserCustomerRow["currentAccess"] = founding ? "founding" : pro ? "pro" : "free";

    const totalPurchasedUsdCents =
      (founding ? FOUNDING_LIFETIME_PRICE_USD_CENTS : 0) +
      (pro
        ? subscription?.stripePriceId === monthlyPriceId
          ? proMonthlyMrrUsdCents()
          : proAnnualMrrUsdCents()
        : 0);

    return {
      userId: u.id,
      authProviderId: u.authProviderId,
      displayName: u.displayName,
      createdAt: u.createdAt,
      currentAccess,
      subscriptionPlan: subscription ? (subscription.stripePriceId === monthlyPriceId ? "monthly" : "annual") : null,
      subscriptionStatus: subscription?.stripeStatus ?? null,
      foundingStatus: founding ? "lifetime" : null,
      totalPurchasedUsdCents,
      lastPurchaseAt: founding?.createdAt ?? pro?.createdAt ?? null,
      stripeCustomerId: customerById.get(u.id)?.stripeCustomerId ?? null,
    };
  });

  if (opts.filters?.plan) {
    rows = rows.filter((r) => r.currentAccess === opts.filters!.plan);
  }
  if (opts.filters?.hasSubscription === "active") {
    rows = rows.filter((r) => r.subscriptionStatus === "active");
  } else if (opts.filters?.hasSubscription === "canceled") {
    rows = rows.filter((r) => r.subscriptionStatus !== null && r.subscriptionStatus !== "active");
  }
  if (opts.filters?.hasPurchased === true) {
    rows = rows.filter((r) => r.totalPurchasedUsdCents > 0);
  } else if (opts.filters?.hasPurchased === false) {
    rows = rows.filter((r) => r.totalPurchasedUsdCents === 0);
  }

  const filteredTotal = conditions.length > 0 || opts.filters ? rows.length : total;

  rows.sort((a, b) => {
    switch (opts.sort) {
      case "oldest":
        return a.createdAt.getTime() - b.createdAt.getTime();
      case "highest_spend":
        return b.totalPurchasedUsdCents - a.totalPurchasedUsdCents;
      case "recently_purchased":
        return (b.lastPurchaseAt?.getTime() ?? 0) - (a.lastPurchaseAt?.getTime() ?? 0);
      case "newest":
      default:
        return b.createdAt.getTime() - a.createdAt.getTime();
    }
  });

  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total: filteredTotal };
}

// ─────────────────────────────────────────────────────────────────────────
// Organization customer list
// ─────────────────────────────────────────────────────────────────────────

export interface OrganizationCustomerRow {
  organizationId: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  ownerDisplayNames: string[];
  creditsPurchased: number;
  creditsConsumed: number;
  creditsAvailable: number;
  totalPurchasedUsdCents: number;
  lastPurchaseAt: Date | null;
  stripeCustomerId: string | null;
}

export interface ListOrganizationCustomersOpts {
  page: number;
  pageSize: number;
  sort: CustomerSort;
  filters?: {
    status?: "suspended";
    zeroCredit?: boolean;
    hasPurchased?: boolean;
  };
  searchSlugOrName?: string;
  searchStripeCustomerId?: string;
}

export async function listOrganizationCustomers(
  opts: ListOrganizationCustomersOpts,
  tx: TxOrDb = db,
): Promise<{ rows: OrganizationCustomerRow[]; total: number }> {
  const pageSize = Math.min(Math.max(1, opts.pageSize), 100);
  const page = Math.max(1, opts.page);

  let orgIdsFromStripeFilter: string[] | null = null;
  if (opts.searchStripeCustomerId) {
    const matches = await tx.query.organizationStripeCustomers.findMany({
      where: eq(organizationStripeCustomers.stripeCustomerId, opts.searchStripeCustomerId),
    });
    orgIdsFromStripeFilter = matches.map((m) => m.organizationId);
  }

  const conditions = [];
  if (opts.filters?.status === "suspended") {
    conditions.push(eq(organizations.status, "suspended"));
  }
  if (opts.searchSlugOrName) {
    const q = `%${opts.searchSlugOrName.toLowerCase()}%`;
    conditions.push(sql`(lower(${organizations.name}) LIKE ${q} OR lower(${organizations.slug}) LIKE ${q})`);
  }
  if (orgIdsFromStripeFilter !== null) {
    conditions.push(
      orgIdsFromStripeFilter.length > 0 ? inArray(organizations.id, orgIdsFromStripeFilter) : sql`false`,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const allOrgs = await tx.query.organizations.findMany({
    where: whereClause,
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (allOrgs.length === 0) return { rows: [], total: 0 };

  const orgIds = allOrgs.map((o) => o.id);

  const members = await tx.query.organizationMembers.findMany({
    where: and(inArray(organizationMembers.organizationId, orgIds), eq(organizationMembers.role, "owner")),
    with: { user: true },
  });
  const ledgerRows = await tx
    .select({
      organizationId: organizationCreditLedger.organizationId,
      purchased: sql<string>`COALESCE(SUM(${organizationCreditLedger.quantity}) FILTER (WHERE ${organizationCreditLedger.transactionType} = 'purchase'), 0)`,
      consumed: sql<string>`COALESCE(SUM(${organizationCreditLedger.quantity}) FILTER (WHERE ${organizationCreditLedger.transactionType} = 'assessment_started'), 0)`,
      available: sql<string>`COALESCE(SUM(${organizationCreditLedger.quantity}), 0)`,
      lastPurchaseAt: sql<string | null>`MAX(${organizationCreditLedger.createdAt}) FILTER (WHERE ${organizationCreditLedger.transactionType} = 'purchase')`,
    })
    .from(organizationCreditLedger)
    .where(inArray(organizationCreditLedger.organizationId, orgIds))
    .groupBy(organizationCreditLedger.organizationId);
  const purchaseRows = await tx
    .select({ organizationId: organizationCreditLedger.organizationId, quantity: organizationCreditLedger.quantity })
    .from(organizationCreditLedger)
    .where(and(inArray(organizationCreditLedger.organizationId, orgIds), eq(organizationCreditLedger.transactionType, "purchase")));
  const stripeMappings = await tx.query.organizationStripeCustomers.findMany({
    where: inArray(organizationStripeCustomers.organizationId, orgIds),
  });

  const ownersByOrg = new Map<string, string[]>();
  for (const m of members) {
    const list = ownersByOrg.get(m.organizationId) ?? [];
    list.push(m.user.displayName);
    ownersByOrg.set(m.organizationId, list);
  }
  const ledgerByOrg = new Map(ledgerRows.map((r) => [r.organizationId, r]));
  const stripeByOrg = new Map(stripeMappings.map((s) => [s.organizationId, s.stripeCustomerId]));

  const grossByOrg = new Map<string, number>();
  for (const row of purchaseRows) {
    const current = grossByOrg.get(row.organizationId) ?? 0;
    grossByOrg.set(row.organizationId, current + orgCreditPurchaseUsdCentsForQuantity(row.quantity));
  }

  let rows: OrganizationCustomerRow[] = allOrgs.map((org) => {
    const ledger = ledgerByOrg.get(org.id);
    const purchased = Number(ledger?.purchased ?? 0);
    const consumed = -Number(ledger?.consumed ?? 0) || 0;
    const available = Number(ledger?.available ?? 0);
    return {
      organizationId: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      createdAt: org.createdAt,
      ownerDisplayNames: ownersByOrg.get(org.id) ?? [],
      creditsPurchased: purchased,
      creditsConsumed: consumed,
      creditsAvailable: available,
      totalPurchasedUsdCents: grossByOrg.get(org.id) ?? 0,
      lastPurchaseAt: ledger?.lastPurchaseAt ? new Date(ledger.lastPurchaseAt) : null,
      stripeCustomerId: stripeByOrg.get(org.id) ?? null,
    };
  });

  if (opts.filters?.zeroCredit === true) {
    rows = rows.filter((r) => r.creditsAvailable === 0);
  }
  if (opts.filters?.hasPurchased === true) {
    rows = rows.filter((r) => r.creditsPurchased > 0);
  } else if (opts.filters?.hasPurchased === false) {
    rows = rows.filter((r) => r.creditsPurchased === 0);
  }

  const filteredTotal = rows.length;

  rows.sort((a, b) => {
    switch (opts.sort) {
      case "oldest":
        return a.createdAt.getTime() - b.createdAt.getTime();
      case "highest_spend":
        return b.totalPurchasedUsdCents - a.totalPurchasedUsdCents;
      case "recently_purchased":
        return (b.lastPurchaseAt?.getTime() ?? 0) - (a.lastPurchaseAt?.getTime() ?? 0);
      case "newest":
      default:
        return b.createdAt.getTime() - a.createdAt.getTime();
    }
  });

  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total: filteredTotal };
}
