---
name: consult-codex
description: Ask OpenAI Codex for an independent second opinion on this project's work — a reviewer that reads the repository cold in a transient clone, checks claims against live AWS through a read-only server bound to this project's own account, and argues with you (the author) for up to three rounds. Agreement becomes a Proposed Work table for the operator; nothing here ever writes progress.json. Invoke when asked for a second opinion, a review of the current task or a phase, or "what does Codex think"; also when a task's verify step reads as prose that nothing checked.
---

# consult-codex — a second reader with the same reach

You are the **author**. Codex is the **reviewer**. The operator is the only one who can turn what
you agree on into tracked work. The runner `consult.sh` beside this file does every mechanical
step; you do the thinking between rounds.

## What this is for

Every project here was built by Claude Code and is checked by Claude Code. This skill gives the
project a reader that did not write it, that has the same infrastructure reach you have (the AWS
account this project's Claude uses, read-only), and that must show its evidence. The design and
its dry run are in `syndicate-playbooks-examples`: `docs/consult-loop.md` and the first cycle in
that repo's `consult_notes.md`.

<!-- procedure:begin -->
## Procedure

**0. Preconditions you can see before starting.** The working tree is clean and committed
(`git status` empty); this machine has run `bash .claude/skills/consult-codex/prepare-host.sh --apply`
once — the settings change that belongs to the host, made by the host's own session from the
distributed copy, exactly as `/syndicate-connect` does for the ingest route. If either is false,
`open` will refuse with a named code and record the refusal — that is correct, not a failure to
work around.

**1. Open.** Pick the target — `task:<id>` (default: the current task), `phase:<key>`,
`file:<path,…>`, or `commit:<range>` — and run:

```bash
bash .claude/skills/consult-codex/consult.sh open task:<id>
```

It runs preflight (Codex present and logged in, host prepared, no shadowing personal skill, clean
checkout, fetch + fast-forward, `progress-check`, `.claude/` present, no Codex roots in the tree,
AWS binding by command with exactly one candidate or `no-infra`), clones the checkout to
`~/.cache/consult/<project>/clone` with no remotes and the commit guard re-armed, proves the
reviewer's AWS identity equals the declared account, extracts the claims from the target, and
appends the opening record to `consult_notes.md`. A refusal writes opening + closing
`not-reviewed:<code>` records, commits and pushes the log, and exits 3. Do not retry a refusal;
report it.

**2. Round 1.** `consult.sh review`. The reviewer reads the clone with no transcript of your
session, checks the claims, and ends with a `LEDGER:` block marking each claim examined /
unavailable / skipped. Its output is appended to the log after a full posture check of both
trees; a breach is recorded as a finding against the reviewer, never hidden.

**3. Respond.** Read the round in `consult_notes.md`. **Check the reviewer's citations against
the real files before you answer** — a refutation built on an unverified claim is worse than
none. Write your response to a file: what you accept and how it changes, what you narrow, what
you reject and why. Then `consult.sh respond <file>` — it appends your entry and runs the next
reviewer round on the same Codex thread. At most three reviewer rounds.

**4. Agreement → the table.** When the reviewer's remaining points are closed, ask it (in your
last response) to produce the `/add-work` Step 5 *Proposed Work* table — at most 7 rows per
batch, each a single deliverable under 30 minutes with an observable verify. Check the sizing
yourself; the reviewer will label multi-session work `small` until pushed.

**5. Present to the operator.** This is the only checkpoint. Show the table and ask: *add it?*
Two agents agreeing is a discussion; only the operator's explicit statement authorizes tracked
work (`/add-work` § Authorization Boundaries).

**6. Close.** One of five outcomes, always recorded:
- operator said add it → run `/add-work` yourself (its commit may include `consult_notes.md`),
  then `consult.sh close agreed-applied <result-sha>` — the reviewer rechecks in a fresh clone at
  that SHA, and the closing record names it;
- nobody present to approve → `consult.sh close agreed-proposed` — the table stays in the log,
  and `/open-work` renders it as open;
- nothing to change and the ledger proves claims were examined → `close agreed-nothing`
  (refused and recorded as `not-reviewed:NO-PROOF` if the ledger is empty);
- disagreement survived the cap → `close disputed`, both positions already in the log;
- preflight refused → already closed as `not-reviewed:<code>`.

`close` commits `consult_notes.md` alone, fast-forward pushes it (recording
`LOG-COMMITTED-NOT-PUSHED` if the push fails), and destroys the clone. Nothing in this procedure
writes `progress.json`; only your own `/add-work`, on the operator's word, does.
<!-- procedure:end -->

## When a record cannot be committed — the publication transaction

`close` and a refusal both end by committing `consult_notes.md` alone. If that **commit** fails —
a pre-commit hook that refuses, an unset git identity — the record is **rolled back out of the log
and out of the git index**, the runner exits **2**, and it says so. Nothing uncommitted is left in
the checkout, because an uncommitted record is a record that can never be published (its cycle's
state is gone) and that makes the next cycle in that project refuse `DIRTY-CHECKOUT`.

What survives a rolled-back publication is what you need to retry it: the state directory and the
clone under `~/.cache/consult/<project>/`. **A close retries with the same `close` command; a
refusal retries by re-running the same `open`** — a refusal never sets the `opened` marker, so
there is no cycle for `close` to close. Both are idempotent: retrying after the commit problem is
fixed produces exactly one record, not two.

A failed **push** is a different thing and is not rolled back: the commit landed, so the log is
safe locally, and the runner records `LOG-COMMITTED-NOT-PUSHED` as its own commit and retries the
push once. Rejected alternative, for the record: leaving the record in the worktree for a later
invocation to commit. It would make an uncommitted record a legitimate state, collide with the
`DIRTY-CHECKOUT` preflight, and let one cycle's record be committed under another cycle's message.

## Where the host predicate lives

"Is this host prepared?" has **one** definition and it is in `prepare-host.sh`, callable on its own
as `prepare-host.sh --check-config`: both Codex config keys top-level, `project_doc_fallback_filenames`
exactly `["CLAUDE.md"]`, `project_doc_max_bytes` an integer at least 262144, and no copy of either
key nested inside a `[projects]` table. It reads, never writes, and needs no Codex. `consult.sh`
calls it and quotes its message into `HOST-NOT-PREPARED`; the behavioural checks that spawn Codex
(B and C) and the host-entry digest check (D) stay in the preparation run.

## What the reviewer may never do — and what happens if it does

Write into either tree, touch `progress.json`, commit, or push. Under bypass mode nothing
*prevents* this; the clone has no remote and its own object store, so a breach cannot reach the
real checkout or origin, and `consult-posture.sh verify` fingerprints both trees — refs, index,
worktree, ignored files, stash, and the log itself — after every round. A breach is appended to
the log as a finding against the reviewer.

## Files beside this one

| file | role |
|---|---|
| `consult.sh` | the runner: open / review / respond / close / status |
| `prepare-host.sh` | **once per machine**: prepends the two Codex config lines, installs the Codex-side entry `syndicate-consult-claude` into `$CODEX_HOME/skills/` with this copy's procedure digest embedded, and proves all of it behaviourally. The settings change happens on the host, from the distributed copy — never pushed to a host by hand |
| `host-entry.SKILL.md` | the template `prepare-host.sh` renders into `$CODEX_HOME/skills/syndicate-consult-claude/SKILL.md` — Entry A |
| `codex-here` | launches Codex with this project's AWS server injected read-only, bound from `~/.claude.json` by command; strips the shell of credentials |
| `consult-posture.sh` | clone / snapshot / verify / append / destroy — the 8-step posture sequence |
| `consult-log.py` | the log grammar: `validate` a log, `ledger` a round's claim coverage |
| `reviewer-prompt.md` | the round-1 prompt template |

## Refusal codes

| code | raised by | what it means, and what to do |
|---|---|---|
| `NO-TARGET` | `open` | no target was named: give `task:<id>`, `phase:<key>`, `file:<paths>` or `commit:<range>` |
| `NO-CODEX` | `open` | `codex` is not on PATH; over a non-interactive ssh, run under `bash -lc` |
| `NOT-LOGGED-IN` | `open` | Codex is not logged in on this host, and its config loads: log it in |
| `HOST-NOT-PREPARED` | `open`, `codex-here`, the Codex adapter | the host-config predicate fails, the host entry is absent, or Codex cannot be found: `prepare-host.sh --apply` on this host |
| `PROCEDURE-DRIFT` | `open`, the host entry, the Codex adapter | the host entry was installed against another version of the procedure block than this project carries: `prepare-host.sh --apply` on this host when this project's copy is the newer one, `/distribute-defaults` when it is the older |
| `SHADOWED` | `open` | a personal `~/.claude/skills/consult-codex/` would shadow the distributed skill: retire it |
| `NOT-ORIGIN-LATEST` | `open` | origin is unreachable, there is no upstream, the branch has diverged, or a clean checkout cannot fast-forward |
| `NOT-REVIEWABLE:progress-json` | `open` | `progress-check` refuses this project's `progress.json` |
| `NOT-REVIEWABLE:no-claude-dir` | `open` | `.claude/commands/` or `.claude/skills/` is missing |
| `NOT-REVIEWABLE:codex-roots-present` | `open` | the checkout holds a `.codex/`; Codex configuration belongs to the host |
| `ACCOUNT-AMBIGUOUS` | `codex-here` | more than one AWS server could be this project's binding: declare one primary account |
| `ACCOUNT-NOT-BOUND` | `codex-here` | an account is declared and no profile on this host resolves to it, or there is no `aws` CLI to scan with, or the pinned image is absent |
| `BINDING-REFUSED` | `open` | `codex-here` refused or crashed without a code the runner can read: an option it does not know, a `~/.claude.json` it cannot parse, a profile scan that timed out. The record quotes its stderr, which names the cause; one with no clear cause is a defect in `codex-here`, to report through `/syndicate-consult-loop` |
| `NOT-REVIEWABLE` | `open` | the target could not be read at all; the record quotes the error |
| `NOT-REVIEWABLE:NO-REVIEWABLE-CLAIMS` | `open` | the target yields no claims; the record names the near misses |
| `CLONE-FAILED` | `open` | the transient clone could not be made |
| `POSTURE-BREACH` | `open`, `close` | the clone, or a path the skill owns, changed: during the identity check this refuses the cycle; in a round it leaves no `agreed-*` outcome possible |
| `REVIEWER-UNAVAILABLE` | `open` | Codex could not complete a single run, so nothing is known about this project (below) |
| `AWS-SERVER-UNAVAILABLE` | `open` | the reviewer's AWS reach never started, so nothing is known about the account (below) |
| `ACCOUNT-MISMATCH` | `open` | the server answered with a different account, which is a verdict and is never retried (below) |
| `CYCLE-ALREADY-OPEN` | `open` | the log already holds an open cycle: let its session finish, or `consult.sh abandon` if that session is gone (below) |
| `NO-REVIEW` | `close` | no reviewer round completed, so the `agreed-*` outcome asked for is recorded as this |
| `REVIEWER-FAILED` | `review`, `close`, the host entry | a reviewer round crashed, timed out or said nothing. `review` then names this and `disputed` as the only closes, and the host entry closes with it when its reviewer never completed a round. `close` puts it in place of an `agreed-*` outcome only when another round did complete; with none it records `NO-REVIEW`. The host entry says `close` enforces this code when no round completed, which is wrong: `close` accepts it when asked and enforces only `NO-REVIEW`. The entry is corrected when every host is next re-prepared |
| `LEDGER-INVALID` | `close` | round 1's ledger does not account for the claims |
| `NO-PROOF` | `close` | `agreed-nothing` without a valid ledger that examined a claim, or without a matched identity |
| `ABANDONED` | `abandon` | closes a cycle whose session is gone (below) |

A refusal of `open` writes an opening record and a closing `not-reviewed:<CODE>` record, commits
and pushes them, and exits 3. A `close` or `abandon` code is the outcome of the cycle's closing
record. Three stops write nothing: `CYCLE-ALREADY-OPEN`, and an entry that stops before `consult.sh`
runs, which is the host entry's own digest check (`PROCEDURE-DRIFT`) or the Codex adapter
`consult-claude` finding no host entry (`HOST-NOT-PREPARED`). Absence and ignorance are different,
and both look empty. The table is read against the code (`consult.sh`, `codex-here`, the host entry)
by R41 of `scripts/test-consult-codex.sh` in syndicate-playbooks-examples, which fails when it misses
a code or names one that nothing raises.

**`AWS-SERVER-UNAVAILABLE` vs `ACCOUNT-MISMATCH` is that rule applied to the preflight**, and it
was missing until 2026-09-03. `ACCOUNT-MISMATCH` now means one thing only: the server answered
with a DIFFERENT account, so the binding is wrong. That is a verdict and is never retried.
`AWS-SERVER-UNAVAILABLE` means the reviewer's AWS reach never started — Codex answers prose and
exits 0 — so NOTHING is known about the account; the identity probe is retried three times before
it is believed. Measured on the box that day, with the binding correct and STS-proved, 2 of 6
probes lost the MCP server to a startup race. Every one of them was reported as an account
mismatch, which is why two separate sessions went hunting a binding defect that did not exist.
**`prepare-host.sh` cannot repair either of them** — it writes two Codex config keys and the host
entry, and nothing whatever about AWS. The refusal record now carries the binding it judges, and
the evidence is kept under `~/.cache/consult/<project>/failed/<cycle>/`.

**`REVIEWER-UNAVAILABLE` completes the same distinction one layer up.** If Codex cannot complete a
single run, that says nothing about this project, its binding, or its AWS reach — the reviewer never
ran. The discriminator is the exit code: a missing MCP server still completes a session and answers
in prose (**exit 0**), while a Codex that cannot reach its own backend **exits non-zero and writes no
output file at all**. Measured 2026-09-03 against a live OpenAI incident (*"Elevated errors across
ChatGPT and Codex"*): exit 1, no `-o` file, on two hosts and two CLI versions with a valid token.
Without the distinction that outage refused `AWS-SERVER-UNAVAILABLE` and sent the operator to debug
an MCP server that was never the problem. A 404 on `chatgpt.com/backend-api/codex/...` is upstream —
check <https://status.openai.com>; nothing on the host can fix it, and downgrading the CLI does not
(the same 404 reproduced on 0.151.0 and 0.153.0).

**`DIRTY-CHECKOUT` was removed on 2026-08-26 and must not come back.** It refused on any modified
file — but `consult_notes.md`, this skill's own log, lives in the tree it demanded be clean, so a
cycle in flight guaranteed a dirty tree and blocked every later cycle in the project. The skill
blocked itself, and unrelated uncommitted work blocked it too. A review now reads a clone of HEAD
and *says so*: the opening record carries `- tree: reviewing HEAD; N uncommitted file(s) are NOT in
the clone (in scope: …)`, and the reviewer's round-1 prompt repeats it so it cannot report as
missing something that is merely uncommitted.

**`CYCLE-ALREADY-OPEN` (exit 3, nothing written) is not recorded, and that is deliberate.**
Recording it would need an append the grammar itself refuses — a log may hold one open cycle — so
the operator would get `REFUSAL-NOT-RECORDED`, a defect message for a correct state.

## What the posture check refuses, and what it only records

The reviewer runs in a **clone**; the check compares fingerprints of that clone and of your real
checkout before and after each round. They are not treated alike, and the difference is the rule:

- **The clone is the skill's.** Nothing else on the machine touches it and the reviewer's process
  runs inside it, so any change there is the reviewer's. **Hard refusal.**
- **Your checkout is not the skill's.** You, other sessions, builds and CI write there, so a change
  proves nothing about the reviewer. It is **recorded, naming the paths that moved**, in the round
  record and the closing record — and the cycle continues.
- **Two exceptions inside your checkout, because the skill depends on them:** `consult_notes.md`
  (the skill writes it; its claim is "old bytes + record") and `.git/hooks/` + `.claude/hooks/`
  (the skill's own commit executes them). Those refuse.

Until 2026-08-26 the whole real tree was a tripwire, so a concurrent commit, a build writing ignored
files, or another session's `git fetch` killed the round — *after* the reviewer had been paid for,
losing that round from the log. If a review ever reports that your checkout moved, that is
information about the session you were running beside it, not a fault.

## Recovering a cycle whose session is gone

```bash
bash .claude/skills/consult-codex/consult.sh abandon [<cycle-id>] [<why>]
```

Closes the log's one open cycle with `not-reviewed:ABANDONED`, through the same validated
publication transaction as every other record, and clears the owning session's state and clone so a
late `close` cannot append a second closing record.

**Why this exists.** `close` requires `$ST/opened`, which belongs to the session that opened the
cycle. When that session is gone the cycle can never be closed — and because a log may hold only one
open cycle, *every later consult in that project is refused forever*. Before `abandon`, the only
route back was hand-editing an append-only, guard-protected log; in practice the project simply
stopped being reviewable. The rounds count and opening SHA in the record are reconstructed from the
log itself, since the state that held them is exactly what is missing.

Use it when the owning session is genuinely gone. If it is still running, let it finish — the
`CYCLE-ALREADY-OPEN` refusal changed nothing.
