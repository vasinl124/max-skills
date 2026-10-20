# Research & PRD

How to research the landscape and write the PRD. The goal is a product doc grounded in
**real competitor gaps and real user complaints** — not vibes.

## The canonical kickoff (a real example)

This is the energy to match. A strong kickoff reads like this:

> We're going to build a new SaaS product called **RogerIQ**, a next-generation customer
> support intelligence platform.
> - Research the top existing solutions (Helpscout, Freshdesk, Zendesk, and more — find the
>   top ones).
> - **Important:** research Reddit, Hacker News, and social forums for the common complaints
>   and gaps users have with these platforms, so we can address them.
> - Produce a PRD (markdown) covering the high-level vision, features, pricing (competitive,
>   undercut competitors, generous free tier), and top differentiators. Not too technical —
>   that comes later.
> - Core ideas that might help us stand out: [a long list of differentiators]
> - In addition to my suggestions, cover all the core features from the research of the
>   existing landscape. Really put yourself in the shoes of the starting demo niches and
>   think about what's missing for those users. Now go deep and produce a comprehensive PRD.

Takeaways to apply every time:
1. **Find the real incumbents** (not just the famous ones — the top several).
2. **Mine the complaints** on Reddit, HN, forums, X, app-store/G2 reviews. This is the wedge.
3. **Undercut on pricing** with a genuinely generous free tier.
4. **Fold the user's own differentiator ideas in** alongside the table-stakes features the
   research surfaces — don't drop either.
5. **Inhabit the starting ICP/niches** and ask what's missing for *them specifically*.
6. **Go deep**, but keep the PRD product-level, not architectural.

## Research method

Parallelize with subagents so it's fast. Spawn these in one turn (`Agent` tool,
`general-purpose`); merge their briefs afterward:

- **Competitor agent** — "Find the top N existing solutions for <space>. For each: core
  features, pricing tiers, positioning, who it's for, and notable strengths. Return a
  structured comparison." Prefer the products' own sites + recent reviews.
- **Complaint/gap agent** — "Search Reddit, Hacker News, X, product forums, and G2/app-store
  reviews for what users complain about with <incumbents/space>. Return concrete pain points,
  unmet needs, and verbatim quotes with sources." This is the most valuable pass.
- (Optional) **Trend/niche agent** for the specific ICPs the user named.

Tooling: `WebSearch` + `WebFetch` for most of it. For a large/competitive space, the
`deep-research` skill runs a heavier fan-out-and-verify pass — use it when the wedge isn't
obvious. Favor primary sources and dated material; note when something may be stale.

Synthesize into a short **findings brief** (landscape table + top gaps + the wedge) and use
it to drive the PRD. Keep the brief; you may save it to `docs/RESEARCH.md` if substantial.

## PRD template

Write `docs/PRD.md`. Adapt sections to the product, but this is the default spine:

```markdown
# <Product> — Product Requirements Document

## 1. Vision
One paragraph: what this is, who it's for, why now. The single sentence a user would
repeat to a friend.

## 2. Target users & niches
The starting ICP(s). For each: who they are, what they're doing today, what hurts.
Be specific — name the segments (e.g. "solo e-commerce founders on Shopify").

## 3. The problem & the gap
What's broken with the status quo, grounded in the research. Quote real complaints.
State the wedge: the gap incumbents leave open that we exploit first.

## 4. Competitive landscape
Short table of the top incumbents: features, pricing, positioning, where they fall short.
(Summarized from the research brief.)

## 5. Core features
The MVP feature set. Cover BOTH:
- table-stakes features the landscape research says are expected, and
- the differentiating features (the user's ideas + the gaps you found).
Group by area; mark MVP vs later. Keep it product-level, not implementation detail.

## 6. Differentiators
The top 3–7 reasons to choose this over incumbents. The sharp edges.

## 7. Pricing
Tiers undercutting incumbents, with a genuinely generous free tier. Show a quick
comparison to competitor pricing. Note the monetization model (seat-based? usage? flat?).

## 8. Non-goals (for now)
What we are explicitly NOT building yet, to stay focused.

## 9. Success metrics
What "working" looks like in the first phase (activation, retention, the one north-star).

## 10. Open questions
Decisions deferred, risks, things to validate with users.
```

Keep it comprehensive but readable. The architecture is handled by this skill's scaffold —
don't turn the PRD into a tech spec. Save the technical decisions for `AGENTS.md`.
