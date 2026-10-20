#!/usr/bin/env python3
"""Fetch and consolidate EVERY comment on a GitHub PR into one JSON blob.

GitHub spreads PR feedback across four surfaces that no single `gh` command
returns together. This script gathers all of them in one shot:

  1. Inline review comments, grouped into review *threads* with their
     resolve/outdated state          -> GraphQL reviewThreads
  2. Review summaries (the body of an APPROVED / CHANGES_REQUESTED /
     COMMENTED review)               -> GraphQL reviews
  3. Top-level conversation comments -> GraphQL issue comments

For each thread it also surfaces the two ids you need to act on it later:
  - root_comment_id : databaseId of the first comment -> REST reply endpoint
  - thread_id       : GraphQL node id                 -> resolveReviewThread

Usage:
  fetch_pr_comments.py [PR]     # PR = number, full URL, or omitted (current branch)

Output:
  JSON to stdout, a one-line human summary to stderr.
"""
import json
import re
import subprocess
import sys

QUERY = """
query($owner:String!,$name:String!,$number:Int!,$cursor:String){
  viewer{login}
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      title url state
      reviews(first:100){nodes{author{login} state body url createdAt}}
      comments(first:100){nodes{databaseId author{login} body url createdAt}}
      reviewThreads(first:50, after:$cursor){
        pageInfo{hasNextPage endCursor}
        nodes{
          id isResolved isOutdated
          comments(first:100){nodes{databaseId author{login} body path line originalLine diffHunk url createdAt}}
        }
      }
    }
  }
}
"""


def gh(*args):
    r = subprocess.run(["gh", *args], capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        raise SystemExit(f"`gh {' '.join(args[:2])} ...` failed")
    return r.stdout


def resolve_target(arg):
    """Return (owner, repo, number) from a URL, a bare number, or the current branch."""
    if arg:
        m = re.search(r"github\.com/([^/]+)/([^/]+)/pull/(\d+)", arg)
        if m:
            return m.group(1), m.group(2), int(m.group(3))
    nwo = gh("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner").strip()
    owner, repo = nwo.split("/", 1)
    if arg and arg.isdigit():
        return owner, repo, int(arg)
    num = gh("pr", "view", "--json", "number", "-q", ".number").strip()
    if not num:
        raise SystemExit("No PR found for the current branch. Pass a PR number or URL.")
    return owner, repo, int(num)


def login(node):
    a = node.get("author")
    return a["login"] if a else "ghost"


def fetch(owner, repo, number):
    threads, cursor, base = [], None, None
    while True:
        args = ["api", "graphql", "-f", f"query={QUERY}",
                "-f", f"owner={owner}", "-f", f"name={repo}", "-F", f"number={number}"]
        if cursor:
            args += ["-f", f"cursor={cursor}"]
        pr = json.loads(gh(*args))["data"]
        if pr["repository"]["pullRequest"] is None:
            raise SystemExit(f"PR #{number} not found in {owner}/{repo}")
        if base is None:
            base = {"viewer": pr["viewer"]["login"], "pr": pr["repository"]["pullRequest"]}
        rt = pr["repository"]["pullRequest"]["reviewThreads"]
        threads.extend(rt["nodes"])
        if rt["pageInfo"]["hasNextPage"]:
            cursor = rt["pageInfo"]["endCursor"]
        else:
            return base, threads


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    owner, repo, number = resolve_target(arg)
    base, threads = fetch(owner, repo, number)
    viewer, pr = base["viewer"], base["pr"]

    out_threads, actionable, resolved = [], 0, 0
    for t in threads:
        cnodes = t["comments"]["nodes"]
        if not cnodes:
            continue
        root = cnodes[0]
        if t["isResolved"]:
            resolved += 1
        comments = [{"id": c["databaseId"], "author": login(c),
                     "is_self": login(c) == viewer, "body": c["body"], "url": c["url"]}
                    for c in cnodes]
        if not t["isResolved"] and any(not c["is_self"] for c in comments):
            actionable += 1
        out_threads.append({
            "thread_id": t["id"],
            "is_resolved": t["isResolved"],
            "is_outdated": t["isOutdated"],
            "path": root.get("path"),
            "line": root.get("line") or root.get("originalLine"),
            "root_comment_id": root["databaseId"],
            "diff_hunk": root.get("diffHunk"),
            "url": root["url"],
            "comments": comments,
        })

    reviews = [{"author": login(r), "state": r["state"], "body": r["body"], "url": r["url"]}
               for r in pr["reviews"]["nodes"] if r["body"] and login(r) != viewer]
    issue_comments = [{"id": c["databaseId"], "author": login(c),
                       "is_self": login(c) == viewer, "body": c["body"], "url": c["url"]}
                      for c in pr["comments"]["nodes"]]

    result = {
        "pr": {"owner": owner, "repo": repo, "number": number,
               "title": pr["title"], "url": pr["url"], "state": pr["state"]},
        "viewer": viewer,
        "counts": {"total_threads": len(out_threads), "actionable_threads": actionable,
                   "resolved_threads": resolved, "review_summaries": len(reviews),
                   "issue_comments": len(issue_comments)},
        "threads": out_threads,
        "review_summaries": reviews,
        "issue_comments": issue_comments,
    }
    print(json.dumps(result, indent=2))
    c = result["counts"]
    sys.stderr.write(
        f"PR #{number} {owner}/{repo}: {c['actionable_threads']} actionable thread(s), "
        f"{c['resolved_threads']} already resolved, {c['review_summaries']} review summary(ies), "
        f"{c['issue_comments']} conversation comment(s).\n")


if __name__ == "__main__":
    main()
