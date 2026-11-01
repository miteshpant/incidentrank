Add a simple, lightweight funnel-tracking capability to IncidentRank as part of the current Phase 10G work.

Do NOT over-engineer this.

The goal is simply to understand how users move through the product and where they drop off.

We currently know incident pages have been visited, but we cannot tell how many users:

- viewed an incident
- acknowledged it
- started solving
- applied an action
- finished an incident
- clicked signup
- completed registration

We need basic tracking for these events and a simple admin view.

## 1. Track these events

At minimum:

```text
page_view
incident_view
incident_acknowledged
incident_started
first_action_applied
finish_clicked
incident_finished
signup_clicked
signup_completed
```

Where useful, include simple properties:

```text
path
scenario_slug
user_id if signed in
anonymous_session_id if not signed in
timestamp
referrer
```

For incident-related events also include:

```text
scenario_slug
practice_or_assessment
```

Do NOT record:

```text
candidate reasoning text
assessment answers
hidden scenario state
score details
PII beyond existing authenticated user ID
email address in analytics events
```

---

## 2. Anonymous session tracking

Anonymous visitors should get a simple anonymous session ID using an appropriate cookie/local identifier.

We only need enough to understand:

```text
same visitor viewed incident
→ acknowledged
→ started
→ finished
→ clicked signup
```

When a user signs in, it is acceptable to associate future events with the authenticated user.

Do not build complex identity stitching.

---

## 3. Store events simply

Use the existing IncidentRank database unless there is a strong reason not to.

A simple table is sufficient, conceptually:

```text
analytics_events

id
event_name
user_id nullable
anonymous_session_id nullable
path nullable
scenario_slug nullable
context nullable
referrer nullable
created_at
```

`context` may be a small JSON/JSONB field for simple additional properties.

Add sensible indexes for:

```text
event_name
created_at
scenario_slug
user_id
anonymous_session_id
```

Do not build a data warehouse.

Do not add Kafka, queues, external analytics infrastructure, or complex aggregation pipelines.

---

## 4. Track page hits

Track normal page views so we can see:

```text
homepage visits
/incidents visits
individual incident-page visits
pricing-page visits if it exists
signup-page visits
```

Avoid double-counting caused by React rerenders.

One logical navigation/page load should normally produce one page-view event.

---

## 5. Track the basic incident funnel

For a visitor entering an incident, we should be able to calculate:

```text
incident_view
→ incident_acknowledged
→ incident_started
→ first_action_applied
→ finish_clicked
→ incident_finished
→ signup_clicked
→ signup_completed
```

Do not require every user to go through every stage.

The point is to understand drop-off.

---

## 6. Simple Admin Analytics Page

Add a small analytics section to the existing admin panel.

Do not build a large dashboard.

Show a date filter:

```text
Last 7 days
Last 30 days
All time
```

At minimum display:

```text
Page Views
Unique Visitors
Incident Views
Incidents Started
Incidents Finished
Signup Clicks
Registrations
```

Also calculate:

```text
Incident View → Start %
Start → Finish %
Incident View → Registration %
```

---

## 7. Funnel View

Show a simple funnel/table such as:

```text
Incident Viewed        262
Acknowledged           180
Started                145
First Action           120
Finish Clicked          70
Finished                62
Signup Clicked          15
Registered               4
```

and percentage drop-off between stages.

No fancy charting library is required unless one is already in the project.

A clean table/cards are sufficient.

---

## 8. Scenario Breakdown

Add a simple table:

```text
Scenario
Views
Starts
Finishes
Finish Rate
```

Sort by Views descending by default.

This will help us understand which incidents attract users and which lose them.

---

## 9. Traffic Source

Where available, capture and display basic referrer information.

Examples:

```text
linkedin.com
google.com
direct
other
```

Do not build full attribution analytics.

Basic referrer counts are enough.

---

## 10. Privacy

This analytics system must NOT expose company-assessment confidential information.

Do not store:

```text
candidate reasoning
candidate action values beyond event occurrence
assessment score
completion tier
educational feedback
hidden rules
company-private scenario details
```

For company assessments, only generic events such as:

```text
assessment_viewed
assessment_started
assessment_finished
```

are acceptable if needed.

---

## 11. Performance

Tracking must not block the candidate experience.

Analytics failures should never prevent:

```text
page load
incident start
candidate action
Finish
signup
```

Prefer fire-and-forget/best-effort event submission.

If analytics recording fails, log appropriately but do not fail the user's primary action.

---

## 12. Admin Access

Analytics must be visible only to authorized IncidentRank admin users.

Do not expose raw analytics events publicly.

Use the existing admin authorization mechanism.

---

## 13. Basic Tests

Add focused tests for:

```text
event insertion
anonymous session handling
no duplicate page hit from rerender where practical
admin analytics authorization
funnel aggregation
scenario aggregation
```

Do not create an enormous analytics test suite.

---

## 14. Validation

Run the relevant:

```text
typecheck
lint
tests
build
```

and confirm no existing functionality is broken.

---

## 15. Completion Report

Return a short report titled:

```text
Phase 10G — Simple Funnel Analytics Completion
```

Include:

```text
events added
database/schema changes
pages instrumented
admin analytics added
funnel metrics available
files changed
tests
typecheck
lint
build
known limitations
```

Stop after this work.

Do not add:

```text
PostHog
Google Analytics
Mixpanel
session replay
heatmaps
complex attribution
marketing automation
data warehouse infrastructure
```

unless an existing project dependency already makes one of these trivial and unnecessary to duplicate.

The goal is a simple first-party funnel tracker inside IncidentRank so we can answer:

```text
How many people visit?
How many open an incident?
How many actually start?
How many finish?
How many click signup?
How many register?
Where do they drop off?
```