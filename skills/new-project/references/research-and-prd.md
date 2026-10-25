# Research & PRD

How to research the landscape and write the PRD. The goal is a product doc grounded in **real
competitor gaps and real user complaints**, not vibes.

## An example kickoff brief

A strong brief, and the energy to match when a user starts a product:

> We're building a booking and reminders app for independent pet groomers.
> - Research the top existing tools groomers use today. Not just the famous ones: find the top
>   several.
> - **Important:** search Reddit, Hacker News and groomer forums for the common complaints and
>   gaps with those tools, so we can address them.
> - Write a PRD (markdown) covering the high-level vision, features, pricing (undercut the
>   incumbents, generous free tier) and top differentiators. Not too technical; that comes later.
> - Ideas that might help us stand out: [the user's own list]
> - Beyond my ideas, cover every core feature the landscape research turns up. Put yourself in
>   the shoes of a solo groomer and think about what's missing for them. Go deep.

Takeaways to apply every time:
1. **Find the real incumbents**: the top several, not just the famous ones.
2. **Mine the complaints** on Reddit, HN, forums, X, app-store and G2 reviews. That's the wedge.
3. **Undercut on pricing**, with a genuinely generous free tier.
4. **Keep the user's own differentiator ideas** alongside the table-stakes features the research
   surfaces. Drop neither.
5. **Inhabit the starting users** and ask what's missing for *them specifically*.
6. **Go deep**, but keep the PRD at product level, not architecture.

## Research method

Run two research passes and merge their briefs. If your agent can run subagents (Claude Code's
`Agent` tool, for example), start them in parallel; otherwise run them one after the other.

- **Competitors**: "Find the top N existing solutions for <space>. For each: core features,
  pricing tiers, positioning, who it's for, and notable strengths. Return a structured
  comparison." Prefer the products' own sites and recent reviews.
- **Complaints and gaps**: "Search Reddit, Hacker News, X, product forums, and G2 / app-store
  reviews for what users complain about with <incumbents or space>. Return concrete pain points,
  unmet needs, and verbatim quotes with sources." This is the most valuable pass.
- (Optional) **Niches**: trends and needs for the specific segments the user named.

Web search and page fetches cover most of it. For a large, crowded space, a deep-research skill
(if you have one) runs a heavier fan-out-and-verify pass; use it when the wedge isn't obvious.
Favor primary, dated sources and note anything that may be stale.

Synthesize a short **findings brief** (landscape table, top gaps, the wedge) and drive the PRD
from it. Save it as `docs/RESEARCH.md` if it's substantial.

## PRD template

Write `docs/PRD.md`. Adapt the sections to the product, but this is the default spine:

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

Keep it comprehensive but readable. The architecture comes from this skill's scaffold, so don't
turn the PRD into a tech spec; technical decisions go in `AGENTS.md`.
