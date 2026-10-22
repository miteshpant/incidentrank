# IncidentRank — Phase 0 Restart

We are restarting the IncidentRank implementation.

Previous work incorrectly started moving toward a mathematical infrastructure simulation engine.

That is NOT the product.

Do not build a physics engine, queueing model, capacity model, cloud simulator, or mathematical distributed-systems simulator.

IncidentRank is a **system design and production incident assessment platform**.

Think:

**HackerRank for production incidents and system-design reasoning.**

---

# Core Product Concept

A company or IncidentRank author creates a predefined incident scenario.

Example:

**Payment Retry Storm**

The candidate sees an existing production system:

```text
Client
  ↓
API Gateway
  ↓
Checkout Service
  ↓
Payment Service
  ├── Payment Provider
  ↓
Postgres
  ↓
Kafka
```

The system is experiencing an incident.

The candidate can inspect:

- architecture
- metrics
- logs
- service state
- incident timeline

The candidate can operate the system using predefined controls:

- dropdowns
- toggles
- buttons
- configuration selections

There is NO free-text answer.

There is NO LLM required.

The scenario author defines:

- starting state
- incident
- available actions
- consequences of actions
- state transitions
- success conditions
- failure conditions
- scoring

The candidate's actions determine which path the incident takes.

---

# IMPORTANT PRODUCT PRINCIPLE

IncidentRank does NOT attempt to mathematically simulate AWS, Kubernetes, databases, networks, queues, or real distributed systems.

Instead, each scenario contains **authored deterministic system behavior**.

For example:

```text
IF:
payment provider = degraded
AND retries = 3
AND backoff = none

THEN:
payment traffic = critical
checkout success = 72%
provider latency = 4.8s
db pressure = high
```

If the candidate changes:

```text
retries 3 → 1
```

the scenario may transition to:

```text
payment traffic = high
checkout success = 84%
provider latency = 3.1s
db pressure = medium
```

If they then enable:

```text
exponential backoff
```

the scenario may transition to:

```text
payment traffic = normalizing
checkout success = 94%
provider latency = 1.8s
db pressure = medium
```

These consequences are authored as part of the scenario.

The engine evaluates rules and transitions.

It does NOT invent infrastructure physics.

---

# Phase 0 Goal

Build the technical foundation for this product.

At the end of Phase 0 we need:

1. working local web app
2. clean monorepo
3. basic IncidentRank landing page
4. incident listing page
5. scenario domain model
6. incident state model
7. action model
8. rule/transition model
9. attempt event model
10. scoring model interfaces
11. tests for scenario execution
12. architecture documentation

Do NOT build the full Payment Retry Storm UI yet.

Do NOT build auth yet.

Do NOT build database persistence yet.

---

# Technology

Use:

- Next.js
- React
- TypeScript
- pnpm
- Tailwind CSS
- Vitest

Keep dependencies minimal.

Do NOT add:

- Redux
- Kafka
- Redis
- Docker
- Kubernetes
- database
- ORM
- Clerk/Auth0
- AI SDK
- cloud simulation libraries

---

# Repository Structure

Use:

```text
incidentrank/
├── apps/
│   └── web/
│
├── packages/
│   ├── engine/
│   └── scenarios/
│
├── docs/
│   ├── architecture.md
│   └── scenario-model.md
│
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Rename the previous `simulator` concept to:

```text
engine
```

The engine is a **scenario execution engine**, not a system simulator.

---

# Domain Model

The most important work in Phase 0 is getting the scenario model correct.

A scenario should be a self-contained executable definition.

Conceptually:

```ts
interface ScenarioDefinition {
  id: string;
  slug: string;

  name: string;
  description: string;

  difficulty:
    | "beginner"
    | "intermediate"
    | "senior"
    | "staff";

  estimatedMinutes: number;

  architecture: ArchitectureDefinition;

  initialState: IncidentState;

  controls: ControlDefinition[];

  rules: ScenarioRule[];

  successConditions: Condition[];

  failureConditions?: Condition[];

  scoring: ScoringDefinition;
}
```

Do not over-generalize yet.

We only need enough flexibility to support our first incident.

---

# Architecture Definition

A scenario defines the system shown to the candidate.

Example:

```ts
interface ArchitectureDefinition {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
}
```

Example node:

```ts
interface ArchitectureNode {
  id: string;
  label: string;

  type:
    | "gateway"
    | "service"
    | "database"
    | "queue"
    | "external-service";
}
```

Example edge:

```ts
interface ArchitectureEdge {
  from: string;
  to: string;
}
```

This is for visualization and control targeting.

No performance calculations belong here.

---

# Incident State

The incident state represents what the candidate currently sees.

Use simple authored state values.

Example:

```ts
interface IncidentState {
  status:
    | "healthy"
    | "degraded"
    | "critical"
    | "resolved"
    | "failed";

  metrics: Record<string, MetricValue>;

  system: Record<string, ComponentState>;

  flags: Record<string, boolean | string | number>;

  elapsedSeconds: number;
}
```

Example metric:

```ts
interface MetricValue {
  value: number | string;
  displayValue?: string;
  severity?: "normal" | "warning" | "critical";
}
```

Example:

```ts
checkoutSuccess: {
  value: 72,
  displayValue: "72%",
  severity: "critical"
}
```

This is authored scenario state.

Do NOT calculate it from infrastructure equations.

---

# Controls

The scenario defines exactly what the candidate is allowed to change.

Example:

```ts
interface SelectControlDefinition {
  id: string;

  type: "select";

  componentId: string;

  label: string;

  options: Array<{
    label: string;
    value: string | number;
 