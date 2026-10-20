#!/usr/bin/env python3
"""Collect GitHub activity and render a standalone weekly HTML showcase."""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse


SEARCH_LIMIT_DEFAULT = 500
PR_SEARCH_FIELDS = (
    "author,body,closedAt,commentsCount,createdAt,isDraft,labels,number,"
    "repository,state,title,updatedAt,url"
)
ISSUE_SEARCH_FIELDS = (
    "assignees,author,body,closedAt,commentsCount,createdAt,labels,number,"
    "repository,state,title,updatedAt,url"
)
COMMIT_SEARCH_FIELDS = "author,commit,repository,sha,url"
PR_VIEW_FIELDS = (
    "additions,body,changedFiles,closedAt,commits,createdAt,deletions,isDraft,"
    "labels,latestReviews,mergedAt,mergedBy,reviewDecision,reviews,state,title,updatedAt,url"
)
ISSUE_VIEW_FIELDS = (
    "assignees,body,closedAt,comments,createdAt,labels,state,title,updatedAt,url"
)


def e(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def run(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, text=True, capture_output=True)
    if check and result.returncode != 0:
        message = result.stderr.strip() or result.stdout.strip() or "command failed"
        raise RuntimeError(f"{' '.join(args[:3])}: {message}")
    return result


def run_json(args: list[str]) -> Any:
    result = run(args)
    try:
        return json.loads(result.stdout or "null")
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON from {' '.join(args[:3])}: {exc}") from exc


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.now().astimezone().tzinfo)
    return parsed.astimezone(timezone.utc)


def parse_boundary(value: str | None, *, is_end: bool, local_tz: Any) -> datetime | None:
    if not value:
        return None
    raw = value.strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        day = datetime.strptime(raw, "%Y-%m-%d").date()
        boundary = time.max if is_end else time.min
        return datetime.combine(day, boundary, tzinfo=local_tz)
    parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=local_tz)
    return parsed.astimezone(local_tz)


def within(value: str | None, start_utc: datetime, end_utc: datetime) -> bool:
    parsed = parse_datetime(value)
    return bool(parsed and start_utc <= parsed <= end_utc)


def format_local(value: str | None, local_tz: Any, *, include_time: bool = False) -> str:
    parsed = parse_datetime(value)
    if not parsed:
        return "—"
    local = parsed.astimezone(local_tz)
    return local.strftime("%b %-d, %Y · %-I:%M %p") if include_time else local.strftime("%b %-d")


def repo_name(item: dict[str, Any]) -> str:
    repository = item.get("repository") or {}
    return repository.get("nameWithOwner") or repository.get("fullName") or repository.get("name") or "Unknown repository"


def label_names(item: dict[str, Any]) -> list[str]:
    return [label.get("name", "") for label in (item.get("labels") or []) if label.get("name")]


def first_sentence(body: str | None, limit: int = 220) -> str:
    if not body:
        return ""
    lines = []
    in_fence = False
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if line.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence or not line or line.startswith(("#", "<!--", "- [")):
            continue
        if re.match(r"^(?:!\[|<\s*(?:img|picture|source)\b)", line, flags=re.IGNORECASE):
            continue
        line = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", line)
        line = re.sub(r"<[^>]+>", " ", line)
        line = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", line)
        line = re.sub(r"[*_`>#]", "", line).strip()
        if line:
            lines.append(line)
        if len(" ".join(lines)) >= limit:
            break
    text = " ".join(lines)
    if len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"
    return text


def initials(name: str) -> str:
    parts = [part for part in re.split(r"\s+", name.strip()) if part]
    if not parts:
        return "GH"
    return "".join(part[0].upper() for part in parts[:2])


def dedupe(items: Iterable[dict[str, Any]], key: str = "url") -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for item in items:
        item_key = str(item.get(key) or item.get("id") or len(merged))
        if item_key not in merged:
            merged[item_key] = dict(item)
        else:
            existing = merged[item_key]
            flags = set(existing.get("_matches", [])) | set(item.get("_matches", []))
            existing.update({k: v for k, v in item.items() if v not in (None, "", [], {})})
            if flags:
                existing["_matches"] = sorted(flags)
    return list(merged.values())


class Collector:
    def __init__(
        self,
        login: str,
        start: datetime,
        end: datetime,
        limit: int,
        only_repo: str | None,
        quiet: bool,
    ) -> None:
        self.login = login
        self.start = start.astimezone(timezone.utc)
        self.end = end.astimezone(timezone.utc)
        self.limit = limit
        self.only_repo = only_repo
        self.quiet = quiet
        self.warnings: list[str] = []
        self.sources: dict[str, str] = {}
        self.search_range = f"{self.start.date().isoformat()}..{self.end.date().isoformat()}"

    def progress(self, message: str) -> None:
        if not self.quiet:
            print(message, file=sys.stderr)

    def repo_flags(self) -> list[str]:
        return ["--repo", self.only_repo] if self.only_repo else []

    def safe(self, source: str, fn: Any, fallback: Any) -> Any:
        try:
            value = fn()
            self.sources[source] = "complete"
            return value
        except Exception as exc:  # network/API failures should not erase the report
            self.sources[source] = "partial or unavailable"
            self.warnings.append(f"{source}: {exc}")
            return fallback

    def search(self, kind: str, flag: str, value: str, fields: str) -> list[dict[str, Any]]:
        args = ["gh", "search", kind, flag, value, *self.repo_flags(), "--limit", str(self.limit), "--json", fields]
        items = run_json(args) or []
        for item in items:
            item["_matches"] = [flag.lstrip("-")]
        if len(items) >= self.limit:
            self.warnings.append(f"GitHub {kind} search reached the configured cap of {self.limit} results for {flag}.")
        return items

    def enrich_many(self, items: list[dict[str, Any]], kind: str, fields: str) -> list[dict[str, Any]]:
        if not items:
            return []
        self.progress(f"Enriching {len(items)} {kind} records…")

        def load(item: dict[str, Any]) -> tuple[dict[str, Any], str | None]:
            url = item.get("url")
            if not url:
                return item, None
            try:
                detail = run_json(["gh", kind, "view", url, "--json", fields]) or {}
                matches = item.get("_matches", [])
                detail["_matches"] = matches
                detail["repository"] = item.get("repository") or detail.get("repository")
                detail["number"] = item.get("number")
                detail["author"] = item.get("author") or detail.get("author")
                detail["commentsCount"] = item.get("commentsCount")
                return detail, None
            except Exception as exc:
                return item, f"Could not enrich {url}: {exc}"

        enriched: list[dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(load, item) for item in items]
            for future in as_completed(futures):
                item, warning = future.result()
                enriched.append(item)
                if warning:
                    self.warnings.append(warning)
        return enriched

    def collect_prs_and_reviews(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        self.progress("Collecting pull requests and reviews…")
        authored_parts: list[dict[str, Any]] = []
        for flag in ("--updated", "--created", "--merged-at"):
            args = [
                "gh", "search", "prs", "--author", self.login, flag, self.search_range,
                *self.repo_flags(), "--limit", str(self.limit), "--json", PR_SEARCH_FIELDS,
            ]
            results = run_json(args) or []
            for item in results:
                item["_matches"] = [flag.lstrip("-")]
            if len(results) >= self.limit:
                self.warnings.append(f"Pull-request search reached {self.limit} results for {flag}.")
            authored_parts.extend(results)

        review_args = [
            "gh", "search", "prs", "--reviewed-by", self.login, "--updated", self.search_range,
            *self.repo_flags(), "--limit", str(self.limit), "--json", PR_SEARCH_FIELDS,
        ]
        reviewed_candidates = run_json(review_args) or []
        for item in reviewed_candidates:
            item["_matches"] = ["reviewed-by"]
        if len(reviewed_candidates) >= self.limit:
            self.warnings.append(f"Reviewed pull-request search reached {self.limit} results.")

        union = dedupe([*authored_parts, *reviewed_candidates])
        enriched = self.enrich_many(union, "pr", PR_VIEW_FIELDS)
        by_url = {item.get("url"): item for item in enriched}
        authored_urls = {item.get("url") for item in authored_parts}
        authored = []
        for url in authored_urls:
            if url not in by_url:
                continue
            pr = by_url[url]
            status = pr_status(pr)
            if status == "closed":
                continue
            relevant = (
                within(pr.get("mergedAt"), self.start, self.end)
                if status == "merged"
                else within(pr.get("createdAt"), self.start, self.end) or within(pr.get("updatedAt"), self.start, self.end)
            )
            if relevant:
                authored.append(pr)

        reviews: list[dict[str, Any]] = []
        for candidate in reviewed_candidates:
            detail = by_url.get(candidate.get("url"), candidate)
            if pr_status(detail) == "closed":
                continue
            for review in detail.get("reviews") or []:
                author = (review.get("author") or {}).get("login", "")
                if author.lower() != self.login.lower() or not within(review.get("submittedAt"), self.start, self.end):
                    continue
                reviews.append(
                    {
                        "repository": detail.get("repository"),
                        "number": candidate.get("number"),
                        "title": detail.get("title") or candidate.get("title"),
                        "url": detail.get("url") or candidate.get("url"),
                        "state": review.get("state") or "COMMENTED",
                        "submittedAt": review.get("submittedAt"),
                        "body": review.get("body") or "",
                    }
                )
        for review in reviews:
            review["_reviewKey"] = "|".join(
                [
                    str(review.get("url") or ""),
                    str(review.get("submittedAt") or ""),
                    str(review.get("state") or ""),
                    str(review.get("body") or ""),
                ]
            )
        reviews = dedupe(reviews, key="_reviewKey")
        for review in reviews:
            review.pop("_reviewKey", None)
        self.sources["Pull requests and reviews"] = "complete"
        return authored, reviews

    def collect_commits(self) -> list[dict[str, Any]]:
        self.progress("Collecting authored commits…")
        args = [
            "gh", "search", "commits", "--author", self.login, "--author-date", self.search_range,
            *self.repo_flags(), "--limit", str(self.limit), "--sort", "author-date", "--order", "desc",
            "--json", COMMIT_SEARCH_FIELDS,
        ]
        items = run_json(args) or []
        filtered = [
            item for item in items
            if within(((item.get("commit") or {}).get("author") or {}).get("date"), self.start, self.end)
        ]
        if len(items) >= self.limit:
            self.warnings.append(f"Commit search reached the configured cap of {self.limit} results.")
        self.sources["Authored commits"] = "complete"
        return filtered

    def collect_issues(self) -> list[dict[str, Any]]:
        self.progress("Collecting issues and issue comments…")
        parts: list[dict[str, Any]] = []
        queries = (
            ("--author", self.login, "--updated", self.search_range, "authored"),
            ("--author", self.login, "--created", self.search_range, "created"),
            ("--author", self.login, "--closed", self.search_range, "closed"),
            ("--assignee", self.login, "--updated", self.search_range, "assigned"),
            ("--commenter", self.login, "--updated", self.search_range, "commented"),
        )
        for actor_flag, actor, date_flag, date_value, match in queries:
            args = [
                "gh", "search", "issues", actor_flag, actor, date_flag, date_value,
                *self.repo_flags(), "--limit", str(self.limit), "--json", ISSUE_SEARCH_FIELDS,
            ]
            results = run_json(args) or []
            for item in results:
                item["_matches"] = [match]
            if len(results) >= self.limit:
                self.warnings.append(f"Issue search reached {self.limit} results for {match}.")
            parts.extend(results)
        issues = self.enrich_many(dedupe(parts), "issue", ISSUE_VIEW_FIELDS)
        for issue in issues:
            own_comments = []
            for comment in issue.get("comments") or []:
                author = (comment.get("author") or {}).get("login", "")
                if author.lower() == self.login.lower() and within(comment.get("createdAt"), self.start, self.end):
                    own_comments.append(comment)
            issue["ownComments"] = own_comments
        self.sources["Issues and comments"] = "complete"
        return issues

    def collect_contributions(self) -> dict[str, Any]:
        self.progress("Collecting discussions…")
        repository_argument = ""
        variables = ["-F", f"login={self.login}"]
        declaration = "$login:String!"
        collection = ""
        if self.only_repo:
            repository = run_json(["gh", "api", f"repos/{self.only_repo}"]) or {}
            repository_id = repository.get("node_id")
            if not repository_id:
                raise RuntimeError(f"Could not resolve the GraphQL repository id for {self.only_repo}")
            declaration += ", $repositoryId:ID!"
            repository_argument = "repositoryId:$repositoryId"
            variables.extend(["-F", f"repositoryId={repository_id}"])
        else:
            declaration += ", $from:DateTime!, $to:DateTime!"
            collection = """
            contributionsCollection(from:$from, to:$to) {
              totalCommitContributions
              totalIssueContributions
              totalPullRequestContributions
              totalPullRequestReviewContributions
              totalRepositoryContributions
              restrictedContributionsCount
            }
            """
            variables.extend(
                [
                    "-F", f"from={self.start.isoformat().replace('+00:00', 'Z')}",
                    "-F", f"to={self.end.isoformat().replace('+00:00', 'Z')}",
                ]
            )

        query = f"""
        query({declaration}) {{
          user(login:$login) {{
            login name avatarUrl url
            {collection}
            repositoryDiscussions(last:100{', ' + repository_argument if repository_argument else ''}) {{
              pageInfo {{ hasPreviousPage }}
              nodes {{ createdAt title url repository {{ nameWithOwner url }} }}
            }}
            repositoryDiscussionComments(last:100{', ' + repository_argument if repository_argument else ''}) {{
              pageInfo {{ hasPreviousPage }}
              nodes {{ createdAt url discussion {{ title url repository {{ nameWithOwner url }} }} }}
            }}
          }}
        }}
        """
        payload = run_json(
            ["gh", "api", "graphql", "-f", f"query={query}", *variables]
        )
        source_name = f"GitHub discussions ({self.only_repo})" if self.only_repo else "GitHub contribution graph and discussions"
        self.sources[source_name] = "complete"
        user = ((payload or {}).get("data") or {}).get("user") or {}
        for connection_name in ("repositoryDiscussions", "repositoryDiscussionComments"):
            connection = user.get(connection_name) or {}
            if (connection.get("pageInfo") or {}).get("hasPreviousPage"):
                self.warnings.append(f"GitHub returned the latest 100 records for {connection_name}; older matching records may not be itemized.")
        return user

    def collect_other_events(self) -> list[dict[str, Any]]:
        self.progress("Collecting other attributable public events…")
        result = run_json(["gh", "api", "--paginate", "--slurp", f"users/{self.login}/events?per_page=100"])
        pages = result if isinstance(result, list) else []
        events = [item for page in pages for item in (page if isinstance(page, list) else [])]
        allowed = {"CreateEvent", "DeleteEvent", "ForkEvent", "GollumEvent", "MemberEvent", "PublicEvent", "ReleaseEvent"}
        filtered = [
            event
            for event in events
            if event.get("type") in allowed
            and within(event.get("created_at"), self.start, self.end)
            and (not self.only_repo or ((event.get("repo") or {}).get("name") or "").lower() == self.only_repo.lower())
        ]
        self.sources["Other public GitHub events"] = "complete (public events only)"
        return filtered


def current_repo_name() -> str | None:
    result = run(["git", "remote", "get-url", "origin"], check=False)
    if result.returncode != 0:
        return None
    remote = result.stdout.strip()
    if remote.startswith("git@github.com:"):
        path = remote.split(":", 1)[1]
    else:
        path = urlparse(remote).path.lstrip("/")
    return re.sub(r"\.git$", "", path) or None


def pr_status(pr: dict[str, Any]) -> str:
    if pr.get("mergedAt"):
        return "merged"
    state = str(pr.get("state") or "").lower()
    if state == "open" and pr.get("isDraft"):
        return "draft"
    if state == "open":
        return "open"
    return "closed"


def status_badge(status: str) -> str:
    labels = {"merged": "Merged", "open": "Open", "draft": "Draft", "closed": "Closed", "approved": "Approved", "changes_requested": "Changes requested", "commented": "Commented"}
    return f'<span class="badge badge--{e(status)}">{e(labels.get(status, status.replace("_", " ").title()))}</span>'


def item_link(url: str | None, label: str) -> str:
    return f'<a href="{e(url)}" target="_blank" rel="noreferrer">{e(label)}</a>' if url else e(label)


def render_pr_cards(items: list[dict[str, Any]], local_tz: Any, empty: str) -> str:
    if not items:
        return f'<div class="empty">{e(empty)}</div>'
    cards = []
    for pr in sorted(items, key=lambda item: parse_datetime(item.get("mergedAt") or item.get("updatedAt")) or datetime.min.replace(tzinfo=timezone.utc), reverse=True):
        status = pr_status(pr)
        number = pr.get("number") or "?"
        context = first_sentence(pr.get("body"))
        labels = "".join(f'<span class="label">{e(name)}</span>' for name in label_names(pr)[:5])
        stats = []
        if pr.get("changedFiles") is not None:
            stats.append(f'{int(pr.get("changedFiles") or 0):,} files')
        if pr.get("additions") is not None:
            stats.append(f'<span class="add">+{int(pr.get("additions") or 0):,}</span>')
        if pr.get("deletions") is not None:
            stats.append(f'<span class="del">−{int(pr.get("deletions") or 0):,}</span>')
        date_value = pr.get("mergedAt") or pr.get("updatedAt") or pr.get("createdAt")
        cards.append(
            '<article class="work-card">'
            f'<div class="work-card__index"><span>PR</span><strong>#{e(number)}</strong></div>'
            '<div class="work-card__body">'
            f'<div class="work-card__top">{status_badge(status)}<time>{e(format_local(date_value, local_tz))}</time></div>'
            f'<h3>{item_link(pr.get("url"), pr.get("title") or "Untitled pull request")}</h3>'
            f'{f"<p>{e(context)}</p>" if context else ""}'
            f'<div class="meta"><span>{" · ".join(stats)}</span>{f"<div class=\"labels\">{labels}</div>" if labels else ""}</div>'
            '</div>'
            '</article>'
        )
    return "".join(cards)


def render_reviews(reviews: list[dict[str, Any]], local_tz: Any) -> str:
    if not reviews:
        return '<div class="empty">No submitted reviews were found in this reporting window.</div>'
    grouped: dict[str, dict[str, Any]] = {}
    for review in reviews:
        key = str(review.get("url") or f'{repo_name(review)}#{review.get("number")}')
        if key not in grouped:
            grouped[key] = {"sample": review, "states": Counter(), "latest": review.get("submittedAt"), "count": 0}
        group = grouped[key]
        state = str(review.get("state") or "COMMENTED").lower()
        group["states"][state] += 1
        group["count"] += 1
        if (parse_datetime(review.get("submittedAt")) or datetime.min.replace(tzinfo=timezone.utc)) > (
            parse_datetime(group.get("latest")) or datetime.min.replace(tzinfo=timezone.utc)
        ):
            group["latest"] = review.get("submittedAt")
    rows = []
    ordered = sorted(grouped.values(), key=lambda item: parse_datetime(item.get("latest")) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    for group in ordered:
        review = group["sample"]
        states: Counter[str] = group["states"]
        state_summary = " · ".join(f'{count} {state.replace("_", " ")}' for state, count in states.items())
        rows.append(
            '<tr>'
            f'<td>{item_link(review.get("url"), f"#{review.get("number") or "?"} {review.get("title") or "Pull request"}")}</td>'
            f'<td><strong class="review-count">{int(group["count"]):,}</strong><span class="review-mix">{e(state_summary)}</span></td>'
            f'<td>{e(format_local(group.get("latest"), local_tz, include_time=True))}</td>'
            '</tr>'
        )
    return '<div class="table-wrap"><table><thead><tr><th>Pull request</th><th>Review actions</th><th>Latest</th></tr></thead><tbody>' + "".join(rows) + '</tbody></table></div>'


def render_issues(issues: list[dict[str, Any]], login: str, start: datetime, end: datetime, local_tz: Any) -> str:
    if not issues:
        return '<div class="empty">No attributable issue activity was found in this reporting window.</div>'
    rows = []
    for issue in sorted(issues, key=lambda item: parse_datetime(item.get("updatedAt")) or datetime.min.replace(tzinfo=timezone.utc), reverse=True):
        relations = set(issue.get("_matches") or [])
        author = (issue.get("author") or {}).get("login", "")
        if author.lower() == login.lower() and within(issue.get("createdAt"), start, end):
            relations.add("opened")
        if within(issue.get("closedAt"), start, end):
            relations.add("closed")
        if issue.get("ownComments"):
            relations.add(f'{len(issue["ownComments"])} comment' + ("s" if len(issue["ownComments"]) != 1 else ""))
        relation_html = "".join(f'<span class="label">{e(value)}</span>' for value in sorted(relations))
        rows.append(
            '<tr>'
            f'<td>{item_link(issue.get("url"), f"#{issue.get("number") or "?"} {issue.get("title") or "Issue"}")}</td>'
            f'<td><span class="badge badge--{e(str(issue.get("state") or "open").lower())}">{e(str(issue.get("state") or "open").title())}</span></td>'
            f'<td><div class="labels">{relation_html}</div></td>'
            '</tr>'
        )
    return '<div class="table-wrap"><table><thead><tr><th>Issue</th><th>State</th><th>Involvement</th></tr></thead><tbody>' + "".join(rows) + '</tbody></table></div>'


def render_commits(commits: list[dict[str, Any]], local_tz: Any) -> str:
    if not commits:
        return '<div class="empty">No authored commits were returned for this reporting window.</div>'
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for commit in commits:
        grouped[repo_name(commit)].append(commit)
    groups = []
    for repo, items in sorted(grouped.items(), key=lambda pair: (-len(pair[1]), pair[0].lower())):
        rows = []
        for item in sorted(items, key=lambda value: parse_datetime(((value.get("commit") or {}).get("author") or {}).get("date")) or datetime.min.replace(tzinfo=timezone.utc), reverse=True):
            commit = item.get("commit") or {}
            message = (commit.get("message") or "Untitled commit").splitlines()[0]
            authored = (commit.get("author") or {}).get("date")
            rows.append(
                '<li>'
                f'<span class="commit-sha">{item_link(item.get("url"), str(item.get("sha") or "")[:7])}</span>'
                f'<span class="commit-message">{e(message)}</span>'
                f'<span class="commit-date">{e(format_local(authored, local_tz))}</span>'
                '</li>'
            )
        groups.append(
            f'<details class="commit-group"><summary><span>Complete commit ledger</span><strong>{len(items)} commit{"s" if len(items) != 1 else ""}</strong></summary><ul>{"".join(rows)}</ul></details>'
        )
    return "".join(groups)


def describe_event(event: dict[str, Any]) -> tuple[str, str, str | None]:
    event_type = event.get("type") or "Event"
    payload = event.get("payload") or {}
    repo = ((event.get("repo") or {}).get("name")) or "GitHub"
    url = None
    if event_type == "CreateEvent":
        ref_type = payload.get("ref_type") or "resource"
        ref = payload.get("ref")
        title = f'Created {ref_type}' + (f' “{ref}”' if ref else "")
    elif event_type == "DeleteEvent":
        title = f'Deleted {payload.get("ref_type") or "resource"} “{payload.get("ref") or ""}”'
    elif event_type == "ReleaseEvent":
        release = payload.get("release") or {}
        title = f'{str(payload.get("action") or "Published").title()} release {release.get("name") or release.get("tag_name") or ""}'
        url = release.get("html_url")
    elif event_type == "ForkEvent":
        forkee = payload.get("forkee") or {}
        title = f'Forked repository to {forkee.get("full_name") or "a new repository"}'
        url = forkee.get("html_url")
    else:
        title = event_type.replace("Event", " event")
    return repo, title, url


def render_other(discussions: list[dict[str, Any]], comments: list[dict[str, Any]], events: list[dict[str, Any]], local_tz: Any) -> str:
    entries: list[tuple[datetime, str]] = []
    for node, kind in [(node, "Discussion") for node in discussions] + [(node, "Discussion comment") for node in comments]:
        discussion = node.get("discussion") or {}
        repository = discussion.get("repository") or {}
        occurred = parse_datetime(node.get("occurredAt")) or datetime.min.replace(tzinfo=timezone.utc)
        content = (
            f'<div><span class="repo">{e(repository.get("nameWithOwner") or "GitHub")}</span>'
            f'<h3>{item_link(discussion.get("url"), discussion.get("title") or kind)}</h3>'
            f'<p>{e(kind)} · {e(format_local(node.get("occurredAt"), local_tz, include_time=True))}</p></div>'
        )
        entries.append((occurred, content))
    for event in events:
        repo, title, url = describe_event(event)
        occurred = parse_datetime(event.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc)
        content = (
            f'<div><span class="repo">{e(repo)}</span><h3>{item_link(url, title)}</h3>'
            f'<p>{e(format_local(event.get("created_at"), local_tz, include_time=True))}</p></div>'
        )
        entries.append((occurred, content))
    if not entries:
        return '<div class="empty">No additional discussions, releases, branch/tag events, or other attributable events were returned.</div>'
    return '<div class="other-grid">' + "".join(f'<article class="other-card">{content}</article>' for _, content in sorted(entries, key=lambda pair: pair[0], reverse=True)) + '</div>'


def render_repo_summary(repos: dict[str, Counter[str]]) -> str:
    if not repos:
        return '<div class="empty">No repositories were returned for this window.</div>'
    rows = []
    for repo, counts in sorted(repos.items(), key=lambda pair: (-sum(pair[1].values()), pair[0].lower())):
        total = sum(counts.values())
        detail = " · ".join(f'{value} {key}' for key, value in counts.items() if value)
        rows.append(f'<div class="repo-row"><div><strong>{e(repo)}</strong><span>{e(detail)}</span></div><b>{total}</b></div>')
    return "".join(rows)


def render_warnings(warnings: list[str], sources: dict[str, str], restricted: int) -> str:
    source_rows = "".join(f'<li><span>{e(name)}</span><strong>{e(status)}</strong></li>' for name, status in sorted(sources.items()))
    notes = list(dict.fromkeys(warnings))
    if restricted:
        notes.append(f"GitHub reported {restricted} restricted contribution(s) whose item details are not exposed by search APIs.")
    note_html = "".join(f'<li>{e(note)}</li>' for note in notes) or '<li>No collection warnings were reported.</li>'
    return f'<div class="coverage-grid"><div><h3>Sources</h3><ul class="source-list">{source_rows}</ul></div><div><h3>Notes</h3><ul class="note-list">{note_html}</ul></div></div>'


def build_report(data: dict[str, Any], template: str, local_tz: Any) -> str:
    profile = data.get("profile") or {}
    contributions = data.get("contributions") or {}
    collection = contributions.get("contributionsCollection") or {}
    prs = data.get("pullRequests") or []
    reviews = data.get("reviews") or []
    commits = data.get("commits") or []
    issues = data.get("issues") or []
    events = data.get("otherEvents") or []
    discussions = [
        {"occurredAt": node.get("createdAt"), "discussion": node}
        for node in (((contributions.get("repositoryDiscussions") or {}).get("nodes")) or [])
        if within(node.get("createdAt"), data["period"]["startUtcParsed"], data["period"]["endUtcParsed"])
    ]
    answers = [
        {"occurredAt": node.get("createdAt"), "discussion": node.get("discussion") or {}, "url": node.get("url")}
        for node in (((contributions.get("repositoryDiscussionComments") or {}).get("nodes")) or [])
        if within(node.get("createdAt"), data["period"]["startUtcParsed"], data["period"]["endUtcParsed"])
    ]

    grouped_prs = {status: [pr for pr in prs if pr_status(pr) == status] for status in ("merged", "open", "draft")}
    additions = sum(int(pr.get("additions") or 0) for pr in grouped_prs["merged"])
    deletions = sum(int(pr.get("deletions") or 0) for pr in grouped_prs["merged"])
    changed_files = sum(int(pr.get("changedFiles") or 0) for pr in grouped_prs["merged"])
    issue_comments = sum(len(issue.get("ownComments") or []) for issue in issues)
    issue_opened = sum(1 for issue in issues if within(issue.get("createdAt"), data["period"]["startUtcParsed"], data["period"]["endUtcParsed"]))
    issue_closed = sum(1 for issue in issues if within(issue.get("closedAt"), data["period"]["startUtcParsed"], data["period"]["endUtcParsed"]))
    restricted = int(collection.get("restrictedContributionsCount") or 0)

    repos: dict[str, Counter[str]] = defaultdict(Counter)
    for commit in commits:
        repos[repo_name(commit)]["commits"] += 1
    for pr in prs:
        repos[repo_name(pr)][f'{pr_status(pr)} PRs'] += 1
    for review in reviews:
        repos[repo_name(review)]["reviews"] += 1
    for issue in issues:
        repos[repo_name(issue)]["issues"] += 1

    name = data.get("displayName") or profile.get("name") or profile.get("login") or data.get("login") or "GitHub contributor"
    merged_count = len(grouped_prs["merged"])
    open_count = len(grouped_prs["open"])
    draft_count = len(grouped_prs["draft"])
    review_count = len(reviews)
    reviewed_pr_count = len({review.get("url") for review in reviews if review.get("url")})
    repo_scope = str(data.get("scope") or "")
    repo_short = repo_scope.split("/")[-1]
    monogram = "".join(w[0] for w in re.split(r"[^A-Za-z0-9]+", repo_short) if w)[:2].upper() if "/" in repo_scope else "GH"
    summary_parts = []
    if merged_count:
        summary_parts.append(f"shipped {merged_count} merged pull request{'s' if merged_count != 1 else ''}")
    if commits:
        summary_parts.append(f"authored {len(commits)} commit{'s' if len(commits) != 1 else ''}")
    if review_count:
        summary_parts.append(f"submitted {review_count} review{'s' if review_count != 1 else ''}")
    if not summary_parts:
        summary_parts.append("had no searchable code or review contributions returned")
    summary = f"This week in {repo_short}, {name} " + ", ".join(summary_parts[:-1]) + (" and " if len(summary_parts) > 1 else "") + summary_parts[-1] + "."
    if open_count or draft_count:
        summary += f" Work continues on {open_count} open and {draft_count} draft pull request{'s' if open_count + draft_count != 1 else ''}."

    metric_values = [
        (merged_count, "PRs merged", "Shipped"),
        (len(commits), "Authored commits", "Code"),
        (reviewed_pr_count, "PRs reviewed", "Collaboration"),
        (open_count + draft_count, "PRs in progress", "In flight"),
    ]
    metrics = "".join(f'<div class="metric"><span>{e(kicker)}</span><strong>{value:,}</strong><p>{e(label)}</p></div>' for value, label, kicker in metric_values)

    snapshot = (
        f'<div><span>Change surface</span><strong>{changed_files:,} files</strong><p><b class="add">+{additions:,}</b> / <b class="del">−{deletions:,}</b> across merged PRs</p></div>'
        f'<div><span>Review support</span><strong>{review_count:,} actions</strong><p>Across {reviewed_pr_count:,} pull request{"s" if reviewed_pr_count != 1 else ""}</p></div>'
        f'<div><span>Issue coordination</span><strong>{issue_opened} opened · {issue_closed} closed</strong><p>{issue_comments} comment{"s" if issue_comments != 1 else ""} submitted</p></div>'
        f'<div><span>Workflow state</span><strong>{merged_count} merged · {open_count} open</strong><p>{draft_count} draft pull request{"s" if draft_count != 1 else ""}</p></div>'
    )

    merged_sorted = sorted(
        grouped_prs["merged"],
        key=lambda item: parse_datetime(item.get("mergedAt")) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    end_for_week = parse_datetime(data["period"]["endUtc"]) or datetime.now(timezone.utc)

    replacements = {
        "TITLE": f"{repo_short} · Weekly engineering update",
        "NAME": name,
        "LOGIN": f"@{profile.get('login') or data.get('login')}",
        "PROFILE_URL": profile.get("url") or f"https://github.com/{data.get('login')}",
        "REPO": repo_short,
        "REPO_FULL": repo_scope,
        "MONOGRAM": monogram,
        "REPO_URL": f"https://github.com/{repo_scope}" if "/" in repo_scope else "https://github.com",
        "WEEK": f"W{end_for_week.isocalendar().week:02d}",
        "PERIOD": data["period"]["display"],
        "GENERATED": data["generatedDisplay"],
        "SUMMARY": summary,
        "METRICS": metrics,
        "SNAPSHOT": snapshot,
        "MERGED_COUNT": str(merged_count),
        "MERGED_HIGHLIGHTS": render_pr_cards(merged_sorted[:6], local_tz, "No merged pull requests were found in this reporting window."),
        "MERGED_PRS": render_pr_cards(grouped_prs["merged"], local_tz, "No merged pull requests were found in this reporting window."),
        "OPEN_COUNT": str(open_count),
        "OPEN_PRS": render_pr_cards(grouped_prs["open"], local_tz, "No active open pull requests were found in this reporting window."),
        "DRAFT_COUNT": str(draft_count),
        "DRAFT_PRS": render_pr_cards(grouped_prs["draft"], local_tz, "No active draft pull requests were found in this reporting window."),
        "REVIEW_COUNT": f"{review_count:,}",
        "REVIEWED_PR_COUNT": f"{reviewed_pr_count:,}",
        "REVIEWS": render_reviews(reviews, local_tz),
        "ISSUES": render_issues(issues, data["login"], data["period"]["startUtcParsed"], data["period"]["endUtcParsed"], local_tz),
        "COMMITS": render_commits(commits, local_tz),
        "OTHER": render_other(discussions, answers, events, local_tz),
        "COVERAGE": render_warnings(data.get("warnings") or [], data.get("sources") or {}, restricted),
    }
    for key, value in replacements.items():
        template = template.replace("{{" + key + "}}", str(value))
    return template


def serialize_data(data: dict[str, Any]) -> dict[str, Any]:
    cleaned = dict(data)
    cleaned["period"] = dict(cleaned["period"])
    cleaned["period"].pop("startUtcParsed", None)
    cleaned["period"].pop("endUtcParsed", None)
    return cleaned


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", help="Start date or ISO datetime; defaults to seven days before end")
    parser.add_argument("--end", help="End date or ISO datetime; defaults to now")
    parser.add_argument("--days", type=int, default=7, help="Rolling window when --start is omitted (default: 7)")
    parser.add_argument("--login", help="GitHub login; defaults to the active gh account")
    parser.add_argument("--display-name", help="Name used in the report narrative (default: your GitHub profile name)")
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--repo", help="GitHub repository scope as OWNER/NAME (default: the current repository)")
    scope.add_argument("--current-repo", action="store_true", help="Use the current GitHub repository (the default)")
    scope.add_argument("--all-repos", action="store_true", help="Collect across all accessible repositories")
    parser.add_argument("--output", help="Absolute or relative output HTML path")
    parser.add_argument("--data-output", help="Optional JSON evidence output path")
    parser.add_argument("--max-results", type=int, default=SEARCH_LIMIT_DEFAULT, help="Per-search result cap")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    if args.days <= 0 or args.max_results <= 0:
        parser.error("--days and --max-results must be positive")

    if not shutil_which("gh"):
        print("GitHub CLI is required. Install gh, then run: gh auth login", file=sys.stderr)
        return 2
    auth = run(["gh", "auth", "status"], check=False)
    if auth.returncode != 0:
        print("GitHub CLI is not authenticated. Run: gh auth login", file=sys.stderr)
        return 2

    local_now = datetime.now().astimezone()
    local_tz = local_now.tzinfo
    end = parse_boundary(args.end, is_end=True, local_tz=local_tz) or local_now
    start = parse_boundary(args.start, is_end=False, local_tz=local_tz) or (end - timedelta(days=args.days))
    if start >= end:
        parser.error("start must be before end")

    profile = run_json(["gh", "api", "user"]) or {}
    login = args.login or profile.get("login")
    if not login:
        print("Could not determine a GitHub login. Pass --login explicitly.", file=sys.stderr)
        return 2
    if args.login and args.login.lower() != str(profile.get("login") or "").lower():
        profile = run_json(["gh", "api", f"users/{args.login}"]) or {"login": args.login}

    only_repo = None if args.all_repos else (args.repo or current_repo_name())
    if not args.all_repos and not only_repo:
        print("Could not resolve the current repository's GitHub origin. Pass --repo OWNER/NAME or --all-repos.", file=sys.stderr)
        return 2

    collector = Collector(login, start, end, args.max_results, only_repo, args.quiet)
    prs, reviews = collector.safe("Pull requests and reviews", collector.collect_prs_and_reviews, ([], []))
    commits = collector.safe("Authored commits", collector.collect_commits, [])
    issues = collector.safe("Issues and comments", collector.collect_issues, [])
    discussion_source = f"GitHub discussions ({only_repo})" if only_repo else "GitHub contribution graph and discussions"
    contributions = collector.safe(discussion_source, collector.collect_contributions, {})
    events = collector.safe("Other public GitHub events", collector.collect_other_events, [])

    start_utc = start.astimezone(timezone.utc)
    end_utc = end.astimezone(timezone.utc)
    generated = datetime.now().astimezone()
    slug = (only_repo or "all-github").split("/")[-1]
    output = Path(args.output).expanduser() if args.output else Path.home() / "Documents" / "GitHub Weekly Reports" / f"{slug}-weekly-{end.date().isoformat()}.html"
    if not output.is_absolute():
        output = (Path.cwd() / output).resolve()
    data_output = Path(args.data_output).expanduser() if args.data_output else output.with_suffix(".json")
    if not data_output.is_absolute():
        data_output = (Path.cwd() / data_output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    data_output.parent.mkdir(parents=True, exist_ok=True)

    data: dict[str, Any] = {
        "schemaVersion": 1,
        "login": login,
        "displayName": args.display_name,
        "profile": {key: profile.get(key) for key in ("login", "name", "avatar_url", "html_url")},
        "period": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "startUtc": start_utc.isoformat(),
            "endUtc": end_utc.isoformat(),
            "startUtcParsed": start_utc,
            "endUtcParsed": end_utc,
            "display": f"{start.strftime('%b %-d, %Y · %-I:%M %p')} — {end.strftime('%b %-d, %Y · %-I:%M %p %Z')}",
        },
        "generatedAt": generated.isoformat(),
        "generatedDisplay": generated.strftime("%b %-d, %Y · %-I:%M %p %Z"),
        "scope": only_repo or "all accessible GitHub repositories",
        "pullRequests": prs,
        "reviews": reviews,
        "commits": commits,
        "issues": issues,
        "contributions": contributions,
        "otherEvents": events,
        "sources": collector.sources,
        "warnings": collector.warnings,
    }
    profile_for_render = data["profile"]
    profile_for_render["url"] = profile_for_render.pop("html_url", None)
    profile_for_render["avatarUrl"] = profile_for_render.pop("avatar_url", None)

    template_path = Path(__file__).resolve().parent.parent / "assets" / "report-template.html"
    template = template_path.read_text(encoding="utf-8")
    report = build_report(data, template, local_tz)
    output.write_text(report, encoding="utf-8")
    data_output.write_text(json.dumps(serialize_data(data), indent=2, ensure_ascii=False), encoding="utf-8")

    print(str(output))
    print(str(data_output))
    return 0


def shutil_which(name: str) -> str | None:
    for directory in os.environ.get("PATH", "").split(os.pathsep):
        candidate = Path(directory) / name
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


if __name__ == "__main__":
    raise SystemExit(main())
