#!/usr/bin/env python3
"""Reply to and/or resolve PR review threads — the outward-facing actions.

Replying and resolving post publicly and are awkward to undo, so they live in
one small, audited helper. Reply bodies are read from a file (--body-file) so
multi-line markdown never has to survive shell quoting.

Usage:
  respond.py reply         --repo O/R --pr N --comment-id ID --body-file F
  respond.py resolve       --thread-id THREAD_ID
  respond.py reply-resolve --repo O/R --pr N --comment-id ID --thread-id THREAD_ID --body-file F
  respond.py pr-comment    --pr N --body-file F        # top-level conversation comment

`--comment-id` is the thread's root_comment_id; `--thread-id` is its thread_id.
Both come straight from fetch_pr_comments.py.
"""
import argparse
import subprocess
import sys

RESOLVE_MUTATION = (
    "mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}"
)


def gh(*args):
    r = subprocess.run(["gh", *args], capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        raise SystemExit(f"`gh {' '.join(args[:2])} ...` failed")
    return r.stdout


def read_body(a):
    if getattr(a, "body_file", None):
        with open(a.body_file) as f:
            return f.read()
    if getattr(a, "body", None):
        return a.body
    raise SystemExit("Provide --body-file or --body")


def do_reply(a):
    gh("api", "--method", "POST",
       f"repos/{a.repo}/pulls/{a.pr}/comments/{a.comment_id}/replies",
       "-f", f"body={read_body(a)}")
    print(f"replied to comment {a.comment_id}")


def do_resolve(a):
    gh("api", "graphql", "-f", f"query={RESOLVE_MUTATION}", "-f", f"id={a.thread_id}")
    print(f"resolved thread {a.thread_id}")


def do_pr_comment(a):
    gh("pr", "comment", str(a.pr), "--body-file", a.body_file)
    print(f"posted conversation comment on PR #{a.pr}")


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("reply")
    r.add_argument("--repo", required=True); r.add_argument("--pr", required=True)
    r.add_argument("--comment-id", required=True)
    r.add_argument("--body-file"); r.add_argument("--body")
    r.set_defaults(fn=do_reply)

    rv = sub.add_parser("resolve")
    rv.add_argument("--thread-id", required=True)
    rv.set_defaults(fn=do_resolve)

    rr = sub.add_parser("reply-resolve")
    rr.add_argument("--repo", required=True); rr.add_argument("--pr", required=True)
    rr.add_argument("--comment-id", required=True); rr.add_argument("--thread-id", required=True)
    rr.add_argument("--body-file"); rr.add_argument("--body")
    rr.set_defaults(fn=lambda a: (do_reply(a), do_resolve(a)))

    pc = sub.add_parser("pr-comment")
    pc.add_argument("--pr", required=True); pc.add_argument("--body-file", required=True)
    pc.set_defaults(fn=do_pr_comment)

    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
