# IncidentRank

## What is IncidentRank?

**IncidentRank is a hands-on engineering assessment and practice platform for production incidents.**

It is designed to answer a simple question:

> **How does an engineer actually behave when a production system is failing?**

Traditional system-design interviews usually ask candidates to explain what they would do.

Coding platforms such as HackerRank let candidates prove how they write code.

IncidentRank applies the same idea to **system design, production operations, reliability, and incident response**.

Instead of asking:

> "What would you do if a payment service was failing?"

IncidentRank gives the engineer a simulated production incident and lets them operate the system.

The engineer can inspect the architecture, metrics, logs, service state, and incident timeline.

They can then make real operational decisions through predefined controls such as:

- changing retry configuration
- changing timeout settings
- enabling or disabling circuit breakers
- adjusting concurrency
- scaling services
- changing queue consumers
- changing connection limits
- applying other scenario-specific configuration

Their decisions change the state of the incident.

IncidentRank records what they do, how the system responds, whether they successfully restore the system, and how efficiently they solve the incident.

The result is an objective **IncidentRank score** and a complete timeline of how the engineer handled the problem.

---

# The Core Idea

IncidentRank does not ask engineers what they *would* do.

It puts them into an incident and lets them **do it**.

The basic experience is:

```text
Incident begins
      ↓
Engineer investigates
      ↓
Engineer changes system configuration
      ↓
Scenario reacts
      ↓
Engineer observes consequences
      ↓
Engineer makes further decisions
      ↓
System recovers or deteriorates
      ↓
Incident ends
      ↓
Engineer is scored
```

A scenario may look like:

```text
Users
  ↓
API Gateway
  ↓
Checkout Service
  ↓
Payment Service ─────→ External Payment Provider
  ↓
Postgres
  ↓
Kafka
  ↓
Settlement Worker
```

The engineer may be told only:

> **SEV-1: Checkout success has fallen below 75%.**

They must determine what is happening and decide how to respond.

---

# IncidentRank Is Not a Cloud Simulator

IncidentRank is **not** trying to reproduce AWS, Kubernetes, PostgreSQL, Kafka, networking, or distributed systems mathematically.

It is not a physics engine.

It is not a packet-level infrastructure simulator.

Instead:

> **The scenario author defines the behavior of the incident.**

A scenario contains:

- the system architecture
- the starting system state
- incident events
- system metrics
- logs
- controls available to the engineer
- rules describing the consequences of decisions
- success conditions
- failure conditions
- scoring rules

For example:

```text
Payment provider is degraded
+
Retries = 3
+
Backoff = none
```

may produce:

```text
Payment traffic        Critical
Checkout success       72%
Provider latency        4.8s
Database pressure       High
```

If the engineer changes:

```text
Retries: 3 → 1
```

the scenario may transition to:

```text
Payment traffic        High
Checkout success       84%
Provider latency        3.1s
Database pressure       Medium
```

Adding exponential backoff may improve the state further.

The consequences are **authored as part of the scenario**.

IncidentRank's engine simply executes those rules consistently and deterministically.

---

# Deterministic Incidents

IncidentRank scenarios are deterministic.

Given the same:

```text
Scenario
+
Current State
+
Candidate Action
```

the result should always be the same.

This is important because IncidentRank is intended to be used for engineering assessment.

Two candidates making the same decision under the same scenario conditions should receive the same system response.

There should be no hidden random behavior influencing assessment results.

---

# Multiple Valid Solutions

IncidentRank should not require one predefined sequence of actions.

Production engineering rarely has exactly one correct solution.

A good scenario should allow multiple reasonable approaches.

Two engineers may both restore a system while making different trade-offs.

For example:

Engineer A may minimize recovery time.

Engineer B may accept a slightly slower recovery while preserving more system stability.

Engineer C may recover quickly but dramatically increase infrastructure cost.

IncidentRank evaluates the **outcome and decision path**, rather than checking whether the candidate followed a prescribed answer key.

---

# Candidate Experience

An engineer enters an incident and sees an operational console.

The console may contain:

## Architecture

A visual representation of the system and its dependencies.

Example:

```text
Gateway
   ↓
Checkout
   ↓
Payment ─────→ Payment Provider
   ↓
Postgres
   ↓
Kafka
```

Individual components can be selected to inspect their state or configuration.

---

## Metrics

The engineer sees relevant system metrics such as:

```text
Checkout Success       72%
P99 Latency             4.8s
Payment Traffic         Critical
Database Pressure       High
Kafka Lag               48,000
```

The exact metrics depend on the scenario.

---

## Logs and Observability

Scenarios may expose logs, traces, error messages, service health, or other diagnostic information.

The candidate should need to investigate the incident rather than being directly told the cause.

---

## Controls

The candidate operates the system through structured controls.

Examples:

```text
Retries
[ 0 | 1 | 3 | 5 ]

Backoff
[ None | Fixed | Exponential ]

Circuit Breaker
[ OFF | ON ]

Timeout
[ 1s | 2s | 3s | 5s ]

Instances
[ 4 | 8 | 12 | 16 ]
```

There is no requirement for the candidate to type an essay or describe their solution.

Their decisions are demonstrated through their actions.

---

## Incident Timeline

IncidentRank records the entire attempt.

Example:

```text
00:00  Incident started

00:42  Candidate viewed Payment Service

01:13  Candidate viewed provider logs

01:48  Retries changed 3 → 1

01:49  Payment traffic decreased

02:30  Backoff changed None → Exponential

02:44  Provider pressure decreased

03:10  Circuit breaker enabled

03:36  Checkout success increased to 96%

04:12  Incident resolved
```

This timeline is important both for learning and hiring.

It shows **how the engineer thought through the incident**, rather than only displaying the final score.

---

# Scoring

Each completed incident produces an **IncidentRank score**.

The intended scale is:

```text
0 – 1000
```

A score may consider areas such as:

```text
Recovery
Customer Impact
Data Integrity
Reliability
Cost Efficiency
Operational Efficiency
```

A scenario can determine which dimensions matter and how heavily they are weighted.

The goal is not merely:

> Did the engineer restore the system?

The platform should also evaluate:

> How did they restore it?

For example, two engineers may both recover an incident.

One may recover in five minutes while preserving customer transactions.

Another may recover in fifteen minutes after making several harmful configuration changes.

Their scores should reflect that difference.

---

# Practice Platform

IncidentRank is also a practice environment for engineers.

Users can choose incidents from the IncidentRank scenario library and attempt them independently.

Examples of future scenarios may include:

```text
Payment Retry Storm
Database Connection Exhaustion
Kafka Consumer Lag
Cache Stampede
Hot Partition
Cascading Timeout
Duplicate Payments
Queue Backlog
Regional Failure
Rate-Limit Failure
Service Dependency Failure
```

Each scenario tests different areas of engineering reasoning.

Users can retry incidents, improve their score, and compare their performance with other engineers.

---

# Leaderboards

Public practice scenarios can have leaderboards.

Example:

```text
Payment Retry Storm

Rank   Engineer        Score
1      Sarah K.        934
2      Alex R.         912
3      Mitesh P.       887
4      James T.        864
```

Initially the leaderboard may simply rank attempts.

Later IncidentRank may develop broader rankings across multiple scenarios and engineering disciplines.

---

# IncidentRank Profile

Over time, an engineer may build an IncidentRank profile showing their performance across different engineering areas.

For example:

```text
IncidentRank        1847

Reliability          92
Databases            87
Distributed Systems  94
Messaging             91
Performance           84
```

This may eventually become a useful engineering credential.

However, company assessment results and private practice history should remain controlled by the user and the company that issued the assessment.

---

# Company Assessments

IncidentRank is designed to be used by engineering organizations as a technical assessment platform.

A company should be able to create an assessment and assign one or more incidents to candidates.

For example:

```text
Acme Corp

Staff Backend Engineer Assessment

Incident:
Payment Retry Storm
```

The candidate receives an assessment invitation and completes the incident using their normal IncidentRank account.

The company receives results such as:

```text
Candidate       Score      Recovery

Sarah K.         934        5m 48s
Mitesh P.        887        7m 12s
James T.         721       13m 43s
```

The hiring team can then inspect the candidate's full incident timeline.

This provides significantly more information than simply marking an answer correct or incorrect.

---

# A User Is Not Permanently a Candidate

IncidentRank should have one universal user identity.

A user can simultaneously be:

- an engineer practicing public incidents
- a candidate for Company A
- a candidate for Company B
- eventually a member of a company hiring team

"Candidate" is therefore a relationship between:

```text
User
+
Company
+
Assessment
```

It is not a separate account type.

A candidate should never need to create multiple IncidentRank accounts for different companies.

---

# Candidate Privacy

Companies should only automatically receive information associated with assessments they assigned.

For example:

Company A should be able to see:

```text
Candidate's Company A assessment attempt
Candidate's assessment score
Candidate's incident timeline
```

Company A should not automatically receive:

```text
private practice attempts
Company B assessment results
unrelated IncidentRank activity
```

A user may eventually choose to make a public IncidentRank profile visible, but this should be separate from company assessment access.

---

# Company-Created Incidents

IncidentRank will eventually allow companies to define their own private incidents.

A company should be able to specify:

```text
Architecture
Initial State
Metrics
Logs
Available Controls
Timed Events
Rules
Consequences
Success Conditions
Failure Conditions
Scoring
```

For example, a company could create an incident involving:

```text
API
 ↓
Worker
 ↓
Queue
 ↓
Database
```

and define:

```text
Queue begins backing up.

If the candidate increases workers:
    backlog decreases.

If workers are increased too aggressively:
    database pressure becomes critical.

If database connections are increased:
    pressure temporarily improves.

If the candidate enables batching:
    throughput improves substantially.
```

This allows companies to test engineering reasoning relevant to the type of systems their engineers operate.

Companies should not need to write simulation equations.

They define **scenario behavior and consequences**.

---

# Incident Scenario Library

IncidentRank itself will maintain a library of high-quality incidents.

These incidents serve two purposes:

## Practice

Engineers can use them to improve production reasoning and prepare for interviews.

## Hiring

Companies can use existing IncidentRank incidents instead of building their own.

The scenario library can grow over time across areas such as:

```text
Backend Engineering
Distributed Systems
Databases
Messaging
Reliability
SRE
Platform Engineering
Security
Cloud Infrastructure
AI Infrastructure
```

---

# Incident Authoring

Eventually IncidentRank will contain a visual scenario-authoring environment.

The authoring flow may look like:

```text
Create Incident
      ↓
Define Architecture
      ↓
Define Starting State
      ↓
Configure Metrics and Logs
      ↓
Define Candidate Controls
      ↓
Define Incident Events
      ↓
Define Rules and Consequences
      ↓
Define Success / Failure
      ↓
Define Scoring
      ↓
Test Incident
      ↓
Publish
```

The same underlying scenario model should power both:

```text
IncidentRank-created scenarios
```

and:

```text
Company-created scenarios
```

---

# Business Model

## Engineers

Engineers can attempt a limited number of IncidentRank practice scenarios for free.

The initial product direction is:

```text
First 3 practice incidents     Free
```

A potential early-user offer is:

```text
Founding Engineer
$99 lifetime
```

This would unlock the broader IncidentRank practice library.

Pricing may evolve as the scenario library and product mature.

Company-assigned assessments should always be free for the candidate.

---

## Companies

Companies pay to assess engineering candidates.

Potential pricing may be based on:

```text
candidate assessments
team subscriptions
annual plans
private scenarios
enterprise integrations
```

The exact pricing model will be validated after the core product proves useful.

---

# What Makes IncidentRank Different?

Traditional coding assessments test whether someone can produce working code.

Traditional system-design interviews test whether someone can verbally describe an architecture.

IncidentRank evaluates something different:

> **Can this engineer understand and operate a failing system?**

It exposes engineering behaviors that are difficult to measure in a conversation:

- investigation strategy
- production judgment
- trade-off reasoning
- reliability thinking
- understanding of distributed systems
- reaction to consequences
- ability to recover after making a bad decision
- ability to distinguish root causes from symptoms

---

# Product Principles

## 1. Production is the test

IncidentRank should feel like operating a production system, not completing an online quiz.

---

## 2. Actions matter more than explanations

Candidates demonstrate their reasoning through what they do.

---

## 3. Consequences teach

A bad decision should not simply produce:

```text
Wrong answer
```

It should change the system.

The engineer learns by seeing the consequence.

---

## 4. Multiple good solutions should exist

IncidentRank should reward successful engineering outcomes, not memorization of one intended answer.

---

## 5. Scenarios are deterministic

Assessment results must be reproducible and fair.

---

## 6. Scenario authors define behavior

IncidentRank executes scenario rules.

It does not attempt to mathematically recreate production infrastructure.

---

## 7. Attempts are replayable

Every meaningful candidate action and resulting system event should eventually be reconstructable.

---

## 8. Practice and hiring use the same platform

The same incident engine should power:

```text
Engineer Practice
```

and:

```text
Company Assessments
```

---

# Product Phases

The phases below describe the evolution of the product.

They are not implementation plans.

---

## Phase 0 — Product Foundation

Establish the IncidentRank product model and the core scenario engine concepts.

The goal of this phase is to ensure that IncidentRank has a clear definition of:

- scenarios
- system architecture
- incident state
- controls
- candidate actions
- rules
- consequences
- events
- success/failure conditions
- scoring concepts

At the end of this phase, the foundation should clearly support the complete product vision without trying to build the entire product.

---

## Phase 1 — First Incident

Create the first complete IncidentRank scenario:

**Payment Retry Storm**

This phase proves that an authored production incident can respond meaningfully to different candidate decisions.

The scenario should contain enough alternative paths that candidates can make good decisions, bad decisions, recover from mistakes, and eventually resolve or fail the incident.

The goal is to prove the core IncidentRank experience.

---

## Phase 2 — Incident Playground

Turn the first scenario into the actual interactive IncidentRank experience.

Candidates should be able to:

- view system architecture
- inspect metrics
- inspect logs
- select system components
- change system configuration
- observe consequences
- follow the incident timeline
- resolve or fail the incident
- receive their result

At this stage IncidentRank becomes a playable product.

---

## Phase 3 — Accounts, Attempts and Rankings

Introduce persistent users.

Engineers should be able to:

- create an account
- attempt incidents
- retry incidents
- view previous attempts
- receive scores
- appear on leaderboards
- build an IncidentRank history

This phase turns the incident playground into a user-facing practice platform.

---

## Phase 4 — Company Assessments

Introduce organizations and hiring workflows.

Companies should be able to:

- have company accounts
- create assessments
- choose IncidentRank scenarios
- invite candidates
- track candidate completion
- view scores
- inspect candidate incident timelines

Candidates should continue using their normal IncidentRank account.

This phase turns IncidentRank into a hiring product.

---

## Phase 5 — Scenario Authoring

Allow companies and IncidentRank administrators to create incidents through a structured authoring environment.

Authors should be able to define:

- architecture
- state
- metrics
- logs
- controls
- timed events
- rules
- consequences
- success conditions
- scoring

This phase transforms IncidentRank from a fixed scenario library into a platform.

---

## Phase 6 — Scenario Library

Expand the official IncidentRank scenario catalog.

Cover multiple engineering domains and difficulty levels.

Examples may include:

- backend engineering
- databases
- distributed systems
- messaging
- reliability
- SRE
- platform engineering
- security
- AI infrastructure

The goal is to make IncidentRank useful for both continuous practice and broad engineering assessment.

---

## Phase 7 — Engineering Reputation

Develop IncidentRank beyond individual scenario scores.

Engineers may build a broader IncidentRank based on performance across scenarios and engineering disciplines.

Potential capabilities include:

- skill-area rankings
- public engineer profiles
- verified assessment results
- percentile rankings
- shareable achievements
- career-facing IncidentRank credentials

The objective is for an IncidentRank profile to become a meaningful signal of operational engineering ability.

---

## Phase 8 — Enterprise Platform

Develop IncidentRank for larger engineering organizations.

Potential capabilities include:

- ATS integrations
- enterprise SSO
- APIs
- team-level permissions
- private scenario libraries
- organization benchmarks
- assessment analytics
- audit controls
- enterprise security requirements

This phase is only relevant after the underlying assessment methodology has proven valuable.

---

# Long-Term Vision

IncidentRank should become the place where engineers practice and prove their ability to operate real-world systems.

Coding platforms made it possible to say:

> "Show me that you can code."

IncidentRank should make it possible to say:

> **"Show me that you can operate production."**

For an engineer, IncidentRank should be somewhere they can continuously improve their production instincts.

For a company, IncidentRank should provide a better answer to:

> **Would I trust this engineer when our production system is failing?**

That is the end goal.

---

# Product Principle

> **IncidentRank does not ask engineers what they would do. It puts them in a running incident and measures what happens when they do it.**

And:

> **IncidentRank does not recreate production infrastructure. It recreates production decisions.**