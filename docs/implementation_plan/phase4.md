# IncidentRank — Phase 4: Companies and Candidate Assessments

Before making any changes:

1. Read the root `README.md`.
2. Read `docs/architecture.md`.
3. Read `docs/scenarios/payment-retry-storm.md`.
4. Review the completed Phase 3 implementation.
5. Treat the root README as the product source of truth.
6. Do not begin scenario authoring.
7. Do not add AI or LLM features.
8. Do not add billing.
9. Do not alter Payment Retry Storm behavior unless a genuine assessment integration issue requires it.
10. Do not silently change scoring bands.

Phase 0–3 are complete.

The goal of Phase 4 is to introduce the B2B assessment workflow.

A company should be able to:

- create an organization
- have organization members
- create an assessment
- choose an existing IncidentRank scenario
- invite candidates
- track invitation status
- see candidate completion
- see candidate scores
- open a candidate's full assessment attempt
- review actions, reasoning, and system consequences

A candidate should be able to:

- use their normal IncidentRank account
- receive an assessment invitation
- accept/open the assessment
- complete the assigned incident
- receive their result
- remain completely separate from company administration

---

# Core Principle

A candidate is NOT a separate user type.

The relationship is:

```text
User
  +
Assessment
  +
Organization
  =
Candidate Context
```

The same IncidentRank user may:

- practice public incidents
- be a candidate for Company A
- be a candidate for Company B
- eventually also belong to an organization as a hiring-team member

Do not create duplicate candidate accounts.

---

# Data Model

Extend the database with:

```text
organizations
organization_members
assessments
assessment_candidates
```

Reuse the existing:

```text
attempts
attempt_action_groups
attempt_action_changes
attempt_events
```

Do not create a second assessment-specific attempt system.

---

# Organizations

Conceptually:

```ts
Organization {
  id
  name
  slug
  createdAt
  updatedAt
}
```

Slug must be unique.

For Phase 4, simple organization naming is enough.

Do not build logos, billing profiles, departments, or enterprise settings.

---

# Organization Members

Conceptually:

```ts
OrganizationMember {
  id
  organizationId
  userId

  role:
    "owner"
    | "admin"
    | "member"

  createdAt
}
```

For Phase 4:

- owner may manage organization + assessments
- admin may manage assessments
- member may view assessments/results

Keep authorization explicit.

Do not add dozens of granular permissions.

---

# Creating an Organization

Authenticated users should have a route such as:

```text
/organizations/new
```

Allow:

```text
Organization name
```

Create a slug automatically.

The creator becomes:

```text
owner
```

After creation redirect to organization dashboard.

---

# Organization Dashboard

Add route:

```text
/organizations/[slug]
```

Show:

- organization name
- assessments
- candidate activity
- simple member count

Primary CTA:

```text
Create Assessment
```

Do not build analytics dashboards yet.

---

# Assessments

Conceptually:

```ts
Assessment {
  id
  organizationId

  name
  scenarioId
  scenarioVersion

  status:
    "draft"
    | "active"
    | "closed"

  createdByUserId

  createdAt
  updatedAt
}
```

Example:

```text
Name:
Staff Backend Engineer Assessment

Scenario:
Payment Retry Storm
```

For Phase 4, one assessment contains exactly one scenario.

Do not support multi-incident assessments yet.

---

# Assessment Creation

Route:

```text
/organizations/[slug]/assessments/new
```

Fields:

```text
Assessment Name
Scenario
```

Scenario selector should list active IncidentRank scenarios.

For now:

```text
Payment Retry Storm
```

The assessment must record the scenario version at creation time.

This matters because future scenario changes must not alter an already-created hiring assessment unexpectedly.

---

# Assessment Detail

Route:

```text
/organizations/[slug]/assessments/[assessmentId]
```

Show:

```text
Assessment name
Scenario
Status
Created date
Candidate list
```

Primary controls:

```text
Invite Candidate
Close Assessment
```

Do not build complex templates.

---

# Candidate Invitation

For Phase 4, support invitation by email address.

A company admin enters:

```text
candidate@example.com
```

Create:

```ts
AssessmentCandidate {
  id
  assessmentId

  email
  userId nullable

  status:
    "invited"
    | "started"
    | "completed"

  inviteToken
  invitedAt
  startedAt
  completedAt

  attemptId nullable
}
```

Use a cryptographically secure opaque invite token.

Do not encode sensitive data in the token.

---

# Invitation Delivery

Do NOT integrate a real email provider yet unless one is already available and trivial.

For Phase 4, it is acceptable to:

1. create an invitation
2. generate an assessment URL
3. display a copyable invite link to the organization member

Example:

```text
https://incidentrank.com/assessment/invite/<token>
```

This keeps Phase 4 focused on workflow.

Email delivery can come later.

---

# Candidate Invitation Flow

Route:

```text
/assessment/invite/[token]
```

If signed out:

show:

```text
You've been invited to complete an IncidentRank assessment for Acme Corp.
```

Then:

```text
Sign in / Create Account
```

After sign-in, return to the invitation.

If signed in:

validate invitation.

---

# Candidate Identity Binding

This must be handled carefully.

If the invitation was created for:

```text
candidate@example.com
```

and Clerk provides a verified email for the signed-in user:

prefer requiring the signed-in account to match the invited email.

If this is straightforward with Clerk, enforce it.

If not straightforward, do NOT invent insecure matching logic.

Document any limitation.

Once accepted:

```text
assessment_candidates.userId = currentUser.id
```

An invitation must not later be claimable by another user.

---

# Candidate Assessment Landing Page

After invitation acceptance:

show:

```text
Acme Corp
Staff Backend Engineer Assessment

Scenario:
Payment Retry Storm

Difficulty:
Senior

Expected time:
15–20 minutes
```

Explain:

> Your actions, reasoning, result, and incident timeline will be shared with Acme Corp as part of this assessment.

This disclosure is important.

CTA:

```text
Start Assessment
```

Do NOT expose:

- hidden scoring bands
- success conditions
- scenario rules
- intended solution

---

# Assessment Attempts

When candidate starts:

create a normal `attempts` row with:

```text
attemptType = "assessment"
assessmentId = ...
```

Link:

```text
assessment_candidates.attemptId
```

The same simulation and scoring packages must be used as practice mode.

Do not create separate assessment simulation logic.

---

# Assessment Attempt Restrictions

For Phase 4:

A candidate gets:

```text
1 official assessment attempt
```

Do not allow "Try Again" for assessment attempts.

Practice mode continues to allow retries.

If an assessment attempt is failed or resolved, it is final.

If refresh occurs during an in-progress assessment, use the existing Phase 3 limitations and document behavior.

Do not implement complex resume/reconnect unless required.

---

# Candidate Result

After completing a company assessment:

show the candidate:

```text
Assessment Complete
IncidentRank Score
Score Breakdown
```

Do not show the company leaderboard.

Do not show other candidates.

Do not allow retry.

Provide:

```text
Back to IncidentRank
```

---

# Candidate Privacy

Companies may see only attempts associated with assessments belonging to their organization.

They must NOT gain automatic access to:

- candidate practice attempts
- public/private practice history
- assessments for other organizations
- candidate email beyond what is necessary for the invitation
- unrelated profile activity

This is a critical authorization boundary.

---

# Company Candidate Table

Assessment detail should show:

```text
Candidate          Status        Score       Outcome

alice@example.com  Completed      912         Resolved
bob@example.com    Started        —           —
sam@example.com    Invited        —           —
```

Once linked to a user, prefer display name where appropriate while retaining invitation email in admin context.

---

# Candidate Result Detail

Route conceptually:

```text
/organizations/[slug]/assessments/[assessmentId]/candidates/[candidateId]
```

Only organization members may access it.

Show:

- candidate identity
- assessment
- scenario/version
- score
- score breakdown
- recovery time
- revenue impact
- peak severity
- infrastructure cost
- Kafka backlog
- candidate decision groups
- candidate reasoning
- system events
- final outcome

This should look similar to the existing attempt detail page, but in hiring context.

Reuse components where practical.

---

# Interviewer Timeline

This is a key product feature.

Render a chronological view such as:

```text
01:00 SYSTEM
Payment provider latency increased sharply.

01:46 CANDIDATE
Retries 3 → 1
Backoff None → Exponential

Reason:
"The provider is degraded and retries seem to be amplifying traffic."

01:47 SYSTEM
Checkout moved from critical to degraded.

03:52 CANDIDATE
Circuit Breaker Off → On

04:22 SYSTEM
Incident resolved.
```

The hiring team should be able to understand:

```text
what the candidate observed
what they changed
why they said they changed it
what happened afterward
```

Do not add AI interpretation.

---

# Company Leaderboard / Ranking

Do NOT build a public-looking company leaderboard.

Inside an assessment, simply sort candidates by:

```text
completed first
score descending
recovery time ascending
revenue loss ascending
```

This is an assessment results table, not a gamified leaderboard.

---

# Assessment Status

Support:

```text
draft
active
closed
```

Draft:

- company can configure
- candidates cannot start

Active:

- invitation links work
- candidates may start

Closed:

- existing completed results remain visible
- new starts are blocked

Keep transitions simple.

---

# Organization Authorization

Server-side checks are mandatory.

For every organization route/API:

verify:

```text
current user is organization member
```

For mutations:

verify role.

Examples:

```text
owner/admin
→ create assessment
→ invite candidate
→ close assessment

member
→ view assessment/results
```

Do not rely only on hidden buttons in the UI.

---

# API / Server Layer

You may use:

- route handlers
- server actions
- server-side data functions

Choose what fits the existing architecture.

Keep authorization close to the server boundary.

Do not let clients specify arbitrary organization IDs and trust them.

---

# Database Constraints

Add appropriate:

- foreign keys
- uniqueness constraints
- indexes

Important uniqueness examples:

An invitation should not accidentally create duplicate candidate rows for the same assessment/email unless explicitly intended.

Consider:

```text
unique(assessmentId, normalizedEmail)
```

Normalize email safely.

---

# Invite Token Security

Store either:

- a securely random opaque token

or preferably:

- a hash of the token while returning the plaintext only once to the inviter

For this POC, a random opaque token stored directly may be acceptable if implementation simplicity matters, but document the security tradeoff.

Do not use predictable IDs as invitation secrets.

---

# Existing Practice Mode

Practice mode must continue working unchanged.

Verify:

- anonymous free play
- signed-in persistence
- attempt history
- public leaderboard
- profile visibility
- retry

Do not accidentally make normal incidents require an assessment context.

---

# Navigation

Signed-in users who belong to one or more organizations should have a simple route/link to:

```text
Organizations
```

Add:

```text
/organizations
```

List organizations the user belongs to.

Do not clutter the global navigation for users who belong to no organizations.

---

# Tests

Add comprehensive tests.

At minimum:

## Organization creation

Creator becomes owner.

## Organization authorization

Non-member cannot view private organization.

## Role authorization

Member cannot perform owner/admin mutation.

## Assessment creation

Assessment stores scenario ID and version.

## Invite creation

Admin can create invitation.

## Duplicate invitation

Duplicate assessment/email invitation is handled cleanly.

## Invalid token

Invalid invitation token fails safely.

## Invitation acceptance

Authenticated matching user can claim invitation.

## Invitation single ownership

Already-claimed invitation cannot be claimed by another user.

## Assessment start

Starting creates:

```text
attemptType = assessment
assessmentId = correct assessment
```

## One official attempt

Candidate cannot start a second official attempt.

## Assessment persistence

Actions, reasoning, events, result and score persist exactly like practice mode.

## Assessment completion

Candidate row changes to completed and links attempt.

## Company result access

Organization member can view candidate assessment.

## Unauthorized result access

Other organization/user cannot access assessment attempt.

## Privacy boundary

Company cannot access candidate practice attempt through assessment/company routes.

## Closed assessment

Candidate cannot newly start a closed assessment.

## Practice regression

Existing practice tests remain green.

---

# Manual Validation

Perform at least these flows.

## Flow A — Company Setup

1. Existing user creates organization.
2. User becomes owner.
3. Creates Staff Backend Assessment.
4. Selects Payment Retry Storm.
5. Activates assessment.

---

## Flow B — Candidate Invitation

1. Owner invites candidate.
2. Copy invitation link.
3. Open in isolated browser/session.
4. Candidate signs in.
5. Accept invitation.
6. Verify candidate sees company + assessment disclosure.

---

## Flow C — Candidate Completion

1. Candidate starts assessment.
2. Completes Payment Retry Storm.
3. Adds reasoning to actions.
4. Receives score.
5. Verify no Try Again.
6. Verify candidate status becomes completed.

---

## Flow D — Hiring Team Review

1. Return to organization owner.
2. Open assessment.
3. Candidate shows completed.
4. Open candidate result.
5. Verify score breakdown.
6. Verify candidate reasoning.
7. Verify system events.
8. Verify complete chronological timeline.

---

## Flow E — Privacy

1. Candidate has at least one private practice attempt.
2. Organization owner views candidate assessment.
3. Verify no practice attempt/history is exposed.
4. Attempt direct URL/API access to practice attempt as organization owner.
5. Verify denied unless owner actually owns that personal attempt.

---

# Documentation

Update architecture docs with:

```text
Practice Attempt
Assessment Attempt
Organization
Assessment
AssessmentCandidate
```

Document explicitly:

> Company access is scoped to assessment-linked attempts only.

Add a Phase 4 product-flow diagram:

```text
Organization
   ↓
Assessment
   ↓
Candidate Invitation
   ↓
Existing/New IncidentRank User
   ↓
Assessment Attempt
   ↓
Score + Timeline
   ↓
Hiring Team Review
```

---

# Important Constraints

Do NOT build:

- scenario authoring
- custom company incidents
- email delivery provider
- billing
- subscription plans
- ATS integrations
- enterprise SSO
- AI candidate analysis
- LLM reasoning evaluation
- multi-incident assessments
- public candidate marketplace

These belong to later phases.

---

# Validation

Run:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All must pass.

Do not weaken existing tests.

---

# Completion Report

Return:

1. files created/modified
2. DB schema changes
3. organization model
4. organization roles
5. assessment model
6. candidate invitation model
7. invite-token implementation
8. invitation acceptance flow
9. assessment attempt lifecycle
10. authorization rules
11. privacy boundaries
12. routes added
13. candidate result flow
14. company result/review flow
15. tests added
16. total test results
17. typecheck/lint/test/build results
18. Manual Flow A result
19. Manual Flow B result
20. Manual Flow C result
21. Manual Flow D result
22. Manual Flow E result
23. any deviations
24. any product/UX concerns

Do not begin Phase 5.

Stop when Phase 4 is complete.