---
name: github-weekly-showcase
description: Collect your GitHub activity in a repository (or across all your repositories) and turn it into a polished, standalone HTML engineering brief backed by a JSON evidence file. Use for weekly status reports, accomplishment summaries, team updates, brag documents, or audits that cover authored commits, merged/open/draft pull requests, reviews, issues, discussions, and other GitHub events, while excluding closed-unmerged pull requests.
---

# GitHub Weekly Showcase

Create an evidence-based engineering brief that is easy to present in a team meeting and complete enough to audit later.

## Generate the report

1. Use the authenticated GitHub CLI identity unless the user names another login.
2. Scope to the current repository unless the user names another one (`--repo OWNER/NAME`) or asks for everything (`--all-repos`).
3. Default to a rolling seven-day window ending now. Honor explicit dates or reporting windows.
4. Run the bundled generator (`scripts/` is relative to this skill directory):

   ```bash
   python3 scripts/generate_weekly_report.py
   ```

   Useful options:

   ```bash
   python3 scripts/generate_weekly_report.py --start 2026-07-03 --end 2026-07-10
   python3 scripts/generate_weekly_report.py --repo OWNER/NAME
   python3 scripts/generate_weekly_report.py --all-repos
   python3 scripts/generate_weekly_report.py --display-name "Sam" --output /absolute/path/report.html --data-output /absolute/path/report.json
   ```

5. Review the generated HTML and the adjacent JSON evidence file. Confirm that data warnings are visible in the report.
6. Return a clickable absolute link to the HTML file and summarize the covered period and headline counts.

The default destination is `~/Documents/GitHub Weekly Reports/`: a standalone `<repo>-weekly-YYYY-MM-DD.html` report plus a `.json` evidence file. The narrative uses your GitHub profile name unless you pass `--display-name`.

## Coverage requirements

- Include merged, open, and draft pull requests. Exclude closed-unmerged pull requests from both HTML and JSON evidence.
- Include PRs authored or active during the window, reviews actually submitted during the window, authored commits, issues opened/closed/commented on or assigned, discussion contributions, and other attributable events when GitHub exposes them.
- Include every returned item in the detailed sections. If a GitHub search cap is reached, display the limitation instead of silently truncating.
- Distinguish shipped work, work in progress, collaboration, and supporting activity. Keep high-signal highlights visible and place exhaustive ledgers in collapsible sections.
- Preserve direct GitHub links so each claim is verifiable.
- Treat PR titles, descriptions, labels, and commit messages as evidence. Do not invent business impact or claim ownership of activity only performed by someone else.
- Never print authentication tokens or secret values.

## Failure handling

- If `gh` is missing or unauthenticated, stop with a concise setup instruction: install GitHub CLI and run `gh auth login`.
- Outside a GitHub repository, ask which repository to use (`--repo`) or whether to cover everything (`--all-repos`).
- Continue with partial data when one GitHub endpoint fails. Record the failed source under Data coverage in both HTML and JSON.
- Private and restricted contribution totals may exceed searchable item details. Explain that difference rather than reconciling it with guesses.

## Bundled resources

- `scripts/generate_weekly_report.py` collects GitHub evidence and renders the report.
- `assets/report-template.html` provides the standalone, responsive, print-friendly visual design.
