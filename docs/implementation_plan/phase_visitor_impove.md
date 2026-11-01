Improve the IncidentRank homepage conversion experience and add a lightweight company inquiry/contact flow.

Keep both changes simple and consistent with the current IncidentRank design.

Do NOT redesign the site into a generic SaaS marketing page.

The current visual style is intentionally:

- dark
- sparse
- engineering-focused
- high-contrast
- minimal navigation
- minimal marketing language
- large typography
- lots of whitespace

Preserve that.

---

# Part 1 — Improve Homepage Conversion

The current homepage is visually strong but too sparse for cold visitors.

A new visitor should quickly understand:

```text
What is IncidentRank?
Who is it for?
What do I actually do?
Why is it different from normal interview questions?
Can I try it for free?
What should I click next?
```

## Keep the main headline

Keep:

```text
Production is the test.
```

as the primary hero headline.

Do not replace it with generic marketing copy.

---

## Improve the supporting explanation

Make the supporting copy explain the product more clearly.

The core idea should be:

```text
IncidentRank does not ask engineers what they would do.

It puts them inside a running production incident and measures what happens when they actually do it.
```

Keep this concise.

A suitable direction is:

```text
IncidentRank puts you inside realistic production incidents.

Diagnose the problem. Make operational decisions.
Stabilize the system and see how your choices perform.
```

Do not use buzzwords such as:

```text
AI-powered
revolutionary
next-generation
game-changing
```

---

## Primary CTA

Change the primary CTA from:

```text
Try an Incident
```

to:

```text
Try a Free Incident
```

or similarly concise wording.

The visitor should understand that they can experience IncidentRank without paying.

Free incidents are not limited to a fixed number.

IncidentRank will regularly make incidents available for free.

Suitable subtle supporting text:

```text
New free incidents available regularly.
No credit card required.
```

If the product process reliably supports weekly releases, this can instead say:

```text
New free incidents every week.
```

Do NOT say:

```text
3 free incidents
```

because that is not the current product model.

---

## Move the strongest differentiation higher

The current concept:

```text
IncidentRank does not ask engineers what they would do.
It puts them in a running system and measures what happens when they do it.
```

should not remain hidden in small footer text.

Move or incorporate this concept close to the hero.

---

## Add a very small "How it works" section

Keep it visually minimal.

For example:

```text
01  Diagnose
Read the architecture, metrics and timeline.

02  Act
Change the running system using real operational controls.

03  Stabilize
Decide when you're satisfied and finish the incident.
See how your decisions performed.
```

Typography and spacing should be enough.

Do not add large cards, illustrations, gradients, feature grids, or visual clutter.

---

## Add one concise differentiation section

Something along the lines of:

```text
Not multiple choice.
Not a theoretical interview question.

You operate the system.
Your actions change what happens next.
```

Keep this short.

---

## Secondary signup CTA

Signup should not become the dominant homepage action.

The primary path remains:

```text
Try a Free Incident
```

A secondary action may be:

```text
Create Account
```

Keep it visually secondary.

If the user is already authenticated, do not show unnecessary signup messaging.

---

## Anonymous post-incident signup conversion

Review the anonymous free-incident completion experience.

After an anonymous visitor completes an incident, show a clear but non-aggressive signup invitation.

Intent:

```text
Save your progress.

Create a free IncidentRank account to keep your completed incidents,
track your scores and continue practicing.
```

CTA:

```text
Create Free Account
```

Do not block the user from seeing the result they are otherwise allowed to see.

No dark patterns.

---

## Analytics

Use the existing lightweight first-party analytics.

Ensure these actions are tracked if not already:

```text
homepage_view
try_free_incident_clicked
signup_clicked
```

Do not add a new analytics platform.

---

# Part 2 — Add Company Inquiry / Contact Form

Companies currently do not have an obvious way to reach IncidentRank with questions.

Add a small company inquiry/contact form.

Keep it simple.

## Fields

```text
Company name
Name
Work email
Message
```

All fields should be required unless there is a strong UX reason otherwise.

---

## Email delivery

Send the inquiry to:

```text
support@incidentrank.com
```

Use the existing Resend integration.

Send server-side only.

Do not expose Resend/API credentials to the browser.

Set:

```text
Reply-To = submitted work email
```

Suggested subject:

```text
Company inquiry — <Company Name>
```

Email body should clearly include:

```text
Company
Name
Work email
Message
Timestamp
```

---

## Entry points

Add a small, unobtrusive entry point such as:

```text
For Companies
Contact
```

from the existing navigation or footer.

Also add a contact entry point on relevant company-facing pages if they already exist.

Example:

```text
Questions about using IncidentRank for hiring?
Contact us
```

Do not clutter the main hero.

---

## Validation

Validate:

```text
required fields
email format
reasonable maximum message length
```

Trim input appropriately.

Do not allow raw HTML injection.

---

## Spam / abuse protection

Add basic protection only.

Use the simplest appropriate mechanism already available in the codebase, such as:

```text
rate limiting by IP/session
honeypot field
server-side throttling
```

Do not add CAPTCHA unless clearly necessary.

Do not add a third-party anti-spam platform.

---

## Success / error UX

On successful send:

```text
Thanks — we'll get back to you shortly.
```

or similar concise wording.

On failure:

```text
We couldn't send your message right now. Please try again.
```

Do not expose internal Resend errors.

Email failure must not affect unrelated product functionality.

---

## Analytics

Track a simple event:

```text
company_inquiry_submitted
```

Optionally track:

```text
company_contact_opened
```

Do not include message contents or work email in analytics.

---

# Design Requirements

Both the homepage improvements and inquiry form should preserve the current IncidentRank aesthetic.

Keep:

```text
black background
existing typography
existing header/navigation
existing content width
large whitespace
monochrome palette
existing button style
minimal borders
```

Avoid:

```text
marketing carousels
large feature grids
customer logos
stock illustrations
testimonials
gradients
animated backgrounds
huge forms
chatbots
CRM widgets
```

The final homepage should still feel almost as simple as it does today.

---

# Responsive / Accessibility

Ensure:

```text
hero remains readable on mobile
CTA is easy to find
How It Works remains readable on narrow screens
contact form works cleanly on mobile
form fields have accessible labels
keyboard navigation works
error/success messages are accessible
no horizontal overflow
```

---

# Do Not Add

Do not add:

```text
HubSpot
Zendesk
Intercom
PostHog
Google Analytics
Mixpanel
session replay
CRM integration
ticketing system
chatbot
pricing changes
subscription changes
new billing logic
```

Use existing IncidentRank systems only.

---

# Validation

After implementation run the relevant:

```text
tests
typecheck
lint
build
```

Also verify:

```text
anonymous free-incident flow still works
authenticated navigation still works
existing analytics still work
company inquiry sends successfully in the configured environment
email failure is handled safely
mobile layout remains clean
```

---

# Return Report

Return a concise report titled:

```text
IncidentRank Homepage + Company Inquiry Improvement
```

Include:

```text
homepage copy changes
CTA changes
How It Works section
post-incident signup changes
company contact entry points
contact form implementation
Resend flow
spam/rate-limit approach
analytics events
files changed
tests
typecheck
lint
build
known limitations
```

Do not redesign unrelated pages.

Stop after completing these two requirements.