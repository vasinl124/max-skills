# GitHub PR comment model & raw APIs

Read this when a script hits an edge case and you need to do something by hand,
or when you need to understand why a comment isn't showing up where you expect.

## The four comment surfaces

GitHub stores PR feedback in four distinct places. This is why "fetch all the
comments" isn't one API call:

1. **Review comments (inline).** Anchored to a file + line in the diff. Grouped
   into **review threads**. A thread carries `isResolved` and `isOutdated`.
   Threads exist *only* in the GraphQL API — REST can list the comments but not
   their resolve state or thread grouping.
2. **Reviews.** A review is the wrapper a person submits: a `state`
   (`APPROVED` / `CHANGES_REQUESTED` / `COMMENTED`) plus an optional `body`.
   The body is where "requesting changes because X" rationale usually lives. It
   is not attached to any line and cannot be "resolved."
3. **Issue comments (conversation tab).** Top-level PR comments. No line, no
   thread, not resolvable.
4. **Commit comments.** Comments on a specific commit, not the PR. Rare; usually
   safe to ignore for review-feedback workflows.

`fetch_pr_comments.py` returns 1–3. Reach for #4 only if a user points at one.

## Key identifiers

- **`thread_id`** — GraphQL node id like `PRRT_kw...`. Needed to resolve a thread.
- **`root_comment_id`** — the `databaseId` (integer) of the first comment in a
  thread. Needed to reply via REST. *Not* the same as the node id.
- A review thread is replied to by posting a reply to its **root** comment; all
  comments in the thread share that root.

## Doing it by hand

List inline review comments (REST, no resolve state):
```bash
gh api repos/{owner}/{repo}/pulls/{pr}/comments --paginate
```

Reply to a thread (REST):
```bash
gh api --method POST \
  repos/{owner}/{repo}/pulls/{pr}/comments/{root_comment_id}/replies \
  -f body='…'
```

Resolve / unresolve a thread (GraphQL only):
```bash
gh api graphql -f query='
  mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread{ isResolved } } }
' -f id='PRRT_kw…'
# unresolve: same shape with unresolveReviewThread
```

Fetch review threads with state (GraphQL):
```bash
gh api graphql -f query='
  query($owner:String!,$name:String!,$number:Int!){
    repository(owner:$owner,name:$name){
      pullRequest(number:$number){
        reviewThreads(first:50){
          nodes{ id isResolved isOutdated
            comments(first:100){ nodes{ databaseId author{login} body path line diffHunk } } }
        }
      }
    }
  }' -f owner={owner} -f name={name} -F number={pr}
```

Top-level conversation comment:
```bash
gh pr comment {pr} --body-file reply.md
```

## Suggestion blocks

A reviewer can leave a ` ```suggestion ` block. GitHub can commit those directly
via the UI, but applying the change as a normal edit and then replying "applied
in `<sha>`" is equivalent and works fine from the CLI. The committable-suggestion
REST endpoint is fiddly; prefer a plain edit unless the user specifically wants
the suggestion-commit attribution.

## Gotchas

- **Author can be null.** Deleted accounts show as `null`; the script maps these
  to `ghost`.
- **`line` is null on outdated comments.** The script falls back to
  `originalLine`. The concern can still be valid even when the line is gone.
- **Pagination.** Threads are paginated (the script follows `pageInfo`). Reviews
  and issue comments are capped at 100 here — enough for almost any PR, but if a
  PR somehow exceeds that, page them the same way.
- **Scopes.** Posting replies and resolving needs a token with `repo` scope; a
  read-only token will fetch fine but fail to write.
