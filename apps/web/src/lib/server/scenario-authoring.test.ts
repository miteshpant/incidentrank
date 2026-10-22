import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  assessments,
  organizationMembers,
  organizations,
  scenarios,
  scenarioVersions,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { paymentRetryStorm } from "@incidentrank/scenarios";
import type { AuthoredScenario } from "@incidentrank/scenarios/authoring";
import { loadOrgScenario, listOrgAssessableScenarios } from "./scenario-access";
import {
  createOrgScenario,
  saveScenarioDraft,
  publishScenarioDraft,
  createNewDraftFromPublished,
  archiveScenario,
} from "./scenario-authoring";
import { getActiveScenarioById, resolveSimulationDefinition } from "./scenario-registry";

/**
 * Integration tests against the local Postgres. Covers Phase 5's scenario
 * ownership/authorization, cross-org privacy, draft/publish/version
 * lifecycle, assessment pinning, archive behavior, and authored-scenario
 * resume — matching the test list in docs/implementation_plan/phase5.md.
 */

let testDb: Db;

const TEST_AUTH_OWNER = "test-scenario-auth-owner";
const TEST_AUTH_ADMIN = "test-scenario-auth-admin";
const TEST_AUTH_MEMBER = "test-scenario-auth-member";
const TEST_AUTH_OTHER_OWNER = "test-scenario-auth-other-owner";
const TEST_ORG_SLUG = "test-scenario-auth-acme";
const TEST_OTHER_ORG_SLUG = "test-scenario-auth-globex";

beforeAll(() => {
  testDb = createDb();
});

afterEach(async () => {
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_OTHER_ORG_SLUG));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_ADMIN));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_MEMBER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OTHER_OWNER));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createOrgWithMember(
  authId: string,
  slug: string,
  name: string,
  role: "owner" | "admin" | "member" = "owner",
) {
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: authId, displayName: name })
    .returning();
  if (!user) throw new Error("user not created");

  let org = await testDb.query.organizations.findFirst({ where: eq(organizations.slug, slug) });
  if (!org) {
    const [created] = await testDb.insert(organizations).values({ name, slug }).returning();
    if (!created) throw new Error("org not created");
    org = created;
  }

  await testDb.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role });

  return { user, org };
}

function buildMinimalAuthoredScenario(slug: string): AuthoredScenario {
  return {
    schemaVersion: 1,
    basics: {
      name: "Test Scenario",
      slug,
      description: "A minimal valid scenario for integration testing.",
      difficulty: "intermediate",
      estimatedMinutes: 10,
    },
    architecture: {
      nodes: [{ id: "api", label: "API", type: "service" }],
      edges: [],
    },
    controls: [
      {
        key: "poolSize",
        label: "Pool Size",
        type: "select",
        allowedValues: [10, 50],
        initialValue: 10,
        componentId: "api",
      },
    ],
    initialState: { errorRate: 0 },
    metrics: [
      { key: "errorRate", label: "Error Rate", sourceStateKey: "errorRate", format: "percentage" },
    ],
    timelineEvents: [
      {
        id: "spike",
        atSeconds: 10,
        label: "Spike",
        message: "Traffic spike begins.",
        setTriggers: { spiking: true },
      },
    ],
    rules: [
      {
        id: "spiking",
        when: [{ source: "trigger", key: "spiking", equals: true }],
        incidentState: "degraded",
        setValues: { errorRate: 10 },
      },
      {
        id: "default",
        when: [],
        incidentState: "healthy",
        setValues: { errorRate: 0 },
      },
    ],
    successCondition: {
      conditions: [{ key: "errorRate", operator: "less_than", comparedTo: 1 }],
      sustainedSeconds: 5,
    },
    failureCondition: {
      conditions: [{ key: "errorRate", operator: "greater_than_or_equal", comparedTo: 50 }],
      sustainedSeconds: 60,
    },
    scoring: {
      dimensions: [
        { dimension: "recovery", maxPoints: 300, bands: [{ points: 300 }] },
        { dimension: "customerImpact", maxPoints: 200, bands: [{ points: 200 }] },
        { dimension: "dataIntegrity", maxPoints: 200, bands: [{ points: 200 }] },
        { dimension: "reliability", maxPoints: 150, bands: [{ points: 150 }] },
        { dimension: "costEfficiency", maxPoints: 100, bands: [{ points: 100 }] },
        { dimension: "operationalEfficiency", maxPoints: 50, bands: [{ points: 50 }] },
      ],
    },
  };
}

describe("scenario creation", () => {
  it("owner/admin can create a draft scenario with its first draft version", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");

    const { scenario, draft } = await createOrgScenario(
      org.id,
      user.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-scenario-creation-slug"),
    );

    expect(scenario.ownershipType).toBe("organization");
    expect(scenario.organizationId).toBe(org.id);
    expect(scenario.visibility).toBe("private");
    expect(scenario.status).toBe("draft");
    expect(draft.scenarioId).toBe(scenario.id);
    expect(draft.version).toBe(1);
    expect(draft.status).toBe("draft");
  });
});

describe("member permissions", () => {
  it("loadOrgScenario succeeds for a plain member (read access) but canMutate gating is the caller's responsibility", async () => {
    const { user: owner, org } = await createOrgWithMember(
      TEST_AUTH_OWNER,
      TEST_ORG_SLUG,
      "Acme Corp",
      "owner",
    );
    const { user: member } = await createOrgWithMember(
      TEST_AUTH_MEMBER,
      TEST_ORG_SLUG,
      "Member",
      "member",
    );

    const { scenario } = await createOrgScenario(
      org.id,
      owner.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-member-permission-slug"),
    );

    const result = await loadOrgScenario(TEST_ORG_SLUG, scenario.id, member);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The route layer is what rejects mutation for non-owner/admin
      // (via canMutate(result.membership.role)) — loadOrgScenario itself
      // only establishes "is this user a member of the owning org."
      expect(result.membership.role).toBe("member");
    }
  });
});

describe("cross-org privacy", () => {
  it("org B cannot load org A's scenario", async () => {
    const { user: ownerA, org: orgA } = await createOrgWithMember(
      TEST_AUTH_OWNER,
      TEST_ORG_SLUG,
      "Acme Corp",
    );
    const { user: ownerB } = await createOrgWithMember(
      TEST_AUTH_OTHER_OWNER,
      TEST_OTHER_ORG_SLUG,
      "Globex",
    );

    const { scenario } = await createOrgScenario(
      orgA.id,
      ownerA.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-cross-org-privacy-slug"),
    );

    const resultViaOwnSlug = await loadOrgScenario(TEST_OTHER_ORG_SLUG, scenario.id, ownerB);
    expect(resultViaOwnSlug.ok).toBe(false);
    if (!resultViaOwnSlug.ok) expect(resultViaOwnSlug.status).toBe(404);
  });

  it("org B's assessable-scenarios list never includes org A's scenario, even published", async () => {
    const { user: ownerA, org: orgA } = await createOrgWithMember(
      TEST_AUTH_OWNER,
      TEST_ORG_SLUG,
      "Acme Corp",
    );
    const { org: orgB } = await createOrgWithMember(
      TEST_AUTH_OTHER_OWNER,
      TEST_OTHER_ORG_SLUG,
      "Globex",
    );

    const { scenario } = await createOrgScenario(
      orgA.id,
      ownerA.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-cross-org-list-slug"),
    );
    const publishResult = await publishScenarioDraft(scenario);
    expect(publishResult.ok).toBe(true);

    const orgBAssessable = await listOrgAssessableScenarios(orgB.id);
    expect(orgBAssessable.find((row) => row.scenario.id === scenario.id)).toBeUndefined();

    const orgAAssessable = await listOrgAssessableScenarios(orgA.id);
    expect(orgAAssessable.find((row) => row.scenario.id === scenario.id)).toBeDefined();
  });

  it("getActiveScenarioById never resolves another organization's scenario", async () => {
    const { user: ownerA, org: orgA } = await createOrgWithMember(
      TEST_AUTH_OWNER,
      TEST_ORG_SLUG,
      "Acme Corp",
    );
    const { org: orgB } = await createOrgWithMember(
      TEST_AUTH_OTHER_OWNER,
      TEST_OTHER_ORG_SLUG,
      "Globex",
    );

    const { scenario } = await createOrgScenario(
      orgA.id,
      ownerA.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-cross-org-resolve-slug"),
    );
    await publishScenarioDraft(scenario);

    const resolvedForOtherOrg = await getActiveScenarioById(scenario.id, orgB.id);
    expect(resolvedForOtherOrg).toBeNull();

    const resolvedForOwnOrg = await getActiveScenarioById(scenario.id, orgA.id);
    expect(resolvedForOwnOrg).not.toBeNull();
  });
});

describe("control validation", () => {
  it("an initial control value outside allowedValues is rejected at publish", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const authored = buildMinimalAuthoredScenario("test-control-validation-slug");
    authored.controls[0]!.initialValue = 999;

    const { scenario } = await createOrgScenario(org.id, user.id, "Test Scenario", authored);
    const result = await publishScenarioDraft(scenario);

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "invalid") {
      expect(result.errors.some((e) => e.path.includes("initialValue"))).toBe(true);
    }
  });
});

describe("rule validation", () => {
  it("a rule referencing an unknown control is rejected at publish", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const authored = buildMinimalAuthoredScenario("test-rule-validation-slug");
    authored.rules.push({
      id: "bad-rule",
      when: [{ source: "control", key: "unknownControl", operator: "equals", comparedTo: 1 }],
      incidentState: "bad",
      setValues: { errorRate: 5 },
    });

    const { scenario } = await createOrgScenario(org.id, user.id, "Test Scenario", authored);
    const result = await publishScenarioDraft(scenario);

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "invalid") {
      expect(result.errors.some((e) => e.message.includes("unknownControl"))).toBe(true);
    }
  });
});

describe("operator validation", () => {
  it("an unsupported success-condition operator is rejected at publish", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const authored = buildMinimalAuthoredScenario("test-operator-validation-slug");
    authored.successCondition.conditions[0] = {
      key: "errorRate",
      operator: "matches" as never,
      comparedTo: 1,
    };

    const { scenario } = await createOrgScenario(org.id, user.id, "Test Scenario", authored);
    const result = await publishScenarioDraft(scenario);

    expect(result.ok).toBe(false);
  });
});

describe("timed-event validation", () => {
  it("a negative timeline-event time is rejected at publish", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const authored = buildMinimalAuthoredScenario("test-timed-event-validation-slug");
    authored.timelineEvents[0]!.atSeconds = -5;

    const { scenario } = await createOrgScenario(org.id, user.id, "Test Scenario", authored);
    const result = await publishScenarioDraft(scenario);

    expect(result.ok).toBe(false);
  });
});

describe("success/failure validation", () => {
  it("an outcome condition with zero conditions is rejected at publish", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const authored = buildMinimalAuthoredScenario("test-outcome-validation-slug");
    authored.failureCondition.conditions = [];

    const { scenario } = await createOrgScenario(org.id, user.id, "Test Scenario", authored);
    const result = await publishScenarioDraft(scenario);

    expect(result.ok).toBe(false);
  });
});

describe("compilation", () => {
  it("a valid authored draft compiles to a simulator-compatible definition via publish + resolve", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const { scenario } = await createOrgScenario(
      org.id,
      user.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-compilation-slug"),
    );

    const publishResult = await publishScenarioDraft(scenario);
    expect(publishResult.ok).toBe(true);
    if (!publishResult.ok) return;

    const definition = await resolveSimulationDefinition(
      publishResult.scenario,
      publishResult.published.version,
    );
    expect(definition).not.toBeNull();
    expect(definition?.controls).toHaveLength(1);
  });
});

describe("determinism", () => {
  it("resolving the same published version twice yields equivalent compiled definitions", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const { scenario } = await createOrgScenario(
      org.id,
      user.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-determinism-slug"),
    );
    const publishResult = await publishScenarioDraft(scenario);
    expect(publishResult.ok).toBe(true);
    if (!publishResult.ok) return;

    const first = await resolveSimulationDefinition(scenario, publishResult.published.version);
    const second = await resolveSimulationDefinition(scenario, publishResult.published.version);

    expect(first).toEqual(second);
  });
});

describe("publish", () => {
  it("a fully valid draft publishes successfully and flips scenario status", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const { scenario } = await createOrgScenario(
      org.id,
      user.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-publish-slug"),
    );

    const result = await publishScenarioDraft(scenario);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.published.status).toBe("published");
      expect(result.published.publishedAt).not.toBeNull();
      expect(result.scenario.status).toBe("published");
    }
  });
});

describe("invalid publish", () => {
  it("an invalid draft cannot publish and the scenario status remains draft", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const authored = buildMinimalAuthoredScenario("test-invalid-publish-slug");
    authored.rules = []; // no fallback rule — invalid

    const { scenario } = await createOrgScenario(org.id, user.id, "Test Scenario", authored);
    const result = await publishScenarioDraft(scenario);

    expect(result.ok).toBe(false);

    const refetched = await testDb.query.scenarios.findFirst({
      where: eq(scenarios.id, scenario.id),
    });
    expect(refetched?.status).toBe("draft");
  });
});

describe("immutability", () => {
  it("a published scenario_versions row is never mutated by a subsequent save_draft call", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const { scenario } = await createOrgScenario(
      org.id,
      user.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-immutability-slug"),
    );
    const publishResult = await publishScenarioDraft(scenario);
    expect(publishResult.ok).toBe(true);
    if (!publishResult.ok) return;

    const publishedVersionId = publishResult.published.id;
    const originalDefinition = publishResult.published.definitionJson;

    // No draft exists anymore (it became the published version) — a
    // direct save attempt must fail rather than silently mutate it.
    const saveResult = await saveScenarioDraft(scenario.id, buildMinimalAuthoredScenario("mutated-slug"));
    expect(saveResult.ok).toBe(false);

    const refetched = await testDb.query.scenarioVersions.findFirst({
      where: eq(scenarioVersions.id, publishedVersionId),
    });
    expect(refetched?.definitionJson).toEqual(originalDefinition);
    expect(refetched?.status).toBe("published");
  });
});

describe("new version", () => {
  it("editing a published v1 produces a separate v2 draft without touching v1", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const { scenario } = await createOrgScenario(
      org.id,
      user.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-new-version-slug"),
    );
    const publishResult = await publishScenarioDraft(scenario);
    expect(publishResult.ok).toBe(true);
    if (!publishResult.ok) return;

    const editResult = await createNewDraftFromPublished(publishResult.scenario, user.id);
    expect(editResult.ok).toBe(true);
    if (editResult.ok) {
      expect(editResult.draft.version).toBe(2);
      expect(editResult.draft.status).toBe("draft");
    }

    const v1 = await testDb.query.scenarioVersions.findFirst({
      where: eq(scenarioVersions.id, publishResult.published.id),
    });
    expect(v1?.status).toBe("published");
    expect(v1?.version).toBe(1);
  });

  it("refuses to create a second draft when one already exists", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const { scenario } = await createOrgScenario(
      org.id,
      user.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-second-draft-slug"),
    );

    const result = await createNewDraftFromPublished(scenario, user.id);
    // No published version exists yet — this scenario has only its initial draft.
    expect(result.ok).toBe(false);
  });
});

describe("assessment pinning", () => {
  it("an assessment created against v1 stays on v1 after v2 publishes", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const { scenario } = await createOrgScenario(
      org.id,
      user.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-assessment-pinning-slug"),
    );
    const v1PublishResult = await publishScenarioDraft(scenario);
    expect(v1PublishResult.ok).toBe(true);
    if (!v1PublishResult.ok) return;

    const [assessment] = await testDb
      .insert(assessments)
      .values({
        organizationId: org.id,
        name: "Pinned Assessment",
        scenarioId: scenario.id,
        scenarioVersion: v1PublishResult.published.version,
        createdByUserId: user.id,
      })
      .returning();
    if (!assessment) throw new Error("assessment not created");

    const editResult = await createNewDraftFromPublished(v1PublishResult.scenario, user.id);
    expect(editResult.ok).toBe(true);
    const v2PublishResult = await publishScenarioDraft(v1PublishResult.scenario);
    expect(v2PublishResult.ok).toBe(true);
    if (!v2PublishResult.ok) return;
    expect(v2PublishResult.published.version).toBe(2);

    const refetchedAssessment = await testDb.query.assessments.findFirst({
      where: eq(assessments.id, assessment.id),
    });
    expect(refetchedAssessment?.scenarioVersion).toBe(1);

    const resolvedForAssessment = await resolveSimulationDefinition(
      scenario,
      refetchedAssessment!.scenarioVersion,
    );
    expect(resolvedForAssessment).not.toBeNull();
  });
});

describe("scenario selection", () => {
  it("org assessment selector shows own published scenarios only, never drafts", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");

    const { scenario: draftScenario } = await createOrgScenario(
      org.id,
      user.id,
      "Draft Scenario",
      buildMinimalAuthoredScenario("test-scenario-selection-draft-slug"),
    );

    const { scenario: publishedScenario } = await createOrgScenario(
      org.id,
      user.id,
      "Published Scenario",
      buildMinimalAuthoredScenario("test-scenario-selection-published-slug"),
    );
    await publishScenarioDraft(publishedScenario);

    const assessable = await listOrgAssessableScenarios(org.id);
    const ids = assessable.map((row) => row.scenario.id);

    expect(ids).toContain(publishedScenario.id);
    expect(ids).not.toContain(draftScenario.id);
  });
});

describe("draft excluded", () => {
  it("a draft-only scenario cannot be resolved via getActiveScenarioById", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const { scenario } = await createOrgScenario(
      org.id,
      user.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-draft-excluded-slug"),
    );

    const resolved = await getActiveScenarioById(scenario.id, org.id);
    expect(resolved).toBeNull();
  });
});

describe("archive", () => {
  it("an archived scenario is excluded from the assessment selector", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const { scenario } = await createOrgScenario(
      org.id,
      user.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-archive-slug"),
    );
    await publishScenarioDraft(scenario);

    const beforeArchive = await listOrgAssessableScenarios(org.id);
    expect(beforeArchive.map((r) => r.scenario.id)).toContain(scenario.id);

    await archiveScenario(scenario);

    const afterArchive = await listOrgAssessableScenarios(org.id);
    expect(afterArchive.map((r) => r.scenario.id)).not.toContain(scenario.id);
  });

  it("an existing assessment against an archived scenario still resolves its pinned version", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const { scenario } = await createOrgScenario(
      org.id,
      user.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-archive-existing-slug"),
    );
    const publishResult = await publishScenarioDraft(scenario);
    expect(publishResult.ok).toBe(true);
    if (!publishResult.ok) return;

    await archiveScenario(publishResult.scenario);

    const resolved = await resolveSimulationDefinition(scenario, publishResult.published.version);
    expect(resolved).not.toBeNull();
  });
});

describe("candidate privacy", () => {
  it("resolveSimulationDefinition's compiled output never carries scoring bands", async () => {
    const { user, org } = await createOrgWithMember(TEST_AUTH_OWNER, TEST_ORG_SLUG, "Acme Corp");
    const { scenario } = await createOrgScenario(
      org.id,
      user.id,
      "Test Scenario",
      buildMinimalAuthoredScenario("test-candidate-privacy-slug"),
    );
    const publishResult = await publishScenarioDraft(scenario);
    expect(publishResult.ok).toBe(true);
    if (!publishResult.ok) return;

    const definition = await resolveSimulationDefinition(scenario, publishResult.published.version);
    expect(definition).not.toBeNull();
    expect(definition).not.toHaveProperty("scoring");
    expect(JSON.stringify(definition)).not.toContain("maxPoints");
    expect(JSON.stringify(definition)).not.toContain("bands");
  });
});

describe("Payment Retry Storm regression", () => {
  it("the built-in scenario still resolves through the same resolveSimulationDefinition path, unaffected by org-scenario changes", async () => {
    const builtin = await testDb.query.scenarios.findFirst({
      where: eq(scenarios.slug, paymentRetryStorm.slug),
    });
    if (!builtin) throw new Error("seed scenario missing — run pnpm db:seed");

    const definition = await resolveSimulationDefinition(builtin, paymentRetryStorm.version);
    expect(definition).not.toBeNull();
    expect(definition?.controls.length).toBeGreaterThan(0);
  });
});
