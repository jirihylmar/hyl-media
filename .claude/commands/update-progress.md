---
description: Mark tasks complete with ultra-conservative update rules (project)
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash
  - AskUserQuestion
  - mcp__aws-*__call_aws
---

<!--
  Centrally distributed by /distribute-defaults from syndicate-playbooks-examples.
  Project-specific additions go in .claude/local-overlays/<this-filename> as
  splice fragments (see /distribute-defaults for the overlay format).
  Direct edits to this file will be flagged on the next distribution.
-->

# Update Progress

Update progress tracking after completing tasks. Follow conservative rules strictly.

## Task boundary is not session boundary

Classify the invocation before doing anything:

| Mode | Trigger | Required outcome |
|---|---|---|
| `TASK_BOUNDARY` | A task completed while the current request still authorizes further ready work | Verify and record the task, reconcile phase state, commit and push its recoverable files, announce one concise transition, then **continue immediately with the next ready task in the same turn** |
| `SESSION_CLOSE` | The operator asked to stop/handoff; a declared approval checkpoint or genuine blocker requires a reply; context or safe authorized work is exhausted | Run the complete close procedure, including consolidation, knowledge delivery and Step 12 handoff, then yield |

Completion, a green test run, a progress update, a commit, a push, or a changed `current_task` does
not convert `TASK_BOUNDARY` into `SESSION_CLOSE`. A final-looking task summary is itself a yield: do
not emit one mid-run. And a yield of either kind is governed by `PROJECT_CHARTER.md`
section 11, *Unattended operations*, whenever tracked work depends on a future external state
change: Step 9a below is the command-backed check that must pass before the response goes out. The
contract is stated in the charter once, for both executors; this file only enforces it. The correct transition is:
`Task X.Y complete and pushed (docs: <files brought into line> | none needed). Continuing with X.Z: <plain-language outcome>.`
Then invoke tools for X.Z in the same response.

For `TASK_BOUNDARY`, run Steps 1, 2, 2a, 3, 3b, 3a when applicable, 4, 6–10, and the task-scoped
portion of Step 5. Defer Step 2b, Step 3c, the full session handoff in Step 5, Step 11, and Step 12
until an actual `SESSION_CLOSE`. This keeps publication reliable without making every commit pay the
cost—or adopt the stopping posture—of ending a session. The documentation steps are not that cost.
Step 12's *Documentation swept* table waits for the close, so at a task boundary Step 7's result is
recorded in the task's `verify_result` as `docs:` and named in the transition.

A progress update made any other way (inline, by a lane, by a subagent, by a step of a workflow
script) is this procedure in this mode, and in delegated work one executor records: you, or the
one step you name as its recorder; every other lane, subagent or workflow step returns its result,
evidence and changed paths and records nothing (`PROJECT_CHARTER.md` § 11, *Recording progress and
documents*). *You* is the executor that delegated the work, and the recorder records every
delegated task once the results are in.

The next ready task is an open task whose `depends_on` names no task that is still open;
`/open-work` marks the others in the current phase's table as `waits on <id>`.

## Ultra-Conservative Update Rules (CRITICAL)

### ALLOWED Modifications to progress.json:
- Change task `status` (pending → in_progress → complete)
- Add `completed_at` timestamp
- Add `started_at` timestamp
- Add entries to `artifacts` array
- Add or update `notes` on a task (any stage)
- Refine, combine, divide, reassign, re-scope or relocate any **non-terminal** task so planned,
  ongoing and deferred work accurately describe what is now required
- Add `verify_result` field
- Add NEW tasks with NEW IDs
- Update `current_task` pointer
- Update `last_updated` timestamp — a UTC instant, never a bare date (Step 3)
- Update `last_session_summary`
- **Set a phase's `status` — to `complete`, or from `pending` (or none) to `in_progress` together
  with its `started_at` — but ONLY as the reconciliation in Step 3b, never as a free edit.**
  This entry exists because its absence made Step 3a unreachable: 3a is triggered by a phase's
  status flipping to `complete`, and nothing was permitted to flip it. Measured on one host as an
  **83-day lie** in the single source of truth — a phase sat `in_progress` with all 17 of its
  tasks complete since 2026-05-13, and future sessions kept re-reading it as live work. The same
  absence held the other end shut: a phase `/generate-phases` writes as `pending` stayed `pending`
  until it closed. Measured on a member host 2026-10-24: a current phase said `pending` with 25 of
  its 60 tasks complete.
- **Rewrite or confirm the root `description` and set `description_reviewed` — but ONLY as the
  review in Step 3c, never as a free edit.** `PROJECT_CHARTER.md` § 11 makes the sentence the
  project's own and its sessions the ones who keep it true; Step 3c is where they do.

**That list is closed, and appending to a catch-all array has never been on it.** Everything it
permits is scoped to a *task* — a thing with an id, an owner, a verify step and a way of ending.
Nothing in `progress.json` is a place to park a concern that has none of those.

### NEVER Do:
- ❌ Remove tasks or phases — preserve their ids; close unwanted open work as `superseded`,
  `dropped` or `cancelled` with a reason.
- ❌ Rewrite a **terminal** task's semantic history. `complete`, `completed`, `superseded`, `done`,
  `closed`, `dropped`, `cancelled`, `canceled`, `resolved`, `obsolete` and `abandoned` are immutable
  references: do not retell their scope, outcome, verification or evidence. Later action belongs in
  non-terminal work linked back to the record. Git preserves earlier bytes; the live file preserves
  what was declared closed.
- ✅ Every **non-terminal** task is editable planning state — planned, pending, ongoing,
  in-progress, blocked and deferred alike. Refine, combine, divide, reassign, re-scope or relocate
  it when new evidence makes the plan more accurate or executable. Before adding a task, inspect
  all open work and reuse or reshape an existing item when it can represent the issue coherently.
- `/repo-hygiene` compaction may file a terminal task's long prose into its committed sidecar while
  preserving the semantic fields verbatim. That is archival, not a rewrite.
- `progress-check` blocks vanished ids and warns when a task already terminal in the previous
  commit changes its semantic fields. It deliberately stays silent for every non-terminal edit.
- ❌ Change task IDs
- ❌ Delete from `artifacts` array
- ❌ Remove the `estate_notice` key from a task (see below)
- ❌ Append to a generic catch-all array — a top-level `backlog`, `ideas`, `todo`, `notes` or
  anything else that holds free strings instead of tasks. Such an entry has no owner, no
  authorization and no closure rule, so nothing that enters one is ever forced to leave, and
  `/open-work` renders the pile as though it were open work. Route the concern instead by the four
  destinations in `/add-work` § *The Four Destinations*; if it has no owner and nobody authorized
  it, it is destination 4 and belongs in `session_notes.md`, not here.

### Tasks that arrive from the central estate survey

A task carrying **`estate_notice: <marker>`** was appended by `syndicate-playbooks-examples`, not
raised by this project. It is a **request to verify**, not a finding and not a fix: the centre
matched a pattern across every project and does not own your files — some items will be correct
exactly as they stand.

- **The body is in the task's `detail`.** `/open-work` renders `id`/`name`/`status` only, so read
  the task itself, not the table.
- **Do not remove the `estate_notice` key.** It is what makes re-notification a no-op; delete it
  and the next central run appends a second copy. The text is replaced in place by the centre,
  under the same task id if the central rule is corrected. Once the project makes it terminal, the
  centre leaves it untouched and later corrections require new open work.
- **To decline** a given check, list its probe name (or `*`) in `.claude/estate-align.skip`, one
  per line. A refusal is reported as REFUSED and is never overridden.
  - **Before delivery** — stops the notice arriving at all. Only possible for a probe you have
    already met.
  - **After delivery**, which is the normal case and used to be described as impossible: you
    cannot know a new probe's name until its notice arrives. So decline in two steps — add the
    probe name to the skip file (that stops every future run), and mark the delivered task
    **`superseded`** with the reason. Do **not** delete the task and do **not** strip its
    `estate_notice` key: `progress-check` blocks the first and, since 2026-08-06, the second.
    Superseding is the framework's own way to close work you are not doing, and it keeps the
    marker that makes re-notification a no-op.

  *Reported by a receiving project 2026-08-06: the previous wording said the skip file "must exist
  before delivery", which made declining structurally impossible for any genuinely new probe. The
  mechanism always allowed the two-step path; only the sentence forbade it.*

### When Task Scope Changes During Work

If the task is non-terminal, edit it in place or reshape the surrounding open work. If it is
terminal, leave it as history and represent later action in a new or existing open task.
```json
// Open: reshape in place because the plan changed before closure
{"id": "2.1", "name": "Revised task description", "status": "in_progress", "notes": "Scope reconciled after..."}

// Closed: keep 2.1 unchanged and put later action in open work
{"id": "2.1a", "name": "Later work discovered after 2.1 closed", "status": "pending", "references": ["2.1"]}
```

**Work moves into another open task only by amending that task.** When remaining work goes into
an existing open task instead of a new one, rewrite that task's deliverable and `verify` to carry
it before the original closes, and link the two: the receiver's `references` names the original,
and the original, as it closes, names the receiver (`superseded_by` if it closes superseded,
otherwise in its `notes`). If the original is already terminal, leave it as it is; the receiver's
`references` is the only link. A "folded into X" note that leaves X's wording unchanged is not a
disposition: X then closes on its old wording, and the work belongs to nobody. If the receiving
task is in progress under another agent, put the work in a new task that references both instead.

**A decision task closes on the decision.** A task phrased as a decision, such as *decide whether
to X*, is complete when the decision is made. Its `verify_result` is the decision and its
reasoning, and says that system behaviour has not changed. If the decision is to act, the
implementation is a separate open task that references the decision task. One task never stays
open to cover both: it would be neither honestly open nor honestly closed.

### When New Task Discovered Mid-Work:

**First ask one question: does this serve the goal of the phase I am in?** The answer decides the
number, and the number decides whether the phase can ever close.

**The first digit carries ONE goal.** Every task under phase `N` must be work in service of phase
`N`'s objective. That is what makes `N` closable: when its goal is met, it is *done*. A phase that
accumulates whatever happened to be discovered while it was open has no single goal, therefore no
finish line, therefore never closes — and everything parked in it is never forced to a decision.

| The discovery… | Number it | Why |
|---|---|---|
| **is needed to finish 2.3 itself** | `2.3a`, `2.3b` — sub-ID, as below | It *is* the current work. Same goal. |
| **serves this phase's goal**, but is its own deliverable | `2.7` — next free ID in the phase | Same goal, new task. |
| **does NOT serve this phase's goal** | **`3.1` — a NEW phase** | However it was found, it is different work. Putting it here is what makes a phase uncloseable. |

**"But I found it while doing 2.3" is not a reason to number it 2.x.** Where work was *discovered*
says nothing about which goal it *serves*. That single confusion is what turns a focused phase into a
40-task drawer.

```json
// Serves the current work — sub-ID keeps logical order
{"id": "2.3a", "name": "New task found during 2.3", "status": "pending", "added_reason": "Discovered during implementation of 2.3"}

// Does NOT serve this phase's goal — new phase, and REWRITTEN TO STAND ALONE.
// Assume the reader has none of this session's context, because they will not.
{"id": "3.1", "name": "Feed serves stale prices up to 6h after a change (cache TTL: feed/cache.py:44)",
 "status": "pending",
 "added_reason": "Found while doing 2.3 (auth refactor); unrelated to that goal, so it starts phase 3 rather than making phase 2 uncloseable. Not investigated further."}
```

**A task in a new phase must be rewritten to stand alone.** The session that understood it is gone,
and by the time anyone reads it the surrounding context has moved. `"fix the thing we discussed"` is
already worthless. If you cannot restate it so a cold reader can act on it — what is wrong, where,
and how you know — that is evidence it should be **dropped**, not carried.

---

## Multi-Agent Discipline

When multiple agents work in the same repo simultaneously, shared files (`progress.json`, `session_notes.md`) become collision points. Follow these rules to prevent agents from overwriting each other's work.

### progress.json: Surgical Edits Only

- **ALWAYS use the Edit tool** (find-and-replace) to modify progress.json — **NEVER use Write** (full file overwrite)
- **Re-read progress.json immediately before each edit** — don't rely on what you read at session start
- In delegated work one executor records: you, or the one step you name as its recorder; every
  other lane, subagent or workflow step returns its result, evidence and changed paths and records
  nothing (`PROJECT_CHARTER.md` § 11, *Recording progress and documents*). The recorder records
  every delegated task once the results are in, by this procedure, not only a task of its own. The
  coordinating executor may reconcile any non-terminal task after re-reading the whole open-work
  landscape; never rewrite terminal history
- **Never modify `current_task` or `current_phase`** unless you are the only agent working — in multi-agent setups, that's the orchestrator's responsibility
- **One Edit call per field change** — smaller edits reduce the collision window

### session_notes.md: Append-Only

- **Re-read the top of the file before appending** — another agent may have added an entry since you last read it
- **Insert your entry after the `---` below the title** — use unique header: `## Session: YYYY-MM-DD - Task X.Y`
- **Never rewrite, reorder, or edit existing entries** — treat other agents' entries as immutable

### Task-Scoped Identity

- **Your task is what the user assigned you** — not whatever `current_task` says in progress.json
- A lane executor reports its assigned task; the coordinating executor reports and reconciles the
  combined outcome across every related non-terminal task
- **Include task ID in commit messages** — so concurrent commits are traceable: `progress: complete task X.Y - [description]`

---

## Steps

### 1. Read Current State
- Read `progress.json` to understand current state
- Identify which tasks were just completed
- Note which repos were modified

### 2. Verify Completed Tasks
For each task being marked complete:
- Run its `verify` step if defined
- Confirm deliverables exist
- Check AWS resources if applicable
- **Ask what would make the verify fail.** If the honest answer is "nothing that exists yet", it
  passes by absence: replace it with a check that fails when its premise changes. A measure built
  to answer a question counts only if its yes implies the asker's yes; otherwise measure the thing
  itself, and report a cheaper proxy beside it, never in its place.
- **A task that adds, fixes or restates a check shows it failing first** (`PROJECT_CHARTER.md`
  § 10, *Verify reality*). A check here is a test, gate, guard, lint, limit, threshold or negative
  control. Run it twice and record both runs in `verify_result` as
  `seen failing: <run 1>; passes: <run 2>`:
  1. Against the defect: the file as it stood before the fix
     (`git show <commit before the fix>:<path>`), the defect put back, or an injected violation;
     for a limit, the case one step past it, on the real system (a write there follows the order in
     the live-write bullet). It must fail, and a test or gate
     must name that defect. A collection or import error is not that failure.
  2. Against the fix: it passes; for a limit, the newly allowed case succeeds.

  Confirm the broken input really changed what the check reads, and that the failing assertion
  turns on something only correct behaviour produces, not a word or count the broken code also
  emits. When a real record exposed the defect, build the bad input from it, not from a fixture.
  When a deliberate change breaks a check, restate the property it protected so the old failure
  still fails, never weakening it to whatever passes; if it had to be relaxed instead, record
  `lost verification: <what>`.
- **Read what was skipped.** `PASSED` means the checks covering this task ran: read a suite's skip
  count and reasons, and a CI job's or scheduled check's run history, where `completed / skipped`
  is not a run. If any were skipped, record `PASSED with N skipped: <reason>` or fix the skip. A
  skip that turns on live state or on generated wording is bound to a committed input instead. A
  CI job or scheduled check that has never run is made to fail loudly on its missing
  configuration, or deleted; before reviving one, confirm it has work to do.
- **Render and read a surface a person uses.** For a served page, dashboard, report or rendered
  document, fetch or screenshot the result and read the changed part as its reader would: labels,
  tables, formatting, and whether the expected entries are there. Say so in `verify_result`; a
  green test suite is not this check. If you cannot reach it, record that it was not reached; that
  is no reason to stop and ask.
- If the verify must write to a live system, run it first with an identifier that cannot exist (it
  must fail at the lookup, not at argument parsing, and leave no record behind), then on a record
  made for the purpose there, and on a real record only when neither will do: the lowest-stakes one
  (machine-made over human-approved, old over current), its prior values captured first.
  `verify_result` names the record, the writes and how to restore it, and confirms that what a human
  approved is still the current version (`PROJECT_CHARTER.md` § 10, *Verify reality*). A write a
  third party outside the operator's estate would see is not a verification step: it is the
  *Irreversible or outward-facing* checkpoint (`PROJECT_CHARTER.md` § 3, *Protect operator
  attention*).
- A permission probe that widened access (`PROJECT_CHARTER.md` § 10, *Verify reality*) is recorded
  in `verify_result`: how long access was open, and the read-back that showed it closed.
- If the task fixes a reported defect, `verify_result` says how many instances of its class were
  listed and measured, and where that list is kept (`PROJECT_CHARTER.md` § 5, *Make phases
  converge*).

Record verification:
```json
{"id": "2.2", "status": "complete", "verify_result": "PASSED - seen failing: pre-fix file, fails naming the unescaped quote; passes: on the fix, 0 skipped"}
{"id": "2.3", "status": "complete", "verify_result": "PASSED - API returns 200"}
```

Cite a document section **by its title** in anything that outlives the session: a task's
`verify_result` or `notes`, the reason a task was superseded, and the Step 5 session entry.
Write `PROJECT_CHARTER.md` § *Verify reality*, not § 10 alone. A number may stand beside the
title, never in its place: a renumbering silently points a terminal task's `verify_result` at the
wrong section, and that field cannot be rewritten afterwards, only corrected by a later note.

### 2a. Grounding-at-Touch (sessions that edited skills or canonical docs)

Index-level hygiene cannot see content rot — a repo passes every clock/ref/index gate while its
skills cite CLI flags that don't exist and its docs describe retired resources. The fix is standing
and incremental: **the session that touches a claim verifies that claim.**

If this session edited any skill (`.claude/commands/*.md`, `.claude/skills/*/SKILL.md`,
`.agents/skills/*/SKILL.md`), canonical doc (`docs/` outside `_archive/`), or a product page,
template or UI string that prints a command for its reader to run, verify the operational claims
**in the sections you touched** against the actual implementation before marking the task complete:

| Claim type | Verification |
|---|---|
| Cited file path | Path resolves in the live tree |
| Cited CLI flag / subcommand | Exists in the argument parser (`--help`, source) of the tool its block or table cell names — not necessarily the tool mentioned nearest to it |
| Deployed-resource name | Appears in a **fresh** inventory, not a remembered one |
| Payload / query shape | Matches the deployed definition (schema, table model, API) |
| Skill or command frontmatter (`name:`, `description:`) | Still in the executor's live skill listing with its description; `description:` on one line (the commit guard warns otherwise) |
| Command presented as runnable | Run it as written (multi-line included): it must parse **and** answer. Check the result's shape (a count, a field, a total) against the text around it and wherever else the repo states that figure. An empty result proves nothing: widen the window or filter until something returns. A command that writes is grounded by `--help` or a dry run, never run against a live system. |
| Architecture or universal claim ("X reads Y and nothing else", "put it in Z", "every X goes through Y") | List the members, then check each one's callers, imports, triggers and subscriptions. That Y exists for every member does not show that traffic goes through it. |
| Tool handle / resource name inside a fenced EXAMPLE | Same verification as if it were prose — or visibly neutral (a `<placeholder>`, `{braces}`, or the reserved fictional `myproject-` prefix). Agents copy examples as the pattern, and nobody "touches" an illustration, so a retired handle or another project's real resource name survives every gate while teaching every reader the wrong thing. An example is an operational claim, not decoration. |

Also at touch: new/edited content uses the project's terminology-registry names if a registry
exists (no new synonyms, no banned bare words), and adds no phase/task/session numbers as
load-bearing content to canonical surfaces.
It states no current count of something that grows either (files carrying a defect, projects
affected, items matching a condition): that count is wrong as soon as one more appears. Write the
per-item fact, or a rate that does not move with the population (*one file in three*); a count,
*N of M* included, carries the date it was taken. Where two records disagree on a count, recount
from the source rather than quoting either.

**An edit that leaves a touched claim unverified is incomplete work** — verify it, fix it, or
record it as an explicit deferral with a named reason. Scope is the sections you touched, not the
whole file (the standing full-file rotation is Step 2b below).

### 2b. Session-Close Consolidation Slice (EVERY session; one file; bounded)

Step 2a covers what this session changed; this step works off the **standing backlog** — the rot
already sitting in files nobody touched. It runs at every session close so consolidation debt is
paid continuously: one small slice per session beats a monthly rotation, which beats a yearly
crusade. Waiting for a periodic pass is how a repo passes every gate for 30 days while its skills
cite flags that don't exist.

1. **Read the rotation state**: `.claude/hygiene-state.json` → `grounded` map
   (`{"<file>": "<YYYY-MM-DD>"}`). If the file or map is absent, self-bootstrap: create it with
   `{"grounded": {}}` — and recommend the one-time `/repo-hygiene` baseline in the Step 12 report.
2. **Pick ONE file**: the least-recently-grounded file in the rotation set, never-grounded first.
   Files Step 2a fully verified this session count as grounded — stamp them in the map rather than
   re-picking them.

   **An open `partial` comes first.** If `hygiene-state.json` holds a `partial` entry this host
   can resume, the pick is the first such one listed, resumed where it stopped, and no file outside
   `partial` is started while one is open: a second bookmark leaves both unclosed. When it is
   finished, stamp it and delete its entry. An entry for `IMPLEMENTATION_PLAN.md` is closed by
   item 3's two checks for the specification, never resumed claim by claim.

   **A `partial` only another host can resume is host-bound, and blocks nothing here.** Mark it
   beside its entry: `"host_bound": {"<file>": {"needs": "<host or host kind, e.g. workstation>",
   "why": "<what only that host has>"}}`. On every other host, pick from the rest of the rotation
   as if the file were not in it; on the host it names, it comes first like any `partial`. It keeps
   both entries and no stamp until a session there finishes it and deletes them.

   **The rotation set is every file a reader would take as current** — not just the ones under
   `docs/`:

   ```
   .claude/commands/*.md          # live skills (defaults included — ground them, report, never edit)
   .claude/skills/*/SKILL.md      # skills (distributed ones too — ground them, report, never edit)
   .agents/skills/*/SKILL.md      # Codex skills, the same way
   docs/**/*.md                   # excluding _archive/
   ops/**/*.md                    # runbooks: read at the worst possible moment, so rot costs most
   README.md  CLAUDE.md                             # root canonical docs, if present
   IMPLEMENTATION_PLAN.md                           # origin record — grounded differently, item 3
   ```

   **Why the root docs are named explicitly.** This step's selection rule used to be
   `.claude/commands/*.md` ∪ `docs/**`, which silently excluded `README.md`, `CLAUDE.md`,
   `IMPLEMENTATION_PLAN.md` and every runbook in `ops/`. Measured consequence: a project migrated
   off its EC2 host, deleted the instance, its volume, its security group and its key pair — and
   its `README.md` went on describing that machine's instance type, RAM and monthly cost in five
   places for days. A session *noticed*, and left it, because no gate had the file in scope. The
   README is the first thing a new reader opens. A rotation that cannot reach it is not a
   currency mechanism, it is a currency mechanism for the files that were already fine.
3. **Ground it** (claim types and verifications per the Step 2a table): extract the file's
   operational claims, verify each against the implementation, record claim / reality / fix in
   session_notes.

   Order the work by what a wrong claim costs. Recovery and *if it stops* text comes first, because
   it is followed literally while something is already failing. In a skill, correct a wrong rule
   before adding a missing one: a wrong rule is followed, a missing one costs a rediscovery.

   **What you do with a defect depends on who owns the file — and there are only three answers:**

   | The file is… | Remedy |
   |---|---|
   | a **project-specific** skill or doc (anything you own) | **fix it in place.** Normal work. |
   | a **distributed default** (the 10 named in § 11.b) | **report it. Never fix it in place.** |
   | the **approved specification** (`IMPLEMENTATION_PLAN.md`) | **neither — it is not that kind of file.** See below. |

   A distributed **skill** (§ 11.b) takes the second row: report it, never fix it in place.

   **Keep grounding the defaults — just never edit them.** Reading them against reality is how
   framework defects get found at all; a real pass grounded them and surfaced four genuine engine
   bugs. That is this step working. But the remedy for a default is § 11.b's: **report requirements
   only** through the mailbox (§ 11.b), and record it in session_notes and the Step 12 report as
   *reported, not fixed*, with the branch it printed.
   Fixing one in place does two kinds of damage: the next `/distribute-defaults` silently overwrites
   your edit (the fix is **lost**, and the defect returns to every project), or the engine classifies
   the file as changed-since-delivery, which **blocks distribution** — potentially for every project
   on the host, not just yours. Either way you have made things worse than reporting would have.

   **A default that is local-only by policy is grounded off the workstation only as far as its
   text can be.** `/syndicate-refresh-remote` and its Codex adapter run on the workstation alone, so
   on any other host check their references and their own statement that they are local-only, name
   their runtime claims in session_notes as the workstation's to ground, and stamp the file. Never
   leave it `partial` or host-bound for those claims: a project that lives off the workstation
   would never close that bookmark. Measured 2026-10-30: a member host's project held such a
   `partial`, and its rotation had not moved since 2026-10-27.

   **Grounding the specification is a different check, and the difference is the whole point.**
   `IMPLEMENTATION_PLAN.md` is the origin record: what was intended and what was approved before
   implementation opened (`PROJECT_CHARTER.md` § *The specification is an origin record*).
   Grounding it means exactly two things — that it is **labelled** as the origin record rather than
   reading as a description of the running system, and that **no live surface cites it as current**
   (a README, a runbook, a skill, a task that says "see the implementation plan" for what exists
   today). It never means checking its claims against today's implementation, and it never means
   editing it to match. Content that has diverged is the history, not rot: the gap between what was
   agreed and what was built is the only evidence that the change happened, and closing the gap
   silently destroys it.

   **What the table above would otherwise do is worth naming, because it is the collision this row
   removes.** The specification is project-owned, so the first row routes it to *fix it in place* —
   which executed literally rewrites an approved specification to match today's build. That is the
   exact edit `/start-session`'s authorization table gates behind the operator (*Modifying
   IMPLEMENTATION_PLAN.md — discuss first — user approval*). A remedy one default prescribes and
   another forbids is not a remedy; it is a session that does the wrong thing confidently. Measured
   across the estate, 2026-09-20: 21 of the 34 projects reached carry a specification, the widest gap
   between its last change and progress.json's was 254 days, and of seven examined closely three
   carried no lifecycle marker at all — so the label is the check that was missing, not the content.
4. **Same file, naming + de-phasing**: flag synonyms against the terminology registry (registry
   name wins); strip leaked phase/session/task numbers (statement stays, process token goes).
   If NO registry exists yet, seed a minimal `terminology.md` under `docs/` from this file's
   concepts, marked DRAFT, and surface it for ratification in the Step 12 report.
   Date or rewrite any undated count of something that grows (Step 2a).
5. **Stamp the map**: `"<file>": "<today>"` for the sliced file and any 2a-verified files. If the
   file was too large to finish, record `"partial": {"<file>": "<where you stopped>"}` in
   `hygiene-state.json` and stamp the map only when the file completes. If only another host can
   verify what is left, mark it host-bound as item 2 says.

   **A `partial` entry and a `grounded` stamp for the same file are contradictory, and the
   contradiction is self-concealing.** A stamp means "verified on this date"; the rotation sorts
   by it, so a file stamped today goes to the BACK of the queue. Stamp a file you only partly
   ground and you have not merely mis-recorded it — you have hidden the unverified remainder
   behind a fresh date, and the rotation will not return to it for months. Measured: one project
   carried `"README.md": "<date>"` in `grounded` *and* an open `partial` saying most of the file
   was still unverified; that single inconsistency is why the stale hardware description above
   survived every session. So: **when both exist, the stamp is void.** Delete it, leave the
   `partial`, and treat the file as never-grounded — front of the queue, not the back.

**Found it? Then fix it. Do not bring it back as a question.** A defect you discovered in a file
you own is ordinary work — the same session that found it closes it, in the same commit. Listing
it in the handoff as an option the operator may choose costs them a decision they have no context
for, and buys nothing: they cannot evaluate a stale sentence they have not read, and *"the README
describes a machine that no longer exists"* has exactly one sensible answer. Surface a finding as
a **question** only when the remedy is genuinely contested (it changes behaviour, or two
corrections are equally defensible). **Cost is not a reason to ask** — the operator ruled on that
framing on 2026-07-28, where the agent's own defence was "cost, not correctness". Surface it as a
**report** when the file is a distributed
default you may not edit (§ 11.b). Otherwise: fix it, say you fixed it, move on. Rot survives by
being repeatedly noticed and never owned.

**Bounds and skips** (the bound is the point — this must stay cheap enough to never be worth
skipping): one file per session, roughly small-task effort. Skip ONLY when context is already
>60% at session close or the session is an emergency hotfix — record the skip + reason in
session_notes. Two consecutive skips make the slice MANDATORY at the next session close. A skip
whose only cause is a host-bound `partial` does not count toward the two: the mandate must be one
every host this command is distributed to can meet.

### 3. Update progress.json (Conservative)

**Only modify allowed fields:**

```json
{
  "last_updated": "<date -u +%Y-%m-%dT%H:%M:%SZ>",
  "last_session_summary": "Completed 2.3, API endpoint working",

  "current_task": "2.4",

  "phases": {
    "phase_2": {
      "tasks": [
        {
          "id": "2.3",
          "status": "complete",           // ✓ Changed
          "completed_at": "<date -u +%Y-%m-%dT%H:%M:%SZ>", // ✓ Added
          "verify_result": "PASSED",       // ✓ Added
          "artifacts": ["arn:aws:..."]     // ✓ Added to array
        }
      ]
    }
  }
}
```

**`last_updated` is an INSTANT, never a bare date.** Set it to the current UTC time from
`date -u +%Y-%m-%dT%H:%M:%SZ` — the `T…Z` is part of the value; `2026-09-15` alone is a date, not
a time. Why: the estate dashboard's rule is to render this field as *"project updated"* at exactly
the precision recorded, so a date without a time is shown as that date only and never reads as
minutes or hours ago — the project looks untouched all day, whatever it did. Measured 2026-09-15:
29 of 36 rows on the board read as a midnight-exact instant, 28 of them from a bare date the
collector had expanded to a midnight the source never stated, and this engine repo's own row read
*"16 hours ago"* twenty minutes after a push. `/progress-check` warns `DATE-ONLY last_updated` on
a bare date at commit time; the remedy is that one command, not a hand-typed time.

**A task's `started_at` and `completed_at` are taken the same way, at the moment.** Run that
command when the task starts and again when it closes. Never estimate either one or reconstruct
it later, and never write one later than the commit that records it: an estimated instant drifts
past its commit, and the record then contradicts git. `/progress-check` warns `FUTURE` when any of
the three is ahead of the clock.

### 3b. Reconcile every phase's status against its own tasks (before 3a, every session)

A phase's status is a **derived** fact. Nothing in a session updates it, so it drifts silently in
both directions, and the drift is invisible precisely because the file still parses and every task
row is correct.

Run this after the task updates above, over **every** phase, not only the current one:

```bash
python3 - <<'PY'
import json
from datetime import datetime, timezone
d = json.load(open("progress.json"))
DONE = ("complete","completed","superseded","done","closed","dropped","cancelled","canceled",
        "resolved","obsolete","abandoned")
BEGUN = ("complete","completed","done","in_progress")   # done or under way; superseded/dropped are not a start
def status(x): return str(x.get("status") or "").strip().lower()
def instant(v):   # an ISO instant or date, else None; a bare date counts as its midnight UTC
    try: t = datetime.fromisoformat(str(v or "").strip().replace("Z", "+00:00"))
    except ValueError: return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)
ph = d.get("phases") or {}
items = ph.items() if isinstance(ph, dict) else enumerate(ph)
for key, p in items:
    if not isinstance(p, dict): continue
    tasks = p.get("tasks") or []
    tasks = tasks.values() if isinstance(tasks, dict) else tasks
    tasks = [t for t in tasks if isinstance(t, dict)]
    if not tasks: continue
    st = status(p)
    open_n = sum(1 for t in tasks if status(t) not in DONE)
    begun = sum(1 for t in tasks if status(t).replace("-", "_") in BEGUN)
    if open_n == 0 and st not in DONE:
        print(f"READY-TO-CLOSE  {key}: all {len(tasks)} tasks terminal, phase says '{st}'")
    elif open_n and st in DONE:
        print(f"CONTRADICTION   {key}: phase says '{st}' but {open_n} task(s) are open")
    elif begun and st in ("", "pending"):
        seen = sorted((instant(t.get(k)), str(t.get(k))) for t in tasks
                      for k in ("started_at", "completed_at") if instant(t.get(k)))
        since = ("keep its started_at" if p.get("started_at") else
                 f"started_at {seen[0][1]}" if seen else "no task records an instant: leave started_at absent")
        print(f"STARTED         {key}: phase says '{st}' but {begun} of {len(tasks)} task(s) are "
              f"done or under way; set in_progress, {since}")
PY
```

**The three findings are not alike, and treating them alike is the trap:**

| Finding | What to do |
|---|---|
| `READY-TO-CLOSE` | **Set the phase to `complete` and run Step 3a.** Every task is terminal, so 3a's disposition gate has nothing to decide. This is the flip 3a was always waiting for. |
| `CONTRADICTION` | **Report it. Do not auto-reopen.** A phase's *goal* may genuinely be met while a child task is stale or superseded-in-fact — that judgement is not derivable from the task list. Surface it in the Step 12 report and let the operator rule. `/open-work` already renders it with a `⚠ phase says …` marker. |
| `STARTED` | **Set the phase to `in_progress`. If it has no `started_at`, set that to the instant the line names**, the earliest `started_at` or `completed_at` among its tasks. Unlike `CONTRADICTION`, this one is derivable from the task list: a task that is complete, done or in progress is a start, whatever the phase's goal. A task `superseded` or `dropped` while re-planning is not, so it does not count. When no task records an instant, leave `started_at` absent rather than estimate one (Step 3). |

**Why the reconciliation runs at close and not at start.** The session that finished the last task
is the one that knows whether the phase's goal is met; the next session inherits only the file.

### 3a. Phase-Close Hygiene (runs whenever a phase's status flips to `complete`)

Repos rot at phase boundaries — a closed phase leaves a working dir, verbose progress bodies, and
stale index entries behind. When THIS update marks a phase `complete`:

**0. No phase closes with a task left hanging. Do this FIRST — it can stop the close.**

List every task in the closing phase that is not `complete` or `superseded`. **Each one gets an
explicit disposition. None may be left `pending` in a closed phase.**

> **Why this is a gate and not a tidy-up.** A task left pending is a task that never gets done. It
> outlives the session that understood it, and by the time anyone picks it up its content is stale —
> the code moved, the decision was made elsewhere, the reason is gone. It then sits there looking
> like tracked work while being nothing of the kind, and it makes the phase's completion a lie. The
> honest options are *finish it*, *re-home it*, or *drop it* — and "leave it" is not one of them.

| Disposition | When | What it takes |
|---|---|---|
| **Finished** | It's done | Normal completion + `verify_result`. |
| **Re-homed** | Real work that does **not** serve this phase's goal | A task in a **new phase**, **rewritten to stand alone** (see § When New Task Discovered Mid-Work). Mark the original `superseded` with `superseded_by`. Never move it verbatim — a note that made sense in-session is worthless out of it. |
| **Re-homed** into an existing open task | The same, and an open task in another phase already serves that work's goal | Amend that task first, as § When Task Scope Changes During Work says, then mark the original `superseded` with `superseded_by` naming it. |
| **Dropped** | Speculative, overtaken, or no longer justified | `superseded` with a **reason someone can disagree with**. "Not needed" is not a reason. "No measured problem; re-raise with a benchmark" is. |

**A guess that a task is stale is a claim to measure** (`PROJECT_CHARTER.md` § 10, *Verify
reality*), also when the operator leaves the call to you. If the task names a measurable condition,
measure it now and write today's figure beside the original in the reason. If it has not improved,
the task is not stale: re-scope it to today's figure, then finish it or re-home it.

The executor owns routine dispositions. Consult the operator only when dropping, deferring or
re-scoping work would change the agreed product outcome, architecture or risk. Otherwise reconcile
the open-work landscape, record the reasons, and close autonomously. Present any genuine decision
as a question in the form `PROJECT_CHARTER.md` § 3 *Putting a decision to the operator* gives;
report the dispositions you made, as below, with no question:

```
### Phase 2 close — 2 tasks still open

2.7  Cache invalidation on the product feed
     Does NOT serve phase 2's goal (auth refactor).
     → RE-HOME to new phase 3, rewritten standalone:
       3.1 "The product feed serves stale prices for up to 6h after a price
            change. Cache TTL is set in feed/cache.py:44. Found while doing
            2.3; not investigated further."

2.8  Try the faster JSON parser
     Speculative, raised in passing, 5 weeks old.
     → DROP as superseded, reason: "no measured problem; re-raise with a benchmark."

Decision required only if these dispositions change the agreed outcome or risk.
```

**If a task cannot be honestly restated for a cold reader, that is evidence to drop it, not to carry
it.** Carrying it forward only moves the staleness somewhere it will be discovered later.

Then the sweeps:

1. **Working-dir sweep (extract-then-archive).** The phase's working material lives in
   `work/phase-<id>/` at the project root (`PROJECT_CHARTER.md` § 11, *Recording progress and
   documents*). Look there, and in the legacy place under `docs/`: a `docs/phase-<id>/` (or any
   `docs/phase-*`, `wip-*`, `tmp-*` or `scratch*` dir the phase created), or any other working dir
   the phase created. For each one that exists: move what stays canonical into its canonical
   document or the path its task declares, and repoint every live inbound reference, FIRST (a
   "closed" dir can hold live dependencies — skill default paths, test fixtures, cited rules), then
   move the remainder to `docs/_archive/` under its own name with this block, `src` set to the dir
   (`work/phase-<id>`, or the legacy `docs/<dir>`):

   ```bash
   src="work/phase-<id>"
   src="${src%/}"; dest="docs/_archive/${src##*/}"
   if [ -e "$dest" ]; then
     echo "NOT MOVED: $dest already exists; move $src to a name of its own, such as $dest-work"
   else
     mkdir -p docs/_archive && git mv -- "$src" "$dest" && echo "archived: $src -> $dest"
   fi
   ```

   The destination is named in full because `git mv work/phase-<id> docs/_archive/` with no
   `docs/_archive/` yet renames the dir itself to `docs/_archive`, and its files land loose there;
   into an existing `docs/_archive/<dir>` git would nest it instead. Never blind-move, never
   delete. A reference check after the move must show zero new broken refs.
   `/repo-hygiene` quick check B lists the working dirs in both places whose phase has closed.
   Phase documentation the phase left elsewhere under `docs/` (a file named for the phase or a
   session, a hand-off outside `docs/handoff/`, notes of a discussion) is swept the same way: what
   lasts into the canonical document, the rest archived (`PROJECT_CHARTER.md` § 11, *`docs/` holds
   what persists*). `python3 .claude/skills/docs-check/docs_check.py` lists what it finds by name.
2. **progress.json weight check.** If `progress.json` exceeds ~300KB, run the compaction step from
   `/repo-hygiene` (Step 4: dry-run, read the account, `--apply`) — verbose bodies of *finished*
   tasks in *finished* phases outside the newest two move to committed sidecars under
   `docs/_archive/progress-sidecars/`; tasks, ids, status, names, `verify`, `estate_notice`, the
   dependency keys and the timestamps never change (append-only preserved). Read the run's
   **NOT moved** account before concluding compaction did not help — weight sitting in phases that
   are still open is weight it must not touch, and it prints that number.
3. **Index touch-up.** Any index the closed phase's files appeared in (CLAUDE.md pointers, skill
   picker, knowledge base) is reconciled to the post-sweep paths.
4. **Content check on what the phase leaves canonical.** Any doc/skill the phase promotes to (or
   leaves in) a canonical location gets the grounding-at-touch treatment (Step 2a table) and is
   de-phased: phase/task numbering stays with the archived working material, never as load-bearing
   content in the surviving canonical doc. Bounded to the phase's own files — this is a slice,
   not a tree-wide sweep.

This is the incremental half of repo hygiene; the periodic full pass is `/repo-hygiene`
(triggered by the clock gate in `/start-session` Step 2.7).

### 3c. Review the project's one sentence when it is due (`SESSION_CLOSE`, after 3b and 3a)

`PROJECT_CHARTER.md` § 11: *"The sentence is the project's own, and its own sessions keep it true.
It is written from the tracked record: the approved specification, the entry document's opening
and the last phase closed. When the project is closed, archived or parked, the sentence says so.
The operator's word overrides it."* And: *"The session that closes such work reviews the sentence,
rewrites or confirms it, and sets the date."* This step is that session. It runs after 3b and 3a,
so a phase this close completed already counts. Whether a review is due is read from this
project's own checker, never judged here:

```bash
python3 - <<'PY'
# DESCRIPTION_REVIEW_BEGIN
import importlib.util, json, sys
sys.dont_write_bytecode = True   # an import must not leave a __pycache__ in the project
spec = importlib.util.spec_from_file_location(
    "progress_check", ".claude/skills/progress-check/progress_check.py")
pc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pc)
state, reason = pc.description_review_state(json.load(open("progress.json", encoding="utf-8")))
reason = " ".join(str(reason).split())   # one line: a malformed date is quoted as written
if state == "reviewed":
    print("DESCRIPTION: reviewed (%s) — nothing to do; skip the rest of Step 3c" % reason)
else:
    print("DESCRIPTION: %s (%s) — review the sentence now, before Step 10's commit" % (state, reason))
# DESCRIPTION_REVIEW_END
PY
[ $? -eq 0 ] || echo "DESCRIPTION: DID-NOT-RUN — the review rule could not be read from .claude/skills/progress-check/progress_check.py; report it in Step 12 and do not judge the sentence by eye"
```

When it says `due`, `unfilled` or `absent`, the coordinating executor (never a lane) reviews:

1. **Read the record.** The approved specification if there is one (`IMPLEMENTATION_PLAN.md`, an
   origin record of what was agreed), the README's opening, and the last closed phase and what it
   delivered. `/start-session` § 3.5 printed the last two beside its `REVIEW` line.
2. **Confirm or rewrite** the sentence: one sentence saying what the project is for, and that it
   is closed, archived or parked when that is true. A sentence the operator supplied or ruled on
   stands: confirm it, never rewrite it.
3. **Set `description_reviewed`** to today's UTC date (`date -u +%Y-%m-%d`), beside `description`
   (a surgical edit), in the same Step 10 commit as the sentence.
4. **Point, do not copy.** If line 3 of the project's `CLAUDE.md` or `AGENTS.md` repeats the
   sentence (the old one or the new one) or is still `{{PROJECT_DESCRIPTION}}`, replace that line
   with the line below and add the file to Step 10's pathspec:

   ```
   What this project is for: `description` in `progress.json` (kept true by its own sessions — PROJECT_CHARTER.md § 11).
   ```
5. **Never invent a purpose the record does not support.** If it cannot support a sentence, leave
   both fields as they are and say so in the Step 12 report, for the operator.

Name the outcome in the Step 12 report: confirmed, rewritten (old and new), or left for the
operator and why.

### 4. Update git_repos Status
For each repo in `git_repos`:
```bash
cd {repo_path}
git status --porcelain
```
- Uncommitted changes → `needs_push`
- Ahead of remote → `needs_push`
- Clean and pushed → `pushed`

### 5. Update session_notes.md

Insert a new entry using the **same header format and placement as the Multi-Agent Discipline
section above** (`## Session: YYYY-MM-DD - Task X.Y`, inserted after the `---` below the title):

```markdown
---

## Session: YYYY-MM-DD - Task X.Y

### Completed This Session
- Task 2.3: Add API endpoint (repo: backend) ✓

### Verification Results
| Task | Verify | Result |
|------|--------|--------|
| 2.3 | curl /api/endpoint | PASSED (200 OK) |

### New Tasks Added
- 2.3a: Handle edge case discovered during 2.3

### Artifacts Created
- arn:aws:lambda:eu-central-1:123456:function:my-function

### Key Decisions Made
- [Any architectural or design decisions]
- [Who made each one: `operator, YYYY-MM-DD: "<their words>"`, or `executor`]

### Issues Encountered
- [Any problems and how they were resolved]
- [A defect this work introduced, resolved before closure (`PROJECT_CHARTER.md` § 5, *Make phases
  converge*): what failed, how it was found, the commit that fixed it. Call it a defect here, in
  that commit's message and in the task's `verify_result` (its `notes` if the task closed
  earlier), never a refinement]

### Context for Next Session
- Task 2.4 is next: [description]
- Note: [any gotchas or context]

### Git Status
| Repo | Status |
|------|--------|
| orchestration | pushed |
| backend | needs_push |

---
```

### 6. Sync Repository Meta-Docs (CRITICAL)

**These files MUST stay in sync with actual repository state:**

| File | Sync With | Check |
|------|-----------|-------|
| `CLAUDE.md` | `.claude/commands/`, `.claude/skills/`, `.agents/skills/` | Points at the directories — see below |
| `README.md` | Actual playbooks, commands | Catalog and features accurate |

> **`CLAUDE.md` must NOT carry a command count or an enumerated command or skill list.** The
> canonical shape of that section is **list-free prose pointing at `.claude/commands/`,
> `.claude/skills/` and `.agents/skills/`**, and it is defined in exactly one place —
> `/start-session` Step 2, which *heals* an enumerated list away at the start of the same session
> this step runs at the end of. This step used to assert the opposite ("Command count and list
> matches", "Should match *Commands Available (N total)*"), so the two defaults spent every session
> undoing each other. A hand-maintained list is the disease Step 2 cures; do not re-introduce it
> here. Reported upstream 2026-08-05 as framework defect 5. A table of skills is the same list
> under another name, and Step 8c says what becomes of one.

**When commands or skills were added/removed this session:**
1. Confirm `CLAUDE.md`'s commands section still points at the directories rather than listing
   them — if a list or a count has crept back in, remove it (that is Step 2's canonical shape, not a
   competing one defined here)
2. Check README.md references the commands that actually exist
3. If mismatch → update README.md

**When new features/playbooks added:**
1. Check README.md Playbook Catalog
2. Update to reflect actual state (exists vs planned)

**Verification command:**
```bash
# What is actually there. A DISPLAY of live state — never a number CLAUDE.md must be synced to.
ls -1 .claude/commands/*.md | wc -l
ls -1d .claude/skills/*/ .agents/skills/*/ 2>/dev/null | wc -l
```

### 7. Update Project Documentation (If Registered)

**The registry is PROJECT-OWNED and lives outside this file.** This step used to hold the list
itself and told you to *"Commit this command file with the addition"* — an edit the header eleven
lines above forbids, which `distribute-defaults.sh` classifies `divergent` (exit 3, **nothing
delivered to any project on the host**), and which makes `/start-session` Step 0.7 report
`DRIFTED` in every session thereafter. So the correct agent declined, the registry stayed empty in
**27 of 27 projects for seven months** — including one with 781 documents under `docs/` — and the
step became a no-op nobody noticed. Reported upstream 2026-08-05 as framework defect 1.

Registration goes in **`.claude/local-overlays/update-progress.md`**, the sanctioned
project-owned mechanism (6 projects already use it for other steps), as a splice block:

```markdown
<!-- splice-after: "**The registry is PROJECT-OWNED and lives outside this file.** This step used to hold the list" -->
- `docs/ARCHITECTURE.md` — update when: infrastructure changes
- `docs/API.md` — update when: endpoints added/modified
```

**For each registered document:**
1. Read current content
2. Check if this session's work affects it
3. If yes: update relevant section, add date
4. If no: skip

**With no registry — which is the normal case — sweep by diff instead of skipping.**
A project that registered nothing still has documentation that this session may have falsified:

```bash
# The last commit plus uncommitted work, so the sweep is bounded by the work, not by the tree.
# Files only in earlier commits are not listed: add them from `git log --stat` when they count.
# Past 50 files the rest is counted, not listed: "(+N more)" says the list was cut.
git diff --name-only HEAD~1 2>/dev/null | awk 'NR<=50; END {if (NR>50) printf "(+%d more)\n", NR-50}'
```
Then: for each **canonical surface** (`README.md`, `CLAUDE.md`, `docs/**` outside `_archive/`,
`handoff/` and the dated records, which say in their first lines that they are records and are never
kept current) that describes something in that diff, bring it into line — the same *found it, then fix it*
rule as Step 2b. Do not open documents the session did not touch the subject of.

**Project skills are swept too, registry or not.** A project's own skill
(`.claude/skills/*/SKILL.md`, `.agents/skills/*/SKILL.md`, or a command in `.claude/commands/`
that did not arrive by distribution) goes stale within a phase when no task asks whether the
work changed what it describes. List those that name a file changed since the branch last matched
its upstream (since the last commit, when nothing is unpushed), uncommitted and untracked files
included. A task already pushed in several commits shows only its last one here:

```bash
python3 - <<'PY'
import glob, json, os, subprocess
def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True).stdout
def changed(repo):  # since the branch last matched its upstream, plus untracked files
    base = git(repo, "merge-base", "@{u}", "HEAD").strip()
    if base in ("", git(repo, "rev-parse", "HEAD").strip()):
        base = "HEAD~1"          # no upstream, or all pushed: an empty diff would read as clean
    return (git(repo, "diff", "--name-only", base) +
            git(repo, "ls-files", "--others", "--exclude-standard")).splitlines()
try: dist = set(json.load(open(".claude/distribution-manifest.json")).get("files") or {})
except (OSError, ValueError, AttributeError): dist = set()
skip = dist | {"progress.json", "session_notes.md", "CLAUDE.md", "AGENTS.md", "README.md"}
files = [f for f in changed(".") if f not in skip and not os.path.isdir(f)]
for sub in sorted(glob.glob("*/.git")):          # each sub-repo, found as Step 9 finds it
    files += [sub[:-4] + f for f in changed(sub[:-5])]
skills = {*glob.glob(".claude/skills/*/SKILL.md"), *glob.glob(".agents/skills/*/SKILL.md"),
          *glob.glob(".claude/commands/*.md")} - dist
for skill in sorted(skills):
    text = open(skill, errors="replace").read()
    hits = [f for f in files if f != skill and f in text]
    if hits:
        print(f"{skill}: {', '.join(hits[:5])}" + (f" (+{len(hits) - 5})" if hits[5:] else ""))
PY
```

Add any skill that names a surface this task changed (a page, a table, an endpoint). For each,
ask two questions. Did this task change the method the skill documents, or only apply it? Did
the skill already know what this task found? If either answer shows a gap, update the skill now
and commit it with this task's work in Step 10, or in the next commit if that work is already
committed. Do not leave it to a follow-up task: the knowledge the fix needs is in this session,
and until the fix lands the skill teaches the old method. Name each skill checked under
*Canonical surfaces checked* in the Step 12 *Documentation swept* table.

**The sweep leaves a record, whoever runs it.** Before Step 10's commit, end the task's
`verify_result` with `; docs: <canonical files brought into line>`, or
`; docs: none, nothing this task touched their subject`. A task already committed as complete
takes it in `notes`. A completion with no `docs:` is one this step did not run for.

**When adding a new document to the project:**
1. First find the document that already covers its subject:
   `git grep -il -e '<the subject, by its canonical name>' -- README.md CLAUDE.md docs ':(exclude,glob)**/_archive/**' .claude/skills .agents/skills`.
   If one does, change that one instead. A second document on a covered subject is not written,
   and working material is not a project document (`PROJECT_CHARTER.md` § 11, *Recording progress
   and documents*, says where it and deliverables go). A dated record (an incident report, an
   audit, a baseline, a periodic review) or a dated hand-off that the search finds is not revised
   instead: the next one on its subject is a new dated section or file, what is written takes at
   most its record line and a pointer to the newer, and the subject's canonical document is changed
   to point at the latest.
   Under `docs/` it must persist (`PROJECT_CHARTER.md` § 11, *`docs/` holds what persists*): no
   phase or session documentation, and a dated record opens with its record line. The commit guard
   runs `docs-check` on what the commit adds and notes anything that does not fit.
2. Create the document
3. If it needs a per-session review trigger, add it to `.claude/local-overlays/update-progress.md`
4. **Never edit this file to register it.** It is a distributed default; the next distribution
   overwrites your edit and the drift check flags the project until a human adjudicates it.

### 8. Maintain Project-Specific Skills

**Purpose**: Continuously improve project-specific skills based on session experience.

**Scope**: Only project-specific skills — everything in `.claude/commands/` EXCEPT the distributed
defaults, which are named once in § 11.b below. (This list used to be spelled out here too, and went
stale: it said "9 defaults" and named a `refresh-remote.md` that no longer existed while missing
`repo-hygiene.md`. One statement, one place.)

Project skills under `.claude/skills/` and `.agents/skills/` are in scope too: every skill
directory except the distributed ones § 11.b identifies.

If there are no project-specific skills, skip this step.

8d below applies even then: it is how a project's first skill is made.

**8a. Fix mistakes in skills**

If you made mistakes during this session that a project-specific skill could have prevented or guided better:
- Update that skill with corrective guidance
- Add a note explaining what went wrong and the fix
- This prevents the same mistake in future sessions

**8b. Cross-reference skills**

Ensure each project-specific skill references related skills so Claude knows what's available and when to suggest each one:
```markdown
## Related Skills
- `/composition-editor` - Use when editing product compositions
- `/process-handoff` - Use after completing a batch to hand off
```

**8c. Make each project skill describe itself**

Its frontmatter `description:` says when to use it and what it does (the `/start-session` Step 2
inventory prints it), and 8b's Related Skills section names its neighbours. Do not list skills in
`CLAUDE.md`; that is the hand-maintained list Step 6 forbids. This step used to ask for a table of
skills there, and because Step 8's scope includes project commands, it asked for exactly the
enumerated list Step 6 forbids.

A `CLAUDE.md` that still carries such a table is not left as it is, because no other step reads
it and nothing keeps it true. For each row about a project skill or command, move its "when to
use" into that skill's frontmatter `description:` (both copies, where it has a Claude and a Codex
one) unless the description already says it, and anything else the row states that the skill does
not into the skill's own text; then delete the table. A row about a distributed
skill or command is only deleted: its description ships with it and is not this project's to edit
(§ 11.b). Commit this with the session's work in Step 10.

**8d. Turn a hand-run audit into a project skill**

If this session ran a check or an audit by hand that will be needed again, make it a project
skill, so the next session does not start from nothing. Name it as `PROJECT_CHARTER.md` § 12
*A skill this project creates says so in its name* requires. It holds one command that finds its
own inputs rather than this session's paths; the failure classes found, each with how it showed
and how to check for it; the read-only scripts and the decision each one informs; and the shape
of its report. Run every command in it as written before the commit, then give it its description
per 8c.

### 9. Check All Git Repos

**First, re-run any verify that a later step overtook.** If a step after Step 2 changed a file that
the verify of a task completed in this run covers, run that verify again now and record the new
result as its `verify_result`; if it fails, the task is not complete. A fix is as fallible as a
first draft, so a pass recorded before the last write is not evidence (`PROJECT_CHARTER.md` § 10,
*Verify reality*).

```bash
# Orchestration
git status

# Each sub-repo that is present (discovered by glob, not a hardcoded list)
for dir in */; do
  dir="${dir%/}"
  if [ -d "$dir/.git" ]; then
    echo "=== $dir ==="
    git -C "$dir" status --short
  fi
done
```

**The sub-repo list is discovered, never hardcoded** — same rule and same idiom as `/start-session` Steps 0/0.5/8, where the rationale is argued in full. Steps 9 and 10 here used to read `for dir in infrastructure backend frontend testing`, a fixed list that silently matched **nothing** in any project whose sub-repos are named otherwise. Because every iteration is guarded by `[ -d "$dir/.git" ]`, a non-matching name produced **no error and no output**: the step reported success having reviewed, committed and pushed **zero** sub-repos. `progress.json` `git_repos` remains the **declarative registry** this step reports *into*; the filesystem is what it reads *from*. With no subdirectories the glob is a safe no-op.

> **Why this mattered most in Step 10.** A missed *pull* causes staleness and is recoverable — the work still exists on origin. A missed *push* means the work exists on exactly one disk and nowhere else. The hardcoded list was fixed on the pull side (`/start-session`) before the push side; if you are reading this in a project that resolved zero sub-repos before, those repos were never published by session close, while the Step 12 report rendered as though all was well.

### 9a. Unattended-operation pre-yield gate (before ANY final response)

While tracked work depends on a future external state change, a final response requires proof that
something is actually watching it. This is `PROJECT_CHARTER.md` § 11's gate, and it is command-backed
because a prose rule cannot tell a live supervisor from a remembered one:

```bash
python3 .claude/skills/unattended-check/unattended_check.py --gate
```

| Exit | Meaning | What you do |
|---|---|---|
| `0` | every open operation is proved, or none is declared | continue to Step 10 |
| `3` | **the yield is refused** | do not send a final response |
| `2` | `progress.json` unreadable — every operation's state is **unknown** | report it verbatim; unknown is not none |

**Exit 3 is not advisory.** Fix the operation — prove the supervisor, set the next action, name the
cleanup owner — or record it honestly as `unmonitored` and **say "no watcher is running"** in the
report. What you may not do is send a response describing it as monitored, watched, or retrying.

**This runs in both modes.** `TASK_BOUNDARY` executes Steps 6–10, so a task boundary that happens to
end the turn is gated too — which is the point, because the measured failure was exactly a turn that
ended while its author believed it was still polling.

**Declaring an operation is Step 3's job, not this one.** The gate reads the `unattended` block on
non-terminal tasks (shape: `.claude/skills/unattended-check/SKILL.md`); a task that starts something
outliving the turn gains that block when it starts it, and `progress-check` validates it at commit.

### 10. Commit and Push Your Work (every repo you changed this session)

Commit and **FF-push only the work YOU did this session — the repos and files you changed for your task, and nothing else.** This is Axis B (cross-checkout publication): other machines (the box, offline computers) only see your work once it reaches the shared origin, so leaving a repo you changed committed-but-unpushed is exactly the stale-checkout trap that `/start-session` Step 0 then has to skip on the next machine. It is distinct from the same-checkout Multi-Agent Discipline above.

**Commit on the branch you are already on. Do not create one.** This step commits by named paths
and fast-forward-pushes; it has never created a branch and, until 2026-08-06, never said not to —
so a generic agent-harness default ("start a feature branch") filled the silence, and a receiving
project reported exactly that outcome. A new branch here strands the work: `/start-session` Step 0
fast-forwards the *tracked* branch, `/distribute-defaults` reads and writes the branch each project
tracks, and neither follows you onto a side branch. If a change genuinely warrants a branch and a
review, that is the operator's call, made explicitly — never a harness default filling a gap in
this file.

**Two firewalls govern this step:**
1. **Scope to your own work.** Commit by named paths only — never `git add -A` / `git add .` — and only in repos you actually modified for your task. Do not sweep unrelated dirty files, and do not commit or push a repo you did not touch. This is the Multi-Agent Discipline rule "commit only files related to your task," applied across repos. _This rule is now also enforced **mechanically**: a pre-commit guard (`.claude/hooks/pre-commit`, armed by `/start-session` Step 0.5) blocks any commit that newly adds a build artifact or an oversized blob, regardless of how you staged — so `git add -A` cannot silently sweep a build zip into history. The prose here is the intent; the hook is the backstop. If the guard blocks a legitimately-intended large file, allowlist it in `.claude/hooks/artifact-guard.allow` rather than reaching for `--no-verify`._
2. **Push is publish, not deploy** (see the blockquote below).

**Commit the orchestration repo (scoped by name to `progress.json`, `session_notes.md` and every
file this task changed in it, the documents Step 7 brought into line included; task-ID message):**
```bash
git commit -m "progress: complete task X.Y - [brief description]

Completed:
- Task X.Y: [name]

Next: Task X.Z

🤖 Generated with Claude Code" -- progress.json session_notes.md <your-changed-files>
```

(The `-m` message comes BEFORE the `--` pathspec — `git commit -- <paths> -m "msg"` fails because
everything after `--` is treated as a pathspec, including `-m`.)

**Commit each sub-repo you changed (scoped by pathspec — never `git add -A`):**
```bash
for dir in */; do
  dir="${dir%/}"
  [ -d "$dir/.git" ] || continue
  [ -n "$(git -C "$dir" status --porcelain)" ] || continue   # skip repos you did not touch
  echo "=== $dir: review, then commit ONLY your task's files ==="
  git -C "$dir" status --short
  # git -C "$dir" commit -m "task X.Y: [what changed in $dir]" -- <your-changed-files>
done
```

**FF-push every repo you committed — fast-forward only; skip + report; never force (same policy as `/start-session` Step 0 and `/distribute-defaults`):**
```bash
push_ff() {  # arguments: the directory, then the label; commit BEFORE calling
  # The arguments are copied into names before anything reads them, and that is not style.
  # Claude Code replaces a dollar sign followed by a digit with a word this command was invoked
  # with (the digit is its index, from 0), inside this fence too. Measured 2026-09-10: run as
  # `/update-progress task 5.1 complete`, the old body asked git about a directory named "5.1" and
  # printed "SKIP complete: no upstream (local-only) — committed, NOT pushed" for a repository that
  # needed the push. "$@" is not replaced, so the body reads its arguments only through it.
  local args=("$@"); local repo="${args[0]}" label="${args[1]}"
  git -C "$repo" rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1 \
    || { echo "SKIP $label: no upstream (local-only) — committed, NOT pushed"; return; }
  git -C "$repo" fetch --quiet 2>/dev/null || { echo "SKIP $label: origin unreachable (offline) — committed locally, push when online"; return; }
  if git -C "$repo" push --quiet 2>/dev/null; then
    echo "OK   $label: pushed to origin (commits published; NOT built or deployed)"
  else
    echo "SKIP $label: non-fast-forward — DO NOT force, DO NOT 'git pull'/merge to make it succeed; commit is safe locally; resolve per /start-session § 0a (runs on ANY host), then re-push"
  fi
}
push_ff "." orchestration
for dir in */; do
  dir="${dir%/}"
  [ -d "$dir/.git" ] && push_ff "$dir" "$dir"
done
```

Because Step 0 fast-forwarded you to origin-latest at session start and you commit only your task's files, the commits you push are your own. (If a co-agent on this same checkout left an unpushed commit beneath yours, `git push` will publish theirs too — note it in the report; it is committed work, not lost, but it was their publish decision.)

> **CRITICAL — push is PUBLISH, not DEPLOY. Never conflate the two.**
> A successful `git push` means exactly one thing: **your commits now exist on origin.** It does NOT mean a build ran, an artifact was produced, a deployment happened, or any live/running system changed. SOME repos have CI that builds or deploys on push to certain branches; MANY do not — and you cannot reliably tell which. **Treat build and deploy as a SEPARATE step you claim ONLY when you actually ran it and its own verify passed** (the task's `verify`/`verify_result` field is where that evidence lives). In your report and notes, say **"pushed to origin"** — say "built", "deployed", "shipped", or "live" ONLY with independent evidence. If you ran no build/deploy this session, state that plainly.

Mark a repo's `git_repos` status `pushed` only after a confirmed FF-push; a repo skipped for non-FF stays `needs_push` and is surfaced in the Step 12 report. Work is never lost: an unpushable commit stays safe locally and is flagged, never forced and never discarded.

### 11. Extract Session Knowledge

> **SCOPE — read this before anything else in Step 11.** Everything below governs **knowledge
> extractions**: things this session *learned*, headed for the Syndicate expert knowledge base. It
> governs **nothing else**. In particular, the prohibition further down — *"never write the
> extraction into the current repo as a substitute"* — is about **extractions**, and is **not** a
> rule about writing to repos in general. It has already been misread as one, with real cost (see
> § A framework defect is reported, never implemented).

#### 11.a — Two different things travel two different roads. Do not confuse them.

| | **A learning** | **A framework defect** |
|---|---|---|
| What it is | something you now know: a pattern, an anti-pattern, a check | a distributed default is *wrong* |
| Where it goes | the knowledge inbox — this Step 11 | a report to the engine through the request mailbox, and to the operator |
| Who consumes it | the Syndicate experts | the engine repo, as an approved task |
| What you do | write the extraction (below) | **report it. Nothing else.** |

#### 11.b — A framework defect is reported, never implemented

If you find a defect in a **distributed default** (`add-work.md`, `check-aws.md`,
`generate-architecture.md`, `generate-phases.md`, `repo-hygiene.md`, `syndicate-refresh-remote.md`,
`setup-workflow-only.md`, `setup.md`, `start-session.md`, `update-progress.md`) — a wrong claim, a
dead path, a rule that misfires — **you report it. You do not fix it.**

The same holds for a distributed **skill**: every directory under `.claude/skills/` or
`.agents/skills/` with a file listed in `.claude/distribution-manifest.json`. The next distribution overwrites it.

**You may not:** edit the engine repo (`syndicate-playbooks-examples`); edit the default in place
here (the next distribution overwrites it, and the edit is *lost*); run `/distribute-defaults`; or
decide that the framework should change. **Every one of those is the operator's call, not yours.**

**Report requirements only** (the problem, the evidence, and what would have to change) **through
the request mailbox**, even when the engine's session is live and you can message it. Message it
too (`/start-session` § *Blocked on another owner's change*, item 1), but a message is no record:
only the mailbox gives the engine a request it lists at every session start and closes with an
outcome. The text goes on stdin and never on a command line, so write it to a file first, at an
absolute path outside this repository (a file inside it is one more untracked file here, and a
relative path resolves wherever the shell happens to stand). One block, so the path survives:

```bash
report="$(mktemp)"
cat > "$report" <<'REPORT'
<the problem, the evidence, and what would have to change>
REPORT
bash .claude/skills/syndicate-request/request.sh send \
  --to syndicate-playbooks-examples --title "<one line>" < "$report"
rc=$?
if [ "$rc" -eq 0 ]; then rm -f "$report"; else echo "exit $rc: the report is kept at $report"; fi
```

Say the same in your report to the operator, with the branch it prints. If it prints no `SENT`
line, say that instead, with its exit code (`/syndicate-request` says what each one means). Then
stop. The engine lists the request at its next inbox check, the operator decides there, and agents
serving that repo implement it as a tracked, approved task. That two-step is the long-standing
structure and it works: the report is one commit, the implementation is another, and a human
decides in between.

Not into a file of this project. A list of findings kept here reaches nobody. Measured 2026-10-24:
one project held seventeen, the oldest seven weeks old, and none had reached the engine.

> **This is not hypothetical.** An agent found a real framework defect, hand-patched the engine
> **and** filed its own feedback entry — doing both steps in one act, ticking its own
> `[ ] Reviewed by human` box, and pushing its own conclusions toward every project on the estate.
> Corrected, it then **deleted its own work** on a misreading of the prohibition below, and reported
> `"pushed revert ✓"` for a revert that had not run. Two unilateral acts, the second worse than the
> first. Both were avoidable by stopping at "report".

**Why an extraction is not the channel for this.** An extraction becomes *expert expertise* in the
knowledge base. A framework fix routed there lands as advice attached to an expert — it will never
reach the skill file it was about. Right road, wrong vehicle: **send it through the mailbox, and
say it to the operator.**

> **The inbox is one instance of a general rule — see `/start-session` Step 2.5.** A repo lives in
> exactly ONE place, and **this file cannot tell you which one** — it ships unchanged to every
> machine, so any location printed here would be a claim that expires the moment a repo moves,
> silently and with no error. **Resolve location by presence; never read it off a list.**
>
> Two things are safe to state here, because they are host-independent facts rather than locations:
> `syndicate-playbooks-examples` and `syndicate-remote` are **local-only by policy** and must never
> appear on a box — their absence there is the intent, not a fault; and any `/home/<user>/<repo>/…`
> path written into a skill is a **claim that may already be false**. Resolve it before acting on it,
> and if the repo turns out to live elsewhere, do the work there and say so. Never let a dead path
> become an excuse to improvise locally. That is exactly why 11.0 below names no machine: it resolves
> the route from what this host holds (a valid `ingest.json`), and a checkout of the inbox found on
> disk is not a route.

#### 11.0 — ALWAYS FIRST: resolve the inbox, then flush the spool

**Do this on every run of this step, whether or not this session produced any learnings.** A spool
backlog is left by an *earlier* run that hit an outage; it has nothing to do with what *this* session
learned. If the flush were nested under "write extraction file (if candidates found)", a host that
spooled once and then had a run of quiet sessions would never deliver — the spool would silently
become the destination it is explicitly not allowed to be.

**Resolve the delivery route by presence — one method for every host.** The inbox is
`hub440-syndicate/syndicate-playbook` on GitHub, drained onto the box by the `git pull` it already
does. Every host delivers the same way: **POST to the ingest endpoint over HTTPS.** No host uses
inbound SSH, a firewall entry, a static IP, `box.json`, or a PEM — those retired with the `remote`
route (see `syndicate-playbooks-examples/docs/knowledge-ingest-lambda-instruction.md` — that doc lives
in the **engine** repo, which is local-only; it is deliberately NOT distributed, so do not expect a
bare `docs/…` copy of it inside a project). Resolve by **presence**, never by hostname:

```bash
SPOOL="$HOME/.syndicate-knowledge-spool"        # used by 11.0 and by step 3 below
INGEST="$HOME/.syndicate-remote-secrets/ingest.json"
# Trust a config only if it PARSES and carries its required non-empty fields — NEVER by mere
# existence. Measured 2026-07-24: a 0-byte box.json passed an existence check, resolved a "healthy"
# route, then failed every delivery while reporting health. An empty/corrupt ingest.json must
# resolve spool with a DISTINCT warning, not a route.
ingest_ok() { [ -s "$INGEST" ] && python3 -c "import json,sys;d=json.load(open('$INGEST'));sys.exit(0 if d.get('url') and d.get('token') else 1)" 2>/dev/null; }
if ingest_ok; then
  ROUTE=ingest         # POST the extraction to the ingest endpoint over HTTPS (below)
elif [ -f "$INGEST" ]; then
  ROUTE=spool          # present but EMPTY/INVALID — do NOT trust it into a route
  echo "WARNING: $INGEST exists but is empty or missing url|token — treating as NO route (spool). Re-run syndicate-connect."
else
  ROUTE=spool          # no ingest config on this host yet — spool it, loudly
fi
# A checkout of the inbox is NOT a route, on the box or anywhere (the retired `direct` route, below).
[ "$ROUTE" = spool ] && [ -d "$HOME/syndicate-playbook/knowledge_extraction" ] && \
  echo "WARNING: $HOME/syndicate-playbook is a checkout of the inbox, not a route — never write the extraction into it. Spooling; run syndicate-connect."
echo "$ROUTE"
```

**There is no `direct` route, and the box is no exception.** Until 2026-10-22 a host holding
`$HOME/syndicate-playbook/knowledge_extraction` (the box) wrote each extraction straight into that
checkout, the route this step then called `direct`, retired since. Nothing ever committed those
files, and curation reads only its own clone of origin, so 83 box extractions from 9 projects
(2026-08-17 to 2026-10-21) never reached it. An extraction is delivered when the endpoint commits it
to origin, and only then. Every host — the box included — resolves `ingest` or `spool`.

**If this host resolves `spool`, say the remedy — do not just report the backlog.** An outage clears
on its own; a host that has never been given an ingest config does not. On such a machine the
condition above stays false forever, every extraction accumulates undelivered, and the flush block
below prints `SPOOL: empty` — which reads as health. Name it as a **setup gap** and give the one
command that closes it. The operator runs it with their URL, in their own terminal, from this
project's root and outside this session, where it prompts for the per-host token without echo
(PROJECT_CHARTER.md § 8, *Git contains the recoverable system*):

```bash
bash .claude/skills/syndicate-connect/connect.sh --url <ingest url>
```

Per **machine**, once — never per project: the resolver reads `$HOME` and nothing else, so afterwards
every project on the host reports regardless of where it lives on disk (including under `/mnt/c/...`).
The command only writes `ingest.json` (mode 600) after a probe POST returns a non-5xx — a host never
trades `spool` (loud) for `ingest` (confident, and wrong). Whatever is already spooled flushes on the
next run of this step.

Never write an extraction into a checkout of the inbox instead — not the box's, not a clone made for
the purpose: a file in its working tree is untracked, nothing commits it, and curation never sees it.

**Then flush the spool.** If `ROUTE` is `ingest` and `$SPOOL` is non-empty, POST the backlog now, and
**remove only the files that confirmably arrive** (a `200` from the endpoint). A file that fails to
deliver stays spooled — never deleted, never assumed delivered:

```bash
# SELF-CONTAINED ON PURPOSE — re-derives SPOOL and ROUTE instead of inheriting them.
# Each fenced block runs as its OWN shell: variables set in the block above do NOT survive.
# This block used to rely on $SPOOL from that block; it arrived empty, `[ -d "" ]` was false,
# and the flush was skipped SILENTLY with exit 0 — a spooled extraction was never delivered and
# never reported. The one thing the spool exists for is to fail LOUDLY; that bug made it fail
# exactly like the silent repo-scatter it replaces. Keep every variable this block needs local.
SPOOL="$HOME/.syndicate-knowledge-spool"
INGEST="$HOME/.syndicate-remote-secrets/ingest.json"
ingest_ok() { [ -s "$INGEST" ] && python3 -c "import json,sys;d=json.load(open('$INGEST'));sys.exit(0 if d.get('url') and d.get('token') else 1)" 2>/dev/null; }
if ingest_ok; then ROUTE=ingest; else ROUTE=spool; fi

if [ -d "$SPOOL" ] && [ -n "$(ls -A "$SPOOL" 2>/dev/null)" ]; then
  echo "SPOOL: $(ls -1 "$SPOOL" | wc -l) extraction(s) awaiting delivery — route=$ROUTE"
  # ROUTE=ingest: POST each (see step 3) and rm ONLY on a 200.
  # ROUTE=spool: deliver nothing and report the backlog.
else
  echo "SPOOL: empty (route=$ROUTE) — nothing awaiting delivery"
fi
```

**Report the outcome in Step 12 even if this session extracted nothing** — `N flushed, M still
spooled`. A backlog that nobody reports is a backlog nobody clears.

#### 11.1 — Extract this session's knowledge

**Purpose**: Capture learnings from this session for future use.

**When to extract** (at least one must apply):
- Fix commits made this session
- User corrections during session
- Non-obvious solutions discovered
- Patterns that apply beyond this project

**Extraction process**:

1. **Identify candidates** from this session:
   - Git commits with `fix:` prefix
   - Commits that correct previous work
   - User corrections noted in conversation
   - Solutions to non-trivial problems

2. **Filter by quality criteria** (must pass ALL):
   - **Actionable**: Clear recommendation, not just observation
   - **Generalizable**: Applies beyond this specific project
   - **Verified**: Actually worked (commit succeeded, test passed)

3. **Write extraction file** (if candidates found):

   **Naming convention**: `{project}-{YYYY-MM-DD}-{topic}-recommended.md`

   Write it via the `$ROUTE` already resolved in **11.0** — do not re-resolve, and never invent a
   third destination (a checkout of the inbox is not one, on the box either):

   - **ingest** — write the file to a temp path (`TMPFILE=$(mktemp)`, then Write into it), and POST it
     to the endpoint. The endpoint authenticates the token, derives the filename server-side, and
     commits it into the inbox repo; the box drains it by pulling. Uses outbound HTTPS only — no SSH,
     no port 22, nothing opened inbound anywhere:

     ```bash
     CFG=~/.syndicate-remote-secrets/ingest.json
     URL=$(python3 -c "import json;print(json.load(open('$CFG'))['url'])")
     TOK=$(python3 -c "import json;print(json.load(open('$CFG'))['token'])")
     # The token reaches no command line (PROJECT_CHARTER.md § 8, Git contains the recoverable
     # system): curl reads the header as a config on stdin (-K -). The body comes from the file,
     # so stdin is free for the config.
     code=$(printf 'header = "Authorization: Bearer %s"\n' "$TOK" \
       | curl -sS -K - -X POST --data-binary @"$TMPFILE" \
           -o /tmp/ingest.out -w '%{http_code}' \
           "$URL?project={project}&topic={topic}&date={YYYY-MM-DD}")
     # 200 = committed to the inbox repo (see /tmp/ingest.out for the path). Any other code:
     # DO NOT drop it — fall through to spool with the code + body as the reason.
     [ "$code" = 200 ] || echo "ingest returned $code: $(cat /tmp/ingest.out)"
     ```

   - **spool** — **also the fallback whenever the `ingest` POST returns non-200**
     (endpoint down, token rejected, offline). Never drop the extraction, and never substitute a local
     repo path:

     ```bash
     mkdir -p "$SPOOL" && chmod 700 "$SPOOL"
     mv "$TMPFILE" "$SPOOL/{project}-{YYYY-MM-DD}-{topic}-recommended.md"
     ```

     Then **report it loudly** in the Step 12 summary — spooled, not delivered, with the reason verbatim.
     The spool is a **waiting room, not a destination**: it is drained by **11.0** on the next run that
     resolves `ingest`, and by nothing else.

   > **Never write the extraction into the current repo as a substitute.** A local write looks like
   > success and silently removes the knowledge from the curation path — that is worse than an outage,
   > because an outage is visible. If the inbox cannot be reached, **spool and say so**. The spool
   > fails *loudly*; the repo-scatter fails *silently*, and the silent one is the failure class this
   > step exists to prevent.
   >
   > **What this rule covers, exactly:** writing **an extraction** somewhere other than the inbox.
   > "The current repo" means **the project you are working in** — the one whose task you are
   > closing. That is the whole scope.
   >
   > **What it does NOT cover** — it has been read as governing all three, and does not:
   > it is not a rule about writing to repos in general; it says nothing about the engine repo
   > (`syndicate-playbooks-examples`), which is not "the current repo" from any project session; and
   > **a change to a canonical skill is not an extraction**, so this sentence neither permits nor
   > forbids it — § 11.b does, and the answer there is *report, never implement*.
   >
   > A rule read past its scope does damage in the direction the rule never intended. This one was
   > read as a ban on legitimate work, and the agent's response was to **delete** it. If you are
   > about to remove content because of this sentence: **stop.** This sentence has never once asked
   > anyone to delete anything.

   The file body, in every case:
   ```markdown
   # {Topic} Knowledge Extraction

   **Project**: {project name}
   **Date**: YYYY-MM-DD
   **Source**: {session description or task range}

   ---

   ## hamilton (Planning)

   ### {Title of learning}
   **Type**: pattern | anti_pattern | check
   **Description**: {Clear, actionable description of the learning}
   **Learned from**: {What happened that taught this lesson}
   **Provenance**: {project:commit_sha or session reference}

   ---

   ## ritchie (Systems/Infrastructure)

   ### {Title}
   **Type**: pattern | anti_pattern | check
   **Description**: {Description}
   **Learned from**: {Context}
   **Provenance**: {Reference}

   ---

   ## dijkstra (Correctness/Testing)

   ### {Title}
   **Type**: pattern | anti_pattern | check
   **Description**: {Description}
   **Learned from**: {Context}
   **Provenance**: {Reference}

   ---

   ## codd (Data/Schema)

   ### {Title}
   **Type**: pattern | anti_pattern | check
   **Description**: {Description}
   **Learned from**: {Context}
   **Provenance**: {Reference}

   ---

   ## wiener (Oversight/Ethics)

   ### {Title}
   **Type**: pattern | anti_pattern | check
   **Description**: {Description}
   **Learned from**: {Context}
   **Provenance**: {Reference}

   ---

   ## Summary

   | Expert | Patterns | Anti-patterns | Checks | Total |
   |--------|----------|---------------|--------|-------|
   | hamilton | X | X | X | X |
   | ritchie | X | X | X | X |
   | dijkstra | X | X | X | X |
   | codd | X | X | X | X |
   | wiener | X | X | X | X |
   | **Total** | **X** | **X** | **X** | **X** |

   ---

   ## Approval Status

   - [ ] Reviewed by human
   - [ ] Approved for loading
   - [ ] Loaded to database
   ```

   **Note**: Only include expert sections that have learnings. Omit empty sections.

   **On leibniz — deliberately absent, and not a gap to fix.** The project declares six experts;
   this template names five. That is **intended**: leibniz is a **meta-expert** and correctly holds
   no extracted expertise, which is why the live knowledge base shows a profile and zero expertise
   items across hundreds of extractions. Do **not** add a leibniz section, do not route learnings
   there, and do not report the absence as a defect — it has been re-discovered and re-raised more
   than once. If that ever changes, it changes here first, by the operator.

4. **Expert assignment**:
   | Domain | Expert |
   |--------|--------|
   | cdk, lambda, iam, aws, infrastructure | ritchie |
   | schema, api, data, dynamodb, contract | codd |
   | test, error, validation, bug, edge case | dijkstra |
   | plan, phase, task, progress, sequence | hamilton |
   | oversight, human review, automation | wiener |

5. **Skip extraction if**:
   - Only trivial changes (typos, formatting)
   - All changes project-specific (config values, paths)
   - No corrections or learnings this session

### 12. Report Summary

```
## Progress Summary

### Completed This Session
- Task 2.3: Add API endpoint (backend) ✓
  - Verify: PASSED
  - Artifacts: [list]

### Tasks Added This Session
- Task 2.3a: Handle edge case (pending)

### Corrected This Session (ALWAYS report — never omit, even when nothing proved wrong)
- Said earlier: <the claim, and where> → actually: <what is true, and how it was found>
  Corrected in: <each channel that carried it, by a new entry: a later commit, the task's `notes`
  (terminal tasks too), this report, a report to the project whose record holds it>
- Introduced by this work: <the defect> → fixed in <commit>, recorded as a defect (Step 5)
(or "None — nothing reported earlier proved wrong, and this work introduced no defect".
 The rule: `PROJECT_CHARTER.md` § 10, *Verify reality*, and § 5, *Make phases converge*.)

### Knowledge Extracted (delivery state — say which route, never just "written")
- File: {project}-2025-12-22-api-error-handling-recommended.md
- Items: 2 patterns, 1 anti-pattern
- Delivered: ingest → HTTPS POST, committed to the inbox repo (path from the 200 response)
  (or "SPOOLED → ~/.syndicate-knowledge-spool/ — NOT delivered: <reason verbatim>")
(or "None - no generalizable learnings this session")

### Knowledge Spool (ALWAYS report — never omit, even when nothing was extracted)
- Route resolved: ingest (or spool — no valid ingest config on this host, the box included)
- Flushed this run: 0
- Still spooled: 0
(A backlog is independent of whether this session learned anything. "Nothing extracted" must never
hide "3 extractions still undelivered" — that is how a waiting room quietly becomes a destination.)

### Documentation swept (Step 7) — an empty section here means the step did not run

**Measured 2026-08-06, and this block exists because of it.** Reminders to update README /
CLAUDE.md / docs appear in **130 prompts across 38 projects** and rise **6x** across a session
(0.3% of prompts in the first quarter to 1.8% in the last) — while general corrections stay flat
at ~11%. So this is not the rules fading; it is one step being skipped, and the reason it survived
seven months of being skipped in 27 of 27 projects is that **skipping it produced nothing to see.**
Steps whose omission is visible — the commit, the push, this report — are not skipped. So it gets
an artifact.

```bash
# The last commit plus uncommitted work; past 50 files the rest is counted as "(+N more)".
# A session that made several commits changed more: add the earlier ones from `git log --stat`.
git diff --name-only HEAD~1 2>/dev/null | awk 'NR<=50; END {if (NR>50) printf "(+%d more)\n", NR-50}'
```

| Files this session changed | Canonical surfaces checked | Brought into line |
|---|---|---|
| N | `README.md`, `CLAUDE.md`, `docs/…` — or the explicit words *none: nothing this session touched their subject* | the files you edited, or *none needed* |

**A new document that no canonical surface points at is not shipped, it is buried.** If this
session created a doc, the row must show where it is now referenced from.

### Completed without evidence (Step 2) — an empty section means every completion carried one

```bash
python3 - <<'PY'
import datetime, json, os
d = json.load(open("progress.json"))
now = datetime.datetime.now(datetime.timezone.utc)
days = [s.strip() for s in os.environ.get("SESSION_DATE", "").split(",") if s.strip()] \
    or [(now - datetime.timedelta(days=n)).strftime("%Y-%m-%d") for n in (0, 1)]
ph = d.get("phases") or {}
for key, p in (ph.items() if isinstance(ph, dict) else enumerate(ph)):
    if not isinstance(p, dict): continue
    ts = p.get("tasks") or []
    for t in (ts.values() if isinstance(ts, dict) else ts):
        if not isinstance(t, dict): continue
        if str(t.get("status") or "").lower() not in ("complete", "completed"): continue
        if str(t.get("completed_at") or "")[:10] not in days: continue   # a date or a UTC instant
        if not str(t.get("verify_result") or "").strip():
            print(f"NO EVIDENCE  {t.get('id')}  {str(t.get('name'))[:60]}")
PY
```

Rule 6 (*"Verify Against Real Data Before Completion"*) has existed in prose for months and is
violated at a flat rate; **53.3% of terminal tasks estate-wide (1,538 of 2,884) carry no
`verify_result` at all**, five projects at 100%. Prose did not move that number because nothing
ever printed it. This section prints it for recent completions: those whose `completed_at` falls
on today's or yesterday's UTC date, or on the dates listed in `SESSION_DATE` (comma-separated
`YYYY-MM-DD`) when it is set. A listed task not yet committed as complete takes its evidence in
`verify_result`. One already committed as complete, by an earlier session or by this session's own
task-boundary commit, takes it in `notes` instead: its verification is history
(`PROJECT_CHARTER.md` § 4, *Work from outcomes and keep open work coherent*), and
`progress-check` warns when it changes.

### Open Work (rendered mechanically — run it, do not compose it)

{{OPEN_WORK_TABLES}}

[Produced by:  python3 .claude/skills/open-work/open_work.py   — run from the project root,
 output pasted verbatim, every <FILL: …> token replaced. Same three tables and same rules as
 /start-session § 4.0/4.0a, which is where they are explained; this is the same renderer, not a
 second copy of the spec. Exit 2 = progress.json unreadable: report that verbatim rather than
 omitting the tables. Skill absent = render by hand to the same shape and say the skill is
 missing.

 The operator is closing this session and opening another project. They do not carry this
 project's task numbers in their head, and a task that renders as an ID alone has not been
 reported. Do not summarise the tables into prose, and do not drop rows for brevity — a stuck
 or deferred row surviving session after session with no decision is itself the finding, and it
 belongs in Step 3a's dispositions rather than in another silent listing.]


### Overall Progress
Phase 2: 3/5 tasks complete
Total: 8/20 tasks complete (40%)

### Repository Status (publish state only — NOT build/deploy state)
| Repo | Pushed to origin? | Notes |
|------|-------------------|-------|
| orchestration | yes (FF) | commits published; not built/deployed |
| backend | SKIPPED (non-FF) | diverged — committed locally, resolve per /start-session § 0a then re-push |

"Pushed to origin" means the commits reached the shared origin and other machines can now FF-pull them. The pushes above updated origin only — no CI ran, nothing was built, and no live system changed. A build/deploy is a SEPARATE step, claimed only if you ran it and verified it (state it explicitly, or say "no build/deploy was run").

### Next Task
- Task 2.4: [name] (repo: [repo])

### Action Required (only if something could not be published, or a deploy is expected)
- Diverged repos: resolve per /start-session § 0a (runs on ANY host), then re-push. (Your commit is safe locally.)
- Offline / local-only repos: re-push when origin is reachable / after adding an origin.
- Deploy expected but not run: run the deploy command and verify it separately — pushing did not perform it.
- Spooled extractions: the ingest POST failed (endpoint down, token rejected, offline); files are safe in `~/.syndicate-knowledge-spool/` and go out on the next run of § 11.0 that resolves `ingest`, which is the only thing that drains them. Nothing is lost — but nothing is curated either until they land.
- Spooled **because this host has no route at all** (`route=spool`, no valid `ingest.json`; a checkout of the inbox is not a route): that is a **setup gap, not an outage** — it will not clear by waiting, and every future session adds to the pile. Say so, and give the fix: `bash .claude/skills/syndicate-connect/connect.sh --url <ingest url>` (per machine, once; the operator runs it with their URL, in their own terminal, from the project's root and outside the session, where it prompts for the per-host token without echo — PROJECT_CHARTER.md § 8, *Git contains the recoverable system*).
- (If every repo shows pushed / nothing-to-push, the spool is empty, and no deploy is pending: no action required.)
```

---

## Notes
- ALWAYS update progress.json BEFORE committing
- ALWAYS verify completed tasks
- NEVER remove or re-id tasks. Every non-terminal task is editable planning state and may be
  refined, combined, divided, reassigned, re-scoped or relocated after reconciling the whole open-
  work landscape. A task already terminal in the previous commit is immutable reference history;
  `progress-check` warns if its semantic fields drift.
- Add new tasks with sub-IDs (2.3a, 2.3b)
- Document everything in session_notes.md
- Knowledge extraction is best-effort (skip if no learnings)
