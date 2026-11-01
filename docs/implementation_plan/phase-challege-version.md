Add a lightweight social challenge feature to IncidentRank.

The goal is to create a simple growth loop:

```text
IncidentRank publishes a Weekly Challenge
→ engineer solves it
→ engineer challenges another engineer
→ challenged engineer opens the same incident
→ solves independently
→ both can compare results after completion
```

Keep this simple.

Do NOT turn IncidentRank into a game or social network.

Preserve the serious engineering/product aesthetic.

---

# 1. Weekly Challenge on Homepage

Add one compact Weekly Challenge element to the homepage.

Do not create another large homepage section.

It should feel like a featured incident.

Example:

```text
WEEKLY CHALLENGE

Payment Retry Storm
Senior · Free this week

Can you stabilize production?

[ Take the Challenge ]
```

Keep the visual design minimal and consistent with the existing homepage.

The Weekly Challenge should appear near the primary homepage CTA, but should not compete visually with the main hero.

---

# 2. Admin-Selectable Weekly Challenge

Do not hardcode the weekly incident.

Allow an authorized IncidentRank admin to select which built-in scenario is the current Weekly Challenge.

At minimum store:

```text
scenario_id
starts_at
ends_at nullable
active
```

or the simplest equivalent compatible with the existing schema.

There must only be one active Weekly Challenge at a time.

Do not build scheduling automation yet unless trivial.

Admin should be able to:

```text
select scenario
activate challenge
replace current challenge
deactivate challenge
```

---

# 3. Weekly Challenge Must Be Playable for Free

The currently active Weekly Challenge must be playable by candidates even if the underlying scenario would normally require a paid practice entitlement.

The access rule should conceptually become:

```text
practice access =
scenario is normally free
OR
scenario is current active Weekly Challenge
OR
user has valid paid/lifetime entitlement
OR
existing localhost development bypass
```

This applies only to practice.

Do not change company-assessment authorization.

When the Weekly Challenge rotates away, its normal access policy returns.

---

# 4. Challenge Entry Point

Clicking:

```text
Take the Challenge
```

should take the visitor directly into the existing incident flow.

Do not create a separate simulator.

Use the normal scenario/candidate runtime.

Track that the attempt originated from:

```text
weekly_challenge
```

where useful for analytics.

---

# 5. After Completion — Challenge Another Engineer

After a user completes the Weekly Challenge or another eligible practice incident, show:

```text
Challenge another engineer
```

Keep this secondary to the result itself.

Clicking it should create a shareable challenge link.

Example conceptually:

```text
https://incidentrank.com/challenge/<random-token>
```

Do not expose user IDs or sequential IDs in the URL.

Use an unguessable token.

---

# 6. Challenge Record

Create the smallest useful challenge model.

Conceptually:

```text
challenge_id
token
scenario_id
challenger_user_id nullable
challenger_attempt_id
created_at
expires_at nullable
```

If anonymous users cannot safely create persistent challenges with the current architecture, it is acceptable initially to require signup before creating a personal challenge.

Do not weaken identity/security just to support anonymous challenge creation.

---

# 7. Challenge Landing Experience

When another engineer opens a challenge link, show a minimal message such as:

```text
You've been challenged.

Payment Retry Storm

Can you stabilize production with a better result?

[ Accept Challenge ]
```

If the challenger has an appropriate public/display name:

```text
Mitesh challenged you.
```

Otherwise use neutral wording:

```text
An engineer challenged you.
```

Do not expose email addresses or private profile data.

---

# 8. No Spoilers

Before the challenged engineer completes the incident, they must NOT see:

```text
challenger score
challenger completion tier
challenger actions
challenger reasoning
challenger final state
solution path
dimension scores
```

The challenge should remain fair.

The only information needed before solving is:

```text
scenario
challenger identity if safe/public
challenge invitation
```

---

# 9. Comparison After Both Finish

Once the challenged engineer finishes, show a simple comparison.

Example:

```text
INCIDENTRANK CHALLENGE

Payment Retry Storm

You                 Challenger
875                 820
Resolved            Resolved
6m 42s              8m 15s

Reliability          150 / 150
Customer Impact      180 / 200
Cost Efficiency       95 / 100

[ Challenge Another Engineer ]
```

Use only information already allowed to be visible in practice results.

Do NOT show:

```text
reasoning text
exact action sequence
hidden rules
authoring logic
```

unless a future feature explicitly supports solution sharing.

---

# 10. Winner / Comparison Language

Keep comparison professional.

A simple:

```text
Higher score
```

or:

```text
You scored higher
```

is sufficient.

Avoid:

```text
crushed
destroyed
loser
```

or overly gamified language.

IncidentRank should still feel like a serious engineering platform.

---

# 11. Challenge Eligibility

For the first version, challenges should apply only to:

```text
practice incidents
```

Do NOT allow users to share/challenge each other using:

```text
company assessments
private organization scenarios
candidate assignments
confidential employer content
```

Company evaluation attempts must never become challenge links.

---

# 12. Weekly Challenge Analytics

Use the existing first-party analytics system.

Add simple events:

```text
weekly_challenge_viewed
weekly_challenge_started
weekly_challenge_finished

challenge_created
challenge_link_opened
challenge_accepted
challenge_finished
```

Do not include:

```text
candidate reasoning
email address
hidden state
company assessment information
```

Add simple admin counts if easy to integrate with the existing analytics page:

```text
Weekly Challenge views
Weekly Challenge starts
Weekly Challenge finishes
Challenges created
Challenge links opened
Challenges accepted
```

Do not build a separate analytics dashboard.

---

# 13. Admin Weekly Challenge View

In the existing admin panel, provide a small Weekly Challenge management area.

Show:

```text
Current Weekly Challenge
Scenario
Start date
Status

Views
Starts
Finishes
Challenges created
```

Keep it simple.

---

# 14. Homepage Design Constraint

The homepage has just been intentionally simplified and improved.

Do NOT clutter it.

The Weekly Challenge should be a compact element such as:

```text
WEEKLY CHALLENGE
Payment Retry Storm · Senior

Can you stabilize it?

Take the Challenge →
```

No large cards grid.

No leaderboard on the homepage.

No avatars.

No animations.

No countdown clock unless already trivial and tasteful.

---

# 15. Weekly Challenge and Free Incident Relationship

The Weekly Challenge is one way IncidentRank regularly exposes free content.

Do not change the broader free-content system unless necessary.

The homepage can continue saying that new free incidents are regularly available.

The Weekly Challenge simply gives visitors a clear featured incident to attempt now.

---

# 16. Security / Privacy

Challenge URLs must:

```text
use random non-sequential identifiers
not expose attempt IDs directly
not expose user IDs
not expose private data
```

The server must verify that the referenced incident/attempt is eligible for sharing.

Never allow:

```text
company assessment result sharing
cross-org data leakage
access to challenger reasoning
access to hidden scenario data
```

---

# 17. Existing Product Behavior

Reuse existing:

```text
incident runtime
manual Finish flow
practice scoring
result UI
authentication
admin authorization
analytics
```

Do not create parallel systems.

---

# 18. Validation

Add focused tests for:

```text
admin can choose Weekly Challenge
only one Weekly Challenge active
Weekly Challenge bypasses normal paid-practice lock
company assessments unaffected
challenge token creation
challenge token lookup
invalid token behavior
private assessment cannot create challenge
challenger result hidden before challenged user finishes
comparison visible after completion
analytics events
```

Run:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

and relevant database migration/seed validation.

---

# 19. Completion Report

Return:

```text
IncidentRank Weekly Challenge Completion Report
```

Include:

1. Weekly Challenge implementation
2. Admin selection flow
3. Free-access behavior
4. Homepage implementation
5. Challenge Another Engineer flow
6. Challenge-link security
7. No-spoiler behavior
8. Post-completion comparison
9. Analytics added
10. Files changed
11. Database changes
12. Tests
13. Typecheck
14. Lint
15. Build
16. Known limitations

Stop after implementing this version.

Do NOT add yet:

```text
global leaderboards
challenge tournaments
teams
multiple-player challenges
public profiles
badges
certificate integration
social feeds
email challenge invitations
SMS invitations
challenge notifications
```

Those can be evaluated later after we see whether engineers actually use the basic challenge loop.