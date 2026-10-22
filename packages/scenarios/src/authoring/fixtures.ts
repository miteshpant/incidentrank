import type { AuthoredScenario } from "./schema";

/**
 * A minimal, fully valid authored scenario used across authoring tests.
 * Deliberately mirrors the spec's own "Database Connection Saturation"
 * manual-validation example (Flow A) — architecture nodes Client/API/
 * Postgres/Worker, a pool-size control, a saturation trigger, and three
 * rules including the required fallback.
 */
export function buildValidAuthoredScenario(
  overrides: Partial<AuthoredScenario> = {},
): AuthoredScenario {
  const base: AuthoredScenario = {
    schemaVersion: 1,
    basics: {
      name: "Database Connection Saturation",
      slug: "db-connection-saturation-authored",
      description: "A traffic spike exhausts the database connection pool.",
      difficulty: "intermediate",
      estimatedMinutes: 10,
      instructions: "Restore the API to a healthy state.",
    },
    architecture: {
      nodes: [
        { id: "client", label: "Client", type: "client" },
        { id: "api", label: "API", type: "service" },
        { id: "postgres", label: "Postgres", type: "database" },
        { id: "worker", label: "Worker", type: "service" },
      ],
      edges: [
        { from: "client", to: "api" },
        { from: "api", to: "postgres" },
        { from: "worker", to: "postgres" },
      ],
    },
    controls: [
      {
        key: "poolSize",
        label: "DB Pool Size",
        type: "select",
        allowedValues: [20, 50, 100, 200],
        initialValue: 20,
        componentId: "postgres",
      },
      {
        key: "readReplicaEnabled",
        label: "Read Replica Enabled",
        type: "toggle",
        allowedValues: [false, true],
        initialValue: false,
        componentId: "postgres",
      },
    ],
    initialState: {
      connectionUsage: 40,
      errorRate: 0.1,
      dbStatus: "normal",
    },
    metrics: [
      { key: "connectionUsage", label: "Connection Usage", sourceStateKey: "connectionUsage", format: "percentage" },
      { key: "errorRate", label: "Error Rate", sourceStateKey: "errorRate", format: "percentage" },
    ],
    timelineEvents: [
      {
        id: "saturation-begins",
        atSeconds: 30,
        label: "Traffic spike",
        message: "A traffic spike is exhausting the connection pool.",
        setTriggers: { saturating: true },
      },
    ],
    rules: [
      {
        id: "saturating-small-pool",
        when: [
          { source: "trigger", key: "saturating", equals: true },
          { source: "control", key: "poolSize", operator: "at_most", comparedTo: 50 },
        ],
        incidentState: "saturated",
        setValues: { connectionUsage: 98, errorRate: 22, dbStatus: "critical" },
        setComponentHealth: { api: "degraded", postgres: "critical" },
      },
      {
        id: "saturating-large-pool",
        when: [
          { source: "trigger", key: "saturating", equals: true },
          { source: "control", key: "poolSize", operator: "at_least", comparedTo: 100 },
        ],
        incidentState: "recovering",
        setValues: { connectionUsage: 55, errorRate: 0.5, dbStatus: "normal" },
        setComponentHealth: { api: "healthy", postgres: "healthy" },
      },
      {
        id: "healthy-default",
        when: [],
        incidentState: "healthy",
        setValues: { connectionUsage: 40, errorRate: 0.1, dbStatus: "normal" },
        setComponentHealth: { api: "healthy", postgres: "healthy" },
      },
    ],
    successCondition: {
      conditions: [
        { key: "connectionUsage", operator: "less_than_or_equal", comparedTo: 60 },
        { key: "errorRate", operator: "less_than", comparedTo: 1 },
      ],
      sustainedSeconds: 15,
    },
    failureCondition: {
      conditions: [{ key: "errorRate", operator: "greater_than_or_equal", comparedTo: 20 }],
      sustainedSeconds: 60,
    },
    scoring: {
      dimensions: [
        {
          dimension: "recovery",
          maxPoints: 300,
          bands: [
            { atMost: 60, points: 300 },
            { atMost: 120, points: 200 },
            { points: 50 },
          ],
        },
        {
          dimension: "customerImpact",
          maxPoints: 200,
          bands: [
            { atMost: 10_000, points: 200 },
            { points: 50 },
          ],
        },
        {
          dimension: "dataIntegrity",
          maxPoints: 200,
          bands: [{ points: 200 }],
        },
        {
          dimension: "reliability",
          maxPoints: 150,
          bands: [
            { atMost: 0.3, points: 150 },
            { points: 50 },
          ],
        },
        {
          dimension: "costEfficiency",
          maxPoints: 100,
          bands: [
            { atMost: 0.5, points: 100 },
            { points: 20 },
          ],
        },
        {
          dimension: "operationalEfficiency",
          maxPoints: 50,
          bands: [
            { atMost: 1, points: 50 },
            { points: 10 },
          ],
        },
      ],
    },
  };

  return { ...base, ...overrides };
}
