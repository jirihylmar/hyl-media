---
name: refs-check
description: List the open pull requests and the branches not merged into a base branch, in this repository and in every member its progress.json relations block declares, and say which are bound to open work by ref and SHA. A member that cannot be read is NOT CHECKED, never clean. Run by /start-session Step 2.9 and, as the close gate, by /update-progress Step 9b; invoke it when asked what waits in this repository or its members, before merging or deleting a branch, and after binding or processing one.
---

# refs-check

A manager reads what waits in its members (`PROJECT_CHARTER.md` § 14). This skill is how: one
read-only pass over this repository and every repository its `relations` block declares, by plain
git, with every network call bounded.

```bash
python3 .claude/skills/refs-check/refs_check.py                 # from the project root
python3 .claude/skills/refs-check/refs_check.py --timeout 60    # a slow link: 60 s per ls-remote
```

**Why it exists.** On 2026-11-02 a managing project missed an open pull request in its member
repository (booking-classic PR #1, the central-access kit delivery) and an unmerged branch
(`web-cutover-links`) for a day. Nothing in the defaults read a member's refs. The operator, in that
project's session: *"you are responsible for managing the family, now booking and web members. with
some branch left, its the same issue"*.

## Exit codes

| Exit | Meaning |
|---|---|
| `0` | every repository was read and no item is unbound |
| `3` | at least one item is **UNBOUND**. It wins over 4; the NOT CHECKED ones are still named |
| `4` | nothing is unbound, but a repository, or its pull-request dimension, is **NOT CHECKED** |
| `2` | `progress.json` is missing or unreadable, so no binding can be decided |
| other | it did not run to the end (killed by a signal, no `python3`): the state is **unknown** |

## What it reads

- **The repositories.** This one (`.` in a binding) and every member of `relations.members`, deduplicated
  by normalised origin. No relation word is judged: `governed`, `nested`, `metadata-governed` and
  any other word are read alike. No block at all reads this repository only and says
  `members: none declared`. A malformed block or an unusable member is NOT CHECKED, with the reason.
- **Where each member is read from**, in this order: its declared `path`, when that is a clone of
  the declared origin on this host; a sibling checkout of the same origin next to this project; the
  declared origin itself. A local clone lends its objects and its own transport settings (ssh
  command, credential helper, url rewrites), so a deploy key a host gives one clone still works.
- **The refs.** One `git ls-remote --symref` per repository: the HEAD branch, `refs/heads/*`,
  `refs/pull/<n>/head` (GitHub, Gitea) and `refs/merge-requests/<n>/head` (GitLab). A host that
  advertises neither is read for branches only, and its pull-request dimension is NOT CHECKED,
  unless it is a GitHub or GitLab host, where advertising none means there are none.
- **The base branches.** The remote HEAD branch, always, plus any branch named in `base_branches`:
  at the root of `progress.json` for this repository, on a member's `relations` entry for that
  member. A base branch is an integration or deployment target (`main`, `production`, `gh-pages`),
  never work waiting to be merged. A declared base that is not on the remote is a NOTE.
- **Ancestry.** A ref whose commit is an ancestor of ANY base branch is handled and not listed. To
  decide it, one treeless fetch (`--filter=tree:0`, commits only, about a megabyte) goes into a
  temporary bare repository, and only when a commit is not already in the local clone. The
  temporary repository is removed on every exit it can catch.

**Bounded.** Each `ls-remote` gets `--timeout` seconds (default 30, or `REFS_CHECK_TIMEOUT`), each
fetch four times that. Every git call runs in its own process group and the whole group is killed
when its bound fires, so no ssh child is left. Repositories are read eight at a time. No prompt can
open: `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`, and ssh in batch mode unless this host
configures its own ssh command. Credentials in a URL are never printed.

**Plain git only.** No hosting API, no CLI, no token beyond what git already uses: the estate's
hosts have git, and many have nothing else.

## What each line means

| Line | Meaning |
|---|---|
| `UNBOUND` | Not merged into any base, and no task names it at this SHA. **The finding.** |
| `BOUND` | A **non-terminal** task's `git_refs` names it at this SHA: open work owns it. |
| `RECORDED` | A **terminal** task's `git_refs` names it at this SHA: its disposition is on record. |
| `NOT CHECKED` | The repository, or its pull requests, could not be read. **Unknown, never clean.** |
| `NOTE` | Something true about the read that is no finding (a declared base not on the remote). |
| `IGNORED` | A `git_refs` entry that cannot bind anything, with the task and why. Its item stays UNBOUND. |
| `n/a` | Examined, nothing to list: no remote, or no git work tree. |

A merged branch, a merged pull-request head and a deleted ref are not listed at all.

**Plain git cannot see whether a pull request is open.** GitHub keeps `refs/pull/<n>/head` for ever,
and a pull request closed unmerged or squash-merged is never an ancestor of the base. So the record
decides, not the host: such a ref is recorded once, in a terminal task, and stays quiet until it
moves. That is what `RECORDED` is for.

## Binding an item: `git_refs`

A task field, allowed on any task. The check prints the entry for every UNBOUND item, ready to paste:

```json
"git_refs": [
  {"repo": "github.com/master-goldsport/booking-classic", "ref": "refs/pull/1/head", "sha": "2929273a8c4a"},
  {"repo": ".", "ref": "refs/heads/wip", "sha": "00a8eeed32fe"}
]
```

- `repo` is `.` for this repository. For a member it is its declared origin, in any spelling: both
  sides are normalised (host and path lower-cased; scheme, `user@`, a trailing `.git` and `/`
  dropped; the scp form folded), so the binding holds on every host whatever URL form a clone uses.
  A member declared by `path` alone is named by that path.
- `ref` is the full ref, exactly as the check lists it.
- `sha` is 7 to 40 hex characters and must be a prefix of the ref's **current** tip. A binding at an
  older SHA does not bind: new commits are unseen work. The line then says
  `task X.Y names it at <old sha>`, so rebinding is one field.
- Extra keys (`note`) are allowed and ignored.

In a **non-terminal** task the entry binds: the task is the work that will process the item. In a
**terminal** task it records: closed unmerged, squash-merged, or kept on purpose.

`progress-check` warns, and never refuses, on a malformed entry and on a malformed `base_branches`,
and warns when `git_refs` changes on a task that was already terminal. That is how a record added to
a closed task after the fact shows at review.

## What the session does with an UNBOUND item

It is this session's work, not a question for the operator. Either:

1. **Bind it.** Paste its entry into the non-terminal task that will process it, or into a new task
   numbered by `/update-progress` *When New Task Discovered Mid-Work*, with `authored_by` and
   `assigned_to`.
2. **Process it.** Merge it (a mechanical merge is not a checkpoint); delete a branch that is
   already merged; or record its disposition in a terminal task with `git_refs`: closed, squash-merged,
   or kept.

**Deleting unmerged work is irreversible.** Never delete an unmerged branch to make the list shorter:
record its SHA in a terminal task, or ask the operator.

At session start (`/start-session` Step 2.9) the findings are reported and dealt with before other
work. At session close (`/update-progress` Step 9b) exit `3` refuses the close until every item is
bound or processed. NOT CHECKED is reported, loudly, and does not block: an unreachable remote (a
member host behind a VPN, an outside machine offline, a credential this host lacks) is outside the
session's control, while an UNBOUND item is always one paste away.

## Limits

- A member that keeps its own `progress.json` binds its refs there, and its manager binds them again
  in its own record. The manager is the one responsible (the operator, 2026-11-03).
- A self-hosted server that advertises neither kind of pull ref leaves the pull-request dimension
  NOT CHECKED at every run.
- A member readable only through a credential helper that its local clone does not carry is NOT
  CHECKED.

Pinned by `scripts/test-refs-check.sh` in the central repo.
