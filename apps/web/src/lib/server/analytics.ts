import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { analyticsEvents } from "@incidentrank/db";
import { db } from "./db";

/**
 * Phase 10G — lightweight first-party funnel analytics (docs/
 * implementation_plan/phase10g.metrics.md). A single, deliberately small
 * event vocabulary: one row per tracked user action, never a data
 * warehouse. See analyticsEvents' own schema comment for why `userId`
 * has no FK constraint.
 */
export const ANALYTICS_EVENT_NAMES = [
  "page_view",
  "homepage_view",
  "try_free_incident_clicked",
  "incident_view",
  "incident_acknowledged",
  "incident_started",
  "first_action_applied",
  "finish_clicked",
  "incident_finished",
  "signup_clicked",
  "signup_completed",
  "assessment_viewed",
  "assessment_started",
  "assessment_finished",
  "company_inquiry_submitted",
  "company_contact_opened",
  "weekly_challenge_viewed",
  "weekly_challenge_started",
  "weekly_challenge_finished",
  "challenge_created",
  "challenge_link_opened",
  "challenge_accepted",
  "challenge_finished",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export interface RecordAnalyticsEventInput {
  eventName: AnalyticsEventName;
  userId?: string | null;
  anonymousSessionId?: string | null;
  path?: string | null;
  scenarioSlug?: string | null;
  practiceOrAssessment?: "practice" | "assessment" | null;
  referrer?: string | null;
  context?: Record<string, unknown> | null;
}

/**
 * The one write path every event — client-submitted or server-fired —
 * goes through. Mirrors materializeBenchmarkAttemptFactSafely's
 * try/catch-and-swallow shape (apps/web/src/lib/server/benchmark/
 * materialize.ts): analytics must never fail or block the primary user
 * action (spec §11 "Performance"), so a DB error here is logged and
 * swallowed, never re-thrown. Callers do not need their own try/catch.
 */
export async function recordAnalyticsEvent(input: RecordAnalyticsEventInput): Promise<void> {
  try {
    await db.insert(analyticsEvents).values({
      eventName: input.eventName,
      userId: input.userId ?? null,
      anonymousSessionId: input.anonymousSessionId ?? null,
      path: input.path ?? null,
      scenarioSlug: input.scenarioSlug ?? null,
      practiceOrAssessment: input.practiceOrAssessment ?? null,
      referrer: input.referrer ?? null,
      context: input.context ?? null,
    });
  } catch (error) {
    console.error("[analytics] failed to record event", input.eventName, error);
  }
}

export type AnalyticsRange = "7d" | "30d" | "all";

function rangeStart(range: AnalyticsRange): Date | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function rangeWhere(range: AnalyticsRange) {
  const start = rangeStart(range);
  return start ? gte(analyticsEvents.createdAt, start) : undefined;
}

function countWhere(eventName: AnalyticsEventName, range: AnalyticsRange) {
  const base = eq(analyticsEvents.eventName, eventName);
  const rw = rangeWhere(range);
  return rw ? and(base, rw) : base;
}

async function countEvent(eventName: AnalyticsEventName, range: AnalyticsRange): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)` })
    .from(analyticsEvents)
    .where(countWhere(eventName, range));
  return Number(row?.value ?? 0);
}

async function countDistinctVisitors(range: AnalyticsRange): Promise<number> {
  const rw = rangeWhere(range);
  const where = rw ? and(eq(analyticsEvents.eventName, "page_view"), rw) : eq(analyticsEvents.eventName, "page_view");
  const [row] = await db
    .select({
      value: sql<number>`count(distinct coalesce(${analyticsEvents.userId}::text, ${analyticsEvents.anonymousSessionId}))`,
    })
    .from(analyticsEvents)
    .where(where);
  return Number(row?.value ?? 0);
}

export interface AnalyticsOverview {
  pageViews: number;
  uniqueVisitors: number;
  incidentViews: number;
  incidentsStarted: number;
  incidentsFinished: number;
  signupClicks: number;
  registrations: number;
  viewToStartPct: number | null;
  startToFinishPct: number | null;
  viewToRegistrationPct: number | null;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Spec §6 — the admin overview cards + the three computed conversion rates. */
export async function getAnalyticsOverview(range: AnalyticsRange): Promise<AnalyticsOverview> {
  const [
    pageViews,
    uniqueVisitors,
    incidentViews,
    incidentsStarted,
    incidentsFinished,
    signupClicks,
    registrations,
  ] = await Promise.all([
    countEvent("page_view", range),
    countDistinctVisitors(range),
    countEvent("incident_view", range),
    countEvent("incident_started", range),
    countEvent("incident_finished", range),
    countEvent("signup_clicked", range),
    countEvent("signup_completed", range),
  ]);

  return {
    pageViews,
    uniqueVisitors,
    incidentViews,
    incidentsStarted,
    incidentsFinished,
    signupClicks,
    registrations,
    viewToStartPct: pct(incidentsStarted, incidentViews),
    startToFinishPct: pct(incidentsFinished, incidentsStarted),
    viewToRegistrationPct: pct(registrations, incidentViews),
  };
}

export interface AnalyticsFunnelStage {
  name: string;
  eventName: AnalyticsEventName;
  count: number;
}

const FUNNEL_STAGES: { name: string; eventName: AnalyticsEventName }[] = [
  { name: "Incident Viewed", eventName: "incident_view" },
  { name: "Acknowledged", eventName: "incident_acknowledged" },
  { name: "Started", eventName: "incident_started" },
  { name: "First Action", eventName: "first_action_applied" },
  { name: "Finish Clicked", eventName: "finish_clicked" },
  { name: "Finished", eventName: "incident_finished" },
  { name: "Signup Clicked", eventName: "signup_clicked" },
  { name: "Registered", eventName: "signup_completed" },
];

/** Spec §7 — the funnel table with stage counts, in declared order. */
export async function getAnalyticsFunnel(range: AnalyticsRange): Promise<AnalyticsFunnelStage[]> {
  const counts = await Promise.all(
    FUNNEL_STAGES.map((stage) => countEvent(stage.eventName, range)),
  );
  return FUNNEL_STAGES.map((stage, i) => ({ ...stage, count: counts[i] ?? 0 }));
}

export interface ScenarioAnalyticsRow {
  scenarioSlug: string;
  views: number;
  starts: number;
  finishes: number;
  finishRatePct: number | null;
}

/** Spec §8 — per-scenario views/starts/finishes, sorted by views descending. */
export async function getAnalyticsByScenario(range: AnalyticsRange): Promise<ScenarioAnalyticsRow[]> {
  const rw = rangeWhere(range);

  async function countsByScenario(eventName: AnalyticsEventName): Promise<Map<string, number>> {
    const where = rw
      ? and(eq(analyticsEvents.eventName, eventName), rw)
      : eq(analyticsEvents.eventName, eventName);
    const rows = await db
      .select({
        scenarioSlug: analyticsEvents.scenarioSlug,
        value: sql<number>`count(*)`,
      })
      .from(analyticsEvents)
      .where(and(where, sql`${analyticsEvents.scenarioSlug} is not null`))
      .groupBy(analyticsEvents.scenarioSlug);
    return new Map(rows.map((r) => [r.scenarioSlug as string, Number(r.value)]));
  }

  const [views, starts, finishes] = await Promise.all([
    countsByScenario("incident_view"),
    countsByScenario("incident_started"),
    countsByScenario("incident_finished"),
  ]);

  const slugs = new Set([...views.keys(), ...starts.keys(), ...finishes.keys()]);
  const result: ScenarioAnalyticsRow[] = [...slugs].map((scenarioSlug) => {
    const viewCount = views.get(scenarioSlug) ?? 0;
    const finishCount = finishes.get(scenarioSlug) ?? 0;
    return {
      scenarioSlug,
      views: viewCount,
      starts: starts.get(scenarioSlug) ?? 0,
      finishes: finishCount,
      finishRatePct: pct(finishCount, viewCount),
    };
  });

  result.sort((a, b) => b.views - a.views);
  return result;
}

export interface ReferrerRow {
  referrer: string;
  count: number;
}

/** Spec §9 — basic referrer-host counts, no attribution logic. */
export async function getAnalyticsReferrers(range: AnalyticsRange): Promise<ReferrerRow[]> {
  const rw = rangeWhere(range);
  const where = rw
    ? and(eq(analyticsEvents.eventName, "page_view"), rw)
    : eq(analyticsEvents.eventName, "page_view");

  const rows = await db
    .select({
      referrer: sql<string>`coalesce(${analyticsEvents.referrer}, 'direct')`,
      value: sql<number>`count(*)`,
    })
    .from(analyticsEvents)
    .where(where)
    .groupBy(sql`coalesce(${analyticsEvents.referrer}, 'direct')`)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  return rows.map((r) => ({ referrer: r.referrer, count: Number(r.value) }));
}

export interface WeeklyChallengeStats {
  views: number;
  starts: number;
  finishes: number;
  challengesCreated: number;
  linksOpened: number;
  accepted: number;
}

/**
 * phase-challege-version.md §12/§13 — the 6 simple Weekly Challenge
 * counts, same Promise.all-of-countEvent shape as every other
 * aggregation function here. No separate dashboard, no new storage —
 * these are plain counts of the 7 events above.
 */
export async function getWeeklyChallengeStats(range: AnalyticsRange): Promise<WeeklyChallengeStats> {
  const [views, starts, finishes, challengesCreated, linksOpened, accepted] = await Promise.all([
    countEvent("weekly_challenge_viewed", range),
    countEvent("weekly_challenge_started", range),
    countEvent("weekly_challenge_finished", range),
    countEvent("challenge_created", range),
    countEvent("challenge_link_opened", range),
    countEvent("challenge_accepted", range),
  ]);

  return { views, starts, finishes, challengesCreated, linksOpened, accepted };
}
