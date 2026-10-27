import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { scenarios } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import {
  canMutate,
  loadOrganizationMembership,
  requireActiveOrganization,
} from "@/lib/server/organization-auth";
import { createOrgScenario } from "@/lib/server/scenario-authoring";
import type { AuthoredScenario } from "@incidentrank/scenarios/authoring";

interface CreateScenarioBody {
  name?: unknown;
  slug?: unknown;
}

/**
 * The minimal, fully-blank-but-structurally-valid authored document a new
 * scenario draft starts from. Every subsequent authoring-UI section edits
 * this document in place; nothing here executes until the author fills
 * it in and (eventually) publishes — a brand-new draft is never
 * compilable, which is expected and fine for a draft.
 */
function blankAuthoredScenario(name: string, slug: string): AuthoredScenario {
  return {
    schemaVersion: 1,
    basics: {
      name,
      slug,
      description: "",
      difficulty: "intermediate",
      estimatedMinutes: 15,
    },
    architecture: { nodes: [], edges: [] },
    controls: [],
    initialState: {},
    metrics: [],
    timelineEvents: [],
    rules: [],
    successCondition: { conditions: [], sustainedSeconds: 30 },
    failureCondition: { conditions: [], sustainedSeconds: 180 },
    scoring: {
      dimensions: [
        { dimension: "recovery", maxPoints: 300, bands: [{ points: 0 }] },
        { dimension: "customerImpact", maxPoints: 200, bands: [{ points: 0 }] },
        { dimension: "dataIntegrity", maxPoints: 200, bands: [{ points: 200 }] },
        { dimension: "reliability", maxPoints: 150, bands: [{ points: 0 }] },
        { dimension: "costEfficiency", maxPoints: 100, bands: [{ points: 0 }] },
        { dimension: "operationalEfficiency", maxPoints: 50, bands: [{ points: 0 }] },
      ],
    },
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const membership = await loadOrganizationMembership(slug, user);
  if (!membership.ok) {
    return NextResponse.json(
      { error: membership.status === 404 ? "Not found" : "Forbidden" },
      { status: membership.status },
    );
  }
  if (!canMutate(membership.membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const activeCheck = requireActiveOrganization(membership.organization);
  if (!activeCheck.ok) {
    return NextResponse.json({ error: activeCheck.reason }, { status: activeCheck.status });
  }

  const body = (await request.json().catch(() => null)) as CreateScenarioBody | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const scenarioSlug = typeof body?.slug === "string" ? body.slug.trim() : "";

  if (name.length === 0 || scenarioSlug.length === 0) {
    return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(scenarioSlug)) {
    return NextResponse.json(
      { error: "slug must be lowercase letters, numbers, and hyphens only" },
      { status: 400 },
    );
  }

  // Scoped to this organization, never global — an organization-owned
  // scenario's slug only needs to be unique within that organization
  // (see packages/db/src/schema.ts's partial unique indexes and
  // docs/implementation_plan/phase6.md). A different organization, or a
  // built-in scenario, legitimately may already use this exact slug.
  const existing = await db.query.scenarios.findFirst({
    where: and(
      eq(scenarios.organizationId, membership.organization.id),
      eq(scenarios.slug, scenarioSlug),
    ),
  });
  if (existing) {
    return NextResponse.json(
      { error: "Your organization already has a scenario with this slug" },
      { status: 409 },
    );
  }

  const { scenario, draft } = await createOrgScenario(
    membership.organization.id,
    user.id,
    name,
    blankAuthoredScenario(name, scenarioSlug),
  );

  return NextResponse.json({ scenario, draft });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const membership = await loadOrganizationMembership(slug, user);
  if (!membership.ok) {
    return NextResponse.json(
      { error: membership.status === 404 ? "Not found" : "Forbidden" },
      { status: membership.status },
    );
  }

  const rows = await db.query.scenarios.findMany({
    where: and(
      eq(scenarios.organizationId, membership.organization.id),
      eq(scenarios.ownershipType, "organization"),
    ),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  return NextResponse.json({ scenarios: rows });
}
