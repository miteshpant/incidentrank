# Phase 6 Addendum — Scenario Discovery, Filtering, and Access

Phase 6 must not only add ~100 IncidentRank scenarios.

It must also make them easy to browse, filter, and understand.

---

# Free vs Paid

At launch:

```text
3 scenarios = free
97 scenarios = paid
```

The 3 free scenarios should be deliberately chosen to demonstrate product breadth.

Recommended free set:

```text
1. Payment Retry Storm
2. Database Connection Saturation
3. Kafka Consumer Lag
```

Why these three:

- Payment Retry Storm → retries, circuit breakers, dependency degradation
- Database Connection Saturation → DB pressure and capacity tradeoffs
- Kafka Consumer Lag → asynchronous/event-driven systems

Together they show that IncidentRank is not just one type of troubleshooting product.

All remaining scenarios:

```text
isFree = false
```

Do not implement full billing in Phase 6 unless already explicitly scheduled elsewhere.

For now, model access cleanly so billing can plug in later.

---

# Access Model

Scenario metadata should support something equivalent to:

```ts
{
  isFree: boolean
}
```

The existing built-in scenario model already supports `isFree`; continue using it rather than creating a second concept.

Free scenario:

```text
Signed out
→ playable

Signed in
→ playable + attempt history
```

Paid scenario:

```text
Signed out
→ scenario visible
→ locked

Signed in without entitlement
→ locked

Entitled user
→ playable
```

If billing/entitlements do not exist yet, paid scenarios may show:

```text
Paid
Coming with IncidentRank Pro
```

or an equivalent locked state.

Do not fake a payment flow.

---

# Company Assessments

Important:

```text
Company-assigned assessments are ALWAYS free to the candidate.
```

A candidate must never be asked to purchase access to a scenario assigned by a company.

Assessment entitlement comes from:

```text
valid assessment assignment
```

not personal subscription state.

This applies even if the underlying scenario is paid in practice mode.

---

# Scenario Library Page

Upgrade:

```text
/incidents
```

into the primary scenario-library browsing experience.

It should comfortably support 100+ scenarios.

Each scenario card should show:

```text
Name
Short description
Category
Difficulty
Estimated time
Free / Paid
Key skills/topics
```

Optional:

```text
Completed
Best score
Attempts
```

for signed-in users.

---

# Filters

Add filtering at minimum by:

## Category

Examples:

```text
Databases & Storage
Messaging & Streaming
Caching
Microservices & Dependencies
API & Traffic
Distributed Systems
Deployments & Reliability
Infrastructure & Capacity
Security & Identity
Data Pipelines
```

---

## Difficulty

```text
Intermediate
Senior
Staff
```

---

## Access

```text
All
Free
Paid
```

---

## Scenario Status / Progress

For signed-in users:

```text
All
Not Attempted
Attempted
Completed
```

---

## Estimated Duration

Suggested ranges:

```text
< 10 minutes
10–20 minutes
20–30 minutes
30+ minutes
```

---

# Skill / Concept Filtering

Each scenario should carry tags.

Examples:

```text
Kafka
Postgres
Caching
Retries
Circuit Breakers
Backpressure
Rate Limiting
Scaling
Failover
Replication
Idempotency
Consistency
Queues
Observability
Capacity Planning
Incident Response
```

Allow filtering by one or more tags.

Do not hardcode filtering behavior per scenario.

---

# Search

Add text search.

Search should match at least:

```text
scenario name
description
category
tags
```

Example:

```text
"kafka"
```

returns relevant Kafka/message-stream scenarios.

Example:

```text
"database"
```

returns DB-related incidents across multiple categories where relevant.

---

# Recommended Metadata Model

Every official scenario should expose library metadata conceptually like:

```ts
ScenarioLibraryMetadata {
  category: ScenarioCategory
  difficulty: "intermediate" | "senior" | "staff"
  estimatedMinutes: number

  tags: string[]

  isFree: boolean

  shortDescription: string

  skills: string[]
}
```

Reuse existing scenario fields where they already exist.

Do not duplicate metadata unnecessarily.

---

# Multiple Filters

Filters should combine.

Example:

```text
Category:
Distributed Systems

Difficulty:
Staff

Access:
Paid

Tag:
Replication
```

should return only matching scenarios.

Use AND semantics between filter groups.

Within the same multi-select group, use reasonable OR behavior.

Example:

```text
Tags:
Kafka OR Backpressure
```

Document the behavior.

---

# Filter URL State

Prefer storing filters in query parameters.

Example:

```text
/incidents?category=database&difficulty=senior&access=free
```

Benefits:

- shareable
- bookmarkable
- browser back works
- refresh preserves selection

Do not require global application state.

---

# Sorting

Support:

```text
Recommended
Newest
Difficulty
Duration
Name
```

Later we may add:

```text
Most Popular
Highest Rated
```

but do not invent ranking data yet.

---

# Library Grouping

Default experience should not dump 100 identical cards onto one page with no structure.

Recommended initial page:

```text
Featured
Free to Try
Popular Tracks / Categories
All Incidents
```

But keep the UI simple enough for Phase 6.

Search + filters + cards is more important than elaborate merchandising.

---

# Scenario Detail / Briefing Preview

Before starting a scenario, users should be able to inspect candidate-safe metadata:

```text
Scenario name
Difficulty
Category
Estimated time
Skills
Description
Architecture preview if safe
Free/Paid status
```

Do NOT reveal:

```text
rules
solutions
success thresholds
failure thresholds
scoring bands
hidden events
```

---

# Paid Lock State

Locked cards should remain discoverable.

Do not completely hide paid scenarios from free users.

Example card:

```text
Cache Stampede

Senior · Caching · ~15 min

Tags:
Caching
Traffic
Concurrency

🔒 Paid
```

CTA could be:

```text
View Scenario
```

then show a locked detail page.

Avoid dead buttons.

---

# Free Scenario Selection

The 3 free scenarios should be explicitly marked in source/config, not inferred by order.

Recommended:

```text
Payment Retry Storm
isFree: true

Database Connection Saturation
isFree: true

Kafka Consumer Lag
isFree: true
```

All others:

```text
isFree: false
```

Add a test asserting:

```text
exactly 3 IncidentRank-owned launch scenarios are free
```

This prevents accidental entitlement drift.

---

# Company-Owned Scenarios

Organization-private scenarios are NOT part of the public scenario library.

Do not expose them through:

```text
/incidents
search
filters
public scenario APIs
```

They remain visible only:

```text
inside their organization
and
through assigned assessments
```

---

# Launch Taxonomy

Each of the ~100 scenarios must belong to exactly one primary category.

It may have many tags.

Example:

```text
Cache Stampede

Primary Category:
Caching

Tags:
Redis
Concurrency
Traffic Spike
Thundering Herd
TTL
```

This avoids scenarios appearing ambiguously in several top-level categories.

---

# Track Pages

Optional but recommended if straightforward:

```text
/incidents/databases
/incidents/messaging
/incidents/caching
...
```

These can simply reuse the same library component with a preselected category.

Do not build separate hardcoded pages.

---

# Practice Progress

For signed-in users, scenario cards may show:

```text
Not attempted

or

Best: 870
2 attempts
```

Use existing practice attempt data.

Do not mix assessment attempts into practice progress.

---

# Assessment Scores

Never expose assessment scores in the public practice library.

Practice and hiring contexts remain distinct.

---

# Tests

Add at minimum:

## Metadata

All launch scenarios contain required category/difficulty/duration/tags metadata.

## Exactly three free

Exactly three IncidentRank launch scenarios have:

```text
isFree = true
```

## Free identities

Those three are the intended launch scenarios.

## Paid default

All remaining launch scenarios are paid.

## Free anonymous access

Anonymous user can play all three free scenarios.

## Paid anonymous lock

Anonymous user cannot start paid scenario.

## Paid signed-in no entitlement

Locked until entitlement exists.

## Assessment override

Candidate assigned a paid scenario can play it through assessment without personal entitlement.

## Category filter

Returns correct scenarios.

## Difficulty filter

Returns correct scenarios.

## Access filter

Free/paid works.

## Tag filter

Works.

## Search

Matches names/descriptions/tags.

## Combined filters

Filters compose correctly.

## Progress filter

Practice status only.

## Org privacy

Organization-authored private scenarios never appear in public library queries.

## Query parameters

URL filter state parses/serializes correctly.

---

# Manual Flow

## Flow A — Anonymous Free User

1. Open `/incidents`.
2. Filter `Free`.
3. Exactly 3 scenarios appear.
4. Open each.
5. All three can start without authentication.

---

## Flow B — Paid Scenario

1. Open a paid incident while signed out.
2. Scenario metadata is visible.
3. Start is locked.
4. No simulation definition or hidden scenario data is exposed.

---

## Flow C — Filter Library

Use:

```text
Category = Messaging
Difficulty = Senior
Tag = Kafka
```

Verify matching scenarios only.

Refresh/share URL.

Filters persist.

---

## Flow D — Signed-In Progress

1. Complete one free scenario.
2. Return to library.
3. Card shows practice progress/best score.
4. Filter `Completed`.
5. Scenario appears.

Assessment attempts must not affect this filter.

---

## Flow E — Paid Assessment Override

1. Create a company assessment using a paid scenario.
2. Invite candidate with no paid practice entitlement.
3. Candidate can complete assessment normally.
4. Candidate still cannot start that paid scenario independently in practice mode.

---

# Phase 6 Final Goal

At completion:

```text
100 launch-quality IncidentRank scenarios
+
search
+
filters
+
categories
+
tags
+
difficulty
+
estimated duration
+
practice progress
+
3 free scenarios
+
97 paid scenarios
```

Company-assigned assessments remain free to candidates.

Do not begin billing implementation merely because scenarios are labeled paid.