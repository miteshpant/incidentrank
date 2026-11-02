Implement an IncidentRank SEO/Public Discovery phase.

The goal is to make IncidentRank discoverable by search engines and improve shared-link previews **without exposing private scenario IP or candidate-runtime internals**.

This is not a content redesign phase and not a public-data dump.

The governing rule is:

```text
Search engines index the challenge proposition.
Candidates unlock the challenge content.
```

---

# 1. Core Security / IP Boundary

Do NOT server-render or expose the full authored scenario to search engines.

Public/indexable content may include only explicitly approved public metadata such as:

```text
slug
public title
public teaser / short description
difficulty
category/domain
public skill tags
public SEO title
public SEO description
public social/share description
```

Do NOT expose publicly:

```text
full incident briefing
architecture topology/details unless explicitly marked public
starting metrics/state
timeline details
controls
rule conditions
success conditions
acceptable conditions
timed events
hidden consequences
feedback rules
scoring configuration
golden paths
expected solution
historical-state mechanics
authoring metadata
private organization content
company-assessment content
```

Do not rely on CSS hiding.

If private data exists in:

```text
server-rendered HTML
React Server Component payload
serialized props
__NEXT_DATA__
preloaded API responses
public browser bundle
```

assume it is public.

---

# 2. Introduce Explicit Public SEO Metadata

Create the smallest explicit public metadata model.

Conceptually:

```ts
type PublicScenarioMetadata = {
  slug: string;
  title: string;
  teaser: string;
  difficulty: string;
  category?: string;
  publicSkills?: string[];
  seoTitle: string;
  seoDescription: string;
  socialDescription?: string;
};
```

Exact shape may differ.

Prefer a clear separation:

```text
PublicScenarioMetadata
vs
AuthoredScenario
```

Do not automatically derive public SEO content from every private AuthoredScenario field.

Public metadata must be intentionally safe.

---

# 3. Public Scenario Landing HTML

Fix `/incidents/[slug]` so the server-rendered HTML contains useful public content before any auth/runtime loading.

At minimum SSR:

```text
scenario title
difficulty
category/domain if safe
public teaser
public skills if safe
CTA to start/take the challenge
```

Example:

```text
Kafka Consumer Lag
Senior · Messaging & Streaming

A hands-on production incident challenge involving consumer lag,
backpressure, and event-processing capacity.

Skills:
Kafka consumer lag
Backpressure
Production incident response

[ Take the Challenge ]
```

Do NOT include the real playable incident internals in this public render.

---

# 4. Candidate Runtime Separation

Preserve the existing candidate flow.

When the user chooses to start/take the incident:

```text
access policy applies
→ candidate runtime loads
→ real briefing/runtime content becomes available according to existing rules
```

The SEO/public page must not weaken:

```text
paid practice access
weekly challenge access
organization assignment access
anonymous/free access rules
```

Do not expose private content merely because the landing page is indexable.

---

# 5. Per-Scenario Metadata

Implement `generateMetadata()` or the appropriate Next.js equivalent for each incident page.

Use only PublicScenarioMetadata.

Each scenario should have a unique title and description.

Example:

```text
Kafka Consumer Lag Incident Challenge | IncidentRank
```

Description example:

```text
Practice diagnosing and stabilizing Kafka consumer lag, backpressure,
and event-processing pressure in a realistic production incident.
```

Avoid keyword stuffing.

Do not claim capabilities or certifications that do not exist.

---

# 6. Static Page Metadata

Give key static pages unique metadata where missing, including at least:

```text
/
 /incidents
 /pricing if present
 /for-companies if present
 /contact if present
```

Do not leave the same global title/description on every page.

---

# 7. Sitemap

Add `sitemap.ts` or framework-equivalent sitemap generation.

Include:

```text
homepage
incidents index
all public built-in incident landing pages
pricing/company/contact pages if public
```

Do NOT include:

```text
admin pages
private assessment URLs
organization-internal pages
candidate assignment tokens
challenge tokens
auth callbacks
private result pages
```

Sitemap must derive from safe public scenario metadata only.

---

# 8. robots.txt

Add `robots.ts` or framework-equivalent robots configuration.

Allow crawling of intended public pages.

Explicitly disallow obvious private/internal areas where appropriate.

Do not rely on robots.txt as a security boundary.

Private data must still be protected server-side.

---

# 9. Canonical URLs

Add canonical URLs for:

```text
homepage
incidents index
scenario pages
pricing/company/contact pages where relevant
```

Avoid duplicate-content ambiguity.

Use the production domain:

```text
https://www.incidentrank.com
```

or the project's canonical configured production origin if already centralized.

Do not hardcode inconsistently across files if an existing site URL config exists.

---

# 10. Open Graph / Twitter Metadata

Add default site-level Open Graph and Twitter metadata.

Add per-scenario overrides using PublicScenarioMetadata.

A shared scenario URL should produce a useful preview containing:

```text
IncidentRank
scenario title
short public teaser
production domain
```

Do not expose private incident content in OG descriptions/images.

If no OG image generation system exists, use a simple existing/default brand image rather than building a large image-generation subsystem.

---

# 11. Structured Data

Add structured data only where semantically accurate.

At minimum consider:

Homepage:

```text
Organization
SoftwareApplication
```

Scenario landing pages:

Prefer a conservative schema such as:

```text
LearningResource
```

if it accurately fits the current page.

Do NOT force `Course` if the page is not actually a course.

Do not fabricate:

```text
ratings
reviews
certifications
pricing
completion time
provider claims
```

unless they are real and supported by the product.

Structured data must use only public metadata.

---

# 12. Public Scenario Content Depth

Do not turn scenario pages into long SEO articles.

Keep them minimal and aligned with IncidentRank's design.

A public scenario landing page may contain roughly:

```text
title
difficulty/category
100–300 words of public-safe teaser/context
public skills
how IncidentRank works
CTA
```

The content should explain the challenge without giving away:

```text
exact incident state
solution
architecture secrets
control strategy
scoring mechanics
```

---

# 13. Safe Public Content Authoring

Where current scenario data lacks a good SEO-safe teaser, add explicit public copy.

Do NOT simply copy the complete incident briefing into the public metadata.

For existing scenarios, create concise public-safe teaser content that explains the topic without exposing the scenario mechanics.

Examples of acceptable public phrases:

```text
Diagnose a production cache invalidation incident.
Practice reasoning about Kafka lag and backpressure.
Stabilize a multi-region dependency degradation.
```

Avoid revealing:

```text
specific initial metric values
exact failure trigger
hidden constraints
optimal mitigation
sequence of correct actions
```

---

# 14. Internal Linking

Improve simple internal discoverability.

The `/incidents` public page should link to indexable scenario landing pages.

Scenario pages may link back to:

```text
/incidents
homepage
related public incidents if already supported
```

Keep this minimal.

Do not build a recommendation engine.

---

# 15. Public vs Private Data Tests

Add explicit regression tests proving public pages do NOT serialize private scenario fields.

At minimum assert the public response does not contain known private keys/markers such as:

```text
successCondition
acceptableCondition
feedbackRules
scoring
timedEvents
rules
goldenPath
initialState
```

Also inspect whether authored scenario internals are pulled into the browser bundle unnecessarily.

If the current import structure causes private scenario definitions to be bundled client-side, refactor the boundary.

---

# 16. Assessment / Organization Privacy

Do not make company assessment scenarios publicly indexable merely because they share scenario infrastructure.

Public SEO applies only to intended public built-in scenario landing pages.

Never include:

```text
organization-authored scenarios
private assessment definitions
candidate-specific assignments
private attempt results
```

in:

```text
sitemap
metadata generation
public page rendering
structured data
```

---

# 17. Weekly Challenge SEO

If the Weekly Challenge is public, the underlying public scenario landing page may be indexed normally.

Do not create a separate indexable URL containing challenge-user data.

Challenge tokens and peer-to-peer challenge URLs must remain non-indexable/private.

Where useful, the homepage may mention the current Weekly Challenge, but no extra SEO subsystem is required.

---

# 18. Social Sharing Safety

Scenario share previews must use only:

```text
public title
public teaser
difficulty/category where appropriate
```

Do not leak:

```text
challenger score
candidate result
private attempt state
organization data
```

---

# 19. Performance

SEO changes must not materially slow the candidate experience.

Prefer static/server-generated public metadata where practical.

Do not load the full private scenario runtime merely to render:

```text
title
teaser
difficulty
public skills
```

---

# 20. Analytics

Do not add a new analytics platform.

Preserve the existing lightweight analytics.

Where practical, ensure SEO landing visits continue to produce the existing page-view/incident-view events.

Do not duplicate events due to server rendering + client hydration.

---

# 21. Validation

Run:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Also verify manually or with browser tooling:

```text
view-source / server response for a scenario includes public title/teaser
private scenario internals are absent
unique <title> exists
unique meta description exists
canonical exists
Open Graph exists
Twitter metadata exists
JSON-LD valid where implemented
sitemap loads
robots.txt loads
```

Check at least these representative scenarios:

```text
Kafka Consumer Lag
Cache Revalidation Herd
one security scenario
one cost scenario
one Principal/flagship scenario
```

---

# 22. SEO Safety Audit

Before completion, explicitly answer:

```text
Can a crawler see the public scenario title?
Can a crawler see the public teaser?
Can a crawler discover every intended public incident?
Can a crawler see unique metadata?

Can a crawler see the real incident briefing?
Can a crawler see controls?
Can a crawler see scoring rules?
Can a crawler see hidden consequences?
Can a crawler see golden paths?
Can a crawler see company/private assessment content?
```

Expected:

```text
YES
YES
YES
YES

NO
NO
NO
NO
NO
NO
```

---

# 23. Return Report

Return a report titled:

```text
IncidentRank SEO & Public Discovery Completion Report
```

Include:

## 1. Public/private architecture
- public metadata model
- private scenario boundary

## 2. Server-rendered scenario landing pages
- what now appears in HTML
- what intentionally does not

## 3. Per-page metadata
- scenario pages
- static pages

## 4. Sitemap
- page counts
- excluded private routes

## 5. Robots
- rules

## 6. Canonicals

## 7. Open Graph / Twitter

## 8. Structured data

## 9. Scenario public-content strategy

## 10. Private-IP leakage audit
- HTML
- RSC payload
- serialized props
- browser bundle/API payload

## 11. Organization/assessment privacy

## 12. Tests

## 13. Typecheck

## 14. Lint

## 15. Build

## 16. Files changed

## 17. Known limitations

## 18. Final recommendation

Exactly one:

```text
SEO PHASE READY FOR APPROVAL
```

or:

```text
SEO PHASE STILL BLOCKED
```

with exact blockers.

---

# 24. Stop Condition

Stop after this SEO/Public Discovery phase.

Do not add:

```text
large SEO blog system
AI-generated articles
programmatic long-form landing pages
backlink automation
keyword-stuffed content
public solution writeups
public architecture walkthroughs
public golden paths
```

The objective is:

```text
indexable
discoverable
shareable
SEO-safe
IP-safe
```

without changing the core IncidentRank product or exposing the incident engine.