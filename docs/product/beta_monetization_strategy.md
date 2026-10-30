# Beta Monetization Strategy

Phase 10E (`docs/implementation_plan/phase10e.md` §43). Documents the deliberate choice to keep IncidentRank paid during the controlled beta, with aggressive launch discounts rather than a free tier, and why.

## The two customer segments

**Engineers**: paid, with aggressive launch discounts.

- Pro Monthly ($9.99/mo list) — 75% off the first 3 billing periods, then full price.
- Pro Annual ($79/yr list) — 50% off the first annual period, then full price.
- Founding Engineer ($99 one-time list, first 100 only) — 50% off the one-time price, lifetime practice access.

**Companies**: paid assessment credits, with a 50% first-purchase acquisition offer.

- Organization assessment credits ($50/credit or $5,000/110-credit pack list) — 50% off the organization's first successful purchase only, full price on every purchase after.

## Why not free-for-all-engineers

An earlier draft of this phase considered making all engineer practice incidents permanently free. That plan was explicitly rejected in favor of this one. The reasoning:

- **Willingness-to-pay is itself a signal.** An engineer who pays — even a discounted amount — is meaningfully more likely to be a serious, repeat participant than one who arrived at a $0 price point. That seriousness directly affects the quality of the benchmark evidence Phase 10E Part B is building (see `benchmark_moat.md`): a first attempt from an engaged, paying engineer carries more weight than a first attempt from someone with zero commitment to the platform.
- **A permanent free tier forecloses future pricing flexibility.** Once a feature is advertised as free, converting it to paid later is a hostile move users correctly resent. Launch discounts, by contrast, have a visible, honest expiration built into their own copy ("Then $9.99/month") — reverting to list price after the discount window is the expected, disclosed outcome from day one, not a bait-and-switch.
- **The discount already solves the real problem** the free-tier idea was meant to solve: lowering the barrier to first trial during the beta period when IncidentRank most needs engineers to show up and generate evidence. A 75%-off first three months accomplishes nearly the same acquisition effect as free, without the long-term pricing-power cost.

## Why the organization side keeps full first-purchase price discipline at 50%, not deeper

Organizations are the revenue engine (assessment credits fund the platform; engineer subscriptions alone would not). A 50% first-purchase offer removes friction from an organization's first, most uncertain purchase decision — "will this actually help us hire better?" — without devaluing the credit itself in the eyes of a buyer who has already seen it work. Unlike the engineer side, there is no second discount ever offered to the same organization: once an org has purchased once, it has already answered its own uncertainty question, and continued discounting would only erode margin on a buyer who no longer needs the incentive.

## What this buys IncidentRank during the beta

1. Real signed-up, paying engineers — a cleaner acquisition funnel than a free tier would produce, and a direct source of the first-attempt structured evidence the benchmark needs (see `benchmark_moat.md`).
2. Real paying organizations willing to try a technical assessment product at a lower first-purchase cost, converting to full-price repeat buyers once they've seen it work.
3. A pricing structure that can be dialed down (via `LAUNCH_DISCOUNTS_ENABLED=false`) at any time without having to reverse a "free" promise, once the beta period ends and IncidentRank moves to steady-state pricing.

## Strategic goal, stated plainly

> Retain the willingness-to-pay signal on both sides of the marketplace while accelerating benchmark participation during the beta — never trade commercial discipline for a vanity adoption number.
