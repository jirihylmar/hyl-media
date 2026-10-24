---
description: Initialize project from playbook template or inject commands into existing project (project)
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - AskUserQuestion
  - mcp__aws-*__call_aws
---

<!--
  Centrally distributed by /distribute-defaults from syndicate-playbooks-examples.
  Project-specific additions go in .claude/local-overlays/<this-filename> as
  splice fragments (see /distribute-defaults for the overlay format).
  Direct edits to this file will be flagged on the next distribution.
-->

# Setup

Initialize a new project from a playbook template, or inject commands into an existing project.

---

## Detect Scenario

### Scenario A: New Project (no IMPLEMENTATION_PLAN.md)

Full setup from playbook template:
1. Choose playbook template
2. Copy template files (spec, phases, tasks, progress)
3. Customize for this project
4. Keep the cohesive product in one repository unless a real independent lifecycle justifies a split

### Scenario B: Existing Project (has IMPLEMENTATION_PLAN.md)

Inject playbook commands into existing project:
1. Copy commands only
2. Create progress.json if missing
3. Verify environment

---

## Scenario A: New Project Setup

### 1. List Available Playbooks

```bash
ls -d syndicate-playbooks-examples/playbook-*/
```

Present options:
```
## Available Playbook Templates

| Template | Description |
|----------|-------------|
| playbook-aws-serverless-multirepo | AWS Lambda + API GW + CDK, multi-repo |
| [others...] | ... |

Which template matches your project?
```

Use AskUserQuestion to select.

### 2. Collect Environment Info

```
## Environment Configuration

1. **AWS Account ID**: or **none**, if this project uses no AWS at all (then skip 2).
2. **AWS Region**: (e.g., eu-west-1)
3. **Project Prefix**: the ONE name every part of this project shares (e.g. myproject).
   Repos, local folders, and AWS resources all derive from it — see Naming Convention below.
4. **GitHub Org**: (optional)
5. **Description**: one sentence, in your words, saying what this project is for.
6. **What does this repository manage (PROJECT_CHARTER.md § 14)?** Which repositories it
   directs, each by origin, and the word for how. "Nothing" and "not decided yet" are both answers.
```

Write items 1-4 to `input/environment.md`. Items 5 and 6 go into `progress.json` in § 4, and only
there: the sentence is the operator's (charter § 11) and the relations are theirs to declare
(charter § 14), so neither is guessed when the operator leaves it unanswered.

**No MCP tool and no AWS profile name is asked for or written down.** Each is a nickname, true on
the machine it was read on (`/start-session` § Two Environments), and every file this command
writes is committed and travels. § 6 resolves the AWS handle from this session's live tool
inventory, as `/check-aws` Step 2 does, and records it nowhere.

### 2b. Naming Convention (binding from birth — collect the prefix once, derive everything)

**One prefix drives every name. A name is never invented per-part, and a folder is never named
differently from its repo.**

| Thing | Name | Rule |
|---|---|---|
| Product repository | `<prefix>` or the confirmed product name | **Default.** It contains application, infrastructure, operations, schemas, tests, docs and work state so one clean clone is sufficient. |
| Justified separate repo | `<prefix>-<part>` | Exception only for a real independent lifecycle or boundary: distinct access, release/legal ownership, or reuse across products. Never split merely because a component could be managed separately. |
| Local folder of ANY repo | **identical to the repo name** | Folder = repo = origin name, always. A folder named differently from its origin is drift you cannot grep for. |
| AWS resources | `<prefix>-{service}-{env}` (projects may extend, e.g. with component/account segments) | Holds **whether the resource is provisioned via CDK or created individually** — the convention is about the name, not the tool that made it. |
| `input/`, `docs/`, `exports/`, `imports/`, application and infrastructure directories | plain directories **inside the product repo** | Product content, never repos of their own without the justified exception above. |

**Why folder = repo = origin is a rule and not taste:** this framework's own bootstrap used to run
`mkdir {repo_name}` but `gh repo create {org}/{project}-{repo_name}` — quietly creating a folder
named `infrastructure` whose origin was `myproject-infrastructure`. Measured on the estate this
convention was written against: two projects whose orchestration folder and origin name disagree
outright, two projects with prefix-less `backend`/`infrastructure` subs, one project mixing three
naming styles, and a `hub400`/`hub440` typo frozen into two repo names. Names that disagree at
birth never converge later.

### 3. Copy from Playbook Template

```bash
# Copy the playbook's reference files — playbooks vary in what they ship
# (e.g. playbook-mcp-mono-repo has only CLAUDE.md/README.md/progress.json),
# so copy each file only if the selected playbook actually provides it.
for f in IMPLEMENTATION_PLAN.md progress.json session_notes.md; do
  [ -f "syndicate-playbooks-examples/{selected-playbook}/$f" ] \
    && cp "syndicate-playbooks-examples/{selected-playbook}/$f" ./
done
[ -d "syndicate-playbooks-examples/{selected-playbook}/tasks" ] \
  && cp -r "syndicate-playbooks-examples/{selected-playbook}/tasks/" ./

# Copy commands
mkdir -p .claude/commands
cp syndicate-playbooks-examples/_project-template/.claude/commands/*.md .claude/commands/

# Copy skills (each a directory: SKILL.md + its files). WITHOUT this, § 5b's
# `bash .claude/skills/syndicate-connect/...`, /start-session § 4.0 and /update-progress § 12
# (`open_work.py`) all reference files that would not exist until the next /distribute-defaults —
# a fresh project would be broken for those the moment it is created.
mkdir -p .claude/skills
cp -r syndicate-playbooks-examples/_project-template/.claude/skills/* .claude/skills/

# Copy Codex repository skills. They are inert for Claude and require no Codex installation.
mkdir -p .agents/skills
cp -r syndicate-playbooks-examples/_project-template/.agents/skills/* .agents/skills/

# Materialize both executor entries. CLAUDE.md remains the detailed project-rule source;
# AGENTS.md is the native Codex entry and points to it.
cp syndicate-playbooks-examples/_project-template/CLAUDE.md.template ./CLAUDE.md
cp syndicate-playbooks-examples/_project-template/AGENTS.md.template ./AGENTS.md
cp syndicate-playbooks-examples/_project-template/PROJECT_CHARTER.md ./PROJECT_CHARTER.md

# Install the commit guard (mechanical protection against `git add -A` sweeping
# build artifacts) + the baseline .gitignore, and arm it for this clone.
mkdir -p .claude/hooks
cp syndicate-playbooks-examples/_project-template/.claude/hooks/pre-commit .claude/hooks/
cp -n syndicate-playbooks-examples/_project-template/.claude/hooks/artifact-guard.allow .claude/hooks/ 2>/dev/null || true
chmod +x .claude/hooks/pre-commit          # BEFORE git add → the index records mode 100755
cp syndicate-playbooks-examples/_project-template/.gitignore ./.gitignore
git config core.hooksPath .claude/hooks    # repo-local config — arms the guard for this clone
```

### 4. Customize for This Project

**Update IMPLEMENTATION_PLAN.md:**
- Replace template project name with actual project name
- Update AWS resource names with actual naming pattern
- Adjust phases if project scope differs

**Update progress.json:**
- **Substitute every `{{PLACEHOLDER}}` the copied file carries** — `{{PROJECT_NAME}}`,
  `{{PROJECT_DESCRIPTION}}`, `{{CREATION_DATE}}` and `{{PROJECT_EXECUTOR}}` (`Claude` unless the
  operator chose Codex — Claude is the default executor, Codex an option). Default the display
  name to **the repository name**: § 2b already makes folder = repo = origin a rule, so the repo
  name is unique at the hosting provider and this inherits that uniqueness for free. **This file
  is the project's own.** The central repository delivers commands and skills and never writes
  `progress.json`, so a placeholder left here is never repaired from outside; `/start-session`
  § 3.5 can transcribe the name from origin if it is still a token.
- **`description` is the operator's sentence from § 2 item 5** — the only project-level prose any
  estate-wide reader ever sees (`PROJECT_CHARTER.md` § 11). Where this project already has an
  approved specification, check the sentence against its overview and say so if they disagree. It
  is never composed from the playbook's own text, the folder name or a template's instruction text:
  with no answer, ask again rather than write one. Write it as JSON (a free-text sentence through
  `sed` breaks on a quote, `&` or `|`), and set **`description_reviewed`** beside it to the same
  moment, `date -u +%Y-%m-%dT%H:%M:%SZ`. The playbook files carry it as `{{CREATION_DATE}}`; add the
  field beside `description` if the copied file has none.
- **`relations` is the operator's answer to § 2 item 6, written as they gave it** (`PROJECT_CHARTER.md`
  § 14): a root block beside `git_repos`, `{"version": 1, "members": [...]}`, each member with its
  `origin` (and its `path` too when it is nested here) and the operator's own `relation` word. The
  repositories § 7 creates may be shown to the operator as candidates, but only what they confirm is
  written. **Never seed `"members": []`.** An empty array is a positive claim that this repository
  manages nothing, so it is written only when the operator says "nothing". "Not decided yet", or no
  answer, leaves the block out: the question then stays open, and `/start-session` § 3.5 reports it
  every session until it is answered.
- Write `context_hints` from § 2: `aws_account` and `aws_region` (items 1 and 2), and
  `project_prefix` (item 3), the key `/check-aws` filters resources by. A project whose § 2 item 1
  answer was **none** gets `"aws": "none"` there and no `aws_*` key: `/generate-phases` accepts that
  declaration in place of an account, and Steps 6 and 8 below do not apply. Its `project_prefix` is
  written all the same, since its repositories derive from it too.
- **Fill in no nickname.** An older playbook's `context_hints` may carry an `aws_profile` or an
  `mcp_tool` key, each a placeholder for a name true on one machine only: delete those keys, and
  never fill them in. The handle is resolved where it is used, on the host that uses it.
- Update resource names in verify steps
- Reset task statuses if needed

**Update executor instructions:**
- Fill in every `{{PLACEHOLDER}}` in `CLAUDE.md` and `AGENTS.md`: `{{PROJECT_NAME}}` as in
  `progress.json`, `{{AWS_ACCOUNT_ID}}` and `{{AWS_REGION}}` from § 2 items 1 and 2,
  `{{PROJECT_PREFIX}}` from item 3, `{{GITHUB_ORG}}` from item 4. A placeholder asking for an MCP
  server or tool name or an AWS profile name is not filled either: leave that line out, for the
  reason above.
- Leave line 3 of both as the template ships it, a pointer at `progress.json`'s `description`. Do
  not paste the sentence there: a copy is a second place that goes stale unseen.
- Keep detailed project rules in `CLAUDE.md`; `AGENTS.md` is the thin Codex entry

### 5. Verify Prerequisites

```bash
node --version    # >= 18
npm --version
aws --version     # >= 2   (AWS projects only)
cdk --version     # >= 2   (CDK projects only)
gh --version
```

### 5b. Verify This Host Can Report Knowledge (the syndicate inbox)

`/update-progress` § 11 delivers every session's knowledge extraction to the **one** inbox by HTTPS
POST to the ingest endpoint, on every host (the box included), resolving the route as § 11.0 does:

```bash
INGEST="$HOME/.syndicate-remote-secrets/ingest.json"
if [ -s "$INGEST" ] && python3 -c "import json,sys;d=json.load(open('$INGEST'));sys.exit(0 if d.get('url') and d.get('token') else 1)" 2>/dev/null
then echo "ingest — POSTs to the endpoint over HTTPS"
elif [ -f "$INGEST" ]; then echo "NO ROUTE — $INGEST is empty or lacks url|token; extractions would spool"
else echo "NO ROUTE — this host cannot deliver; extractions would spool forever"; fi
```

**`NO ROUTE` is a setup gap, not a runtime condition — resolve it here, before any work starts.**
A host without a valid `ingest.json` will never gain a route on its own: each extraction it writes
lands in `~/.syndicate-knowledge-spool/` and stays there, because the spool is drained only by a run
that *does* resolve a route. That failure is invisible until the knowledge already exists — too late.

**The fix is one command with two inputs — the ingest URL and a per-host token.** Ask the operator
to run it with their URL, in their own terminal, from this project's root and outside this session.
It prompts for the token without echo, so the token never enters this session (PROJECT_CHARTER.md
§ 8, *Git contains the recoverable system*):

```bash
bash .claude/skills/syndicate-connect/connect.sh --url <ingest url>
```

It **proves** the token against the endpoint (a probe POST with an empty body: `400` = token good,
`401` = bad — no file is delivered) and only then writes `ingest.json` — a config recording an
unproven route is worse than none, because it flips this host from `spool` (loud) to `ingest`
(confident, and wrong when it matters). Re-run the resolver above; it must print `ingest`.

No skill present? The operator does it by hand, in that same terminal:
`mkdir -p ~/.syndicate-remote-secrets && chmod 700 ~/.syndicate-remote-secrets`, write
`{"url":"<ingest url>","token":"<host token>"}` to `~/.syndicate-remote-secrets/ingest.json` with an
editor (never `echo` or `printf` with the token on the command line), `chmod 600` it.

**Where the project lives is irrelevant** — the resolver reads `$HOME` only, so this is machine-level
setup done once, and a project under `/mnt/c/Users/...` reports exactly like one under `~`. Delivery
is outbound HTTPS, so it works behind any firewall — **no ssh key, no `box.json`, no security-group
entry, no static IP.** `ingest.json` is per-machine, mode 600, and lives **outside every git repo** —
never commit it.

> **On WSL, keep `$HOME` off `/mnt/c`.** A Windows mount reports `0777` and `chmod` there is a no-op,
> so `ingest.json` (which holds a token) would be world-readable. Use a real `/home/<user>` home.
>
> **A checkout of the inbox is not a route — on the box either.** The retired `direct` route wrote
> extractions into the box's `syndicate-playbook` working tree, where nothing committed them and
> curation never saw them (83, measured 2026-10-22). Never clone the inbox or write into one; the
> token is the answer.

### 6. Verify AWS Access

Resolve the handle as `/check-aws` Step 2 does, from this session's live tool inventory, and prove
it reached the account from § 2 item 1:

```
{handle} aws sts get-caller-identity
```

Must match environment config. Use that handle in Step 8 too, and record it nowhere. Skipped for a
project that declares no AWS (`context_hints.aws` is `"none"`): there is no account to match. If
this host has no AWS connection (`/check-aws` Step 2's outcome for a session with no AWS tool), the
account is not checked here and Step 8 waits for a host that reaches it; say so in the Output.

### 7. Create Sub-Repositories

For each repo in progress.json `git_repos`, the folder, the repo, and the origin all carry the
SAME name: `<prefix>-<part>` (Naming Convention, Step 2b — the old `mkdir {repo_name}` +
`gh repo create {project}-{repo_name}` pair created a folder whose origin had a different name,
manufacturing drift at birth):

```bash
mkdir -p {prefix}-{part}
cd {prefix}-{part}
git init
# Create initial files based on type
git add .
git commit -m "Initial commit"
gh repo create {github_org}/{prefix}-{part} --private --source=. --push
```

**Then verify the invariant mechanically — folder name = origin repo name, every repo, including
the orchestration repo itself** (same check `/start-session` Step 8 runs every session):

```bash
check_name() {  # one argument: the directory ('.' for orchestration)
  # Named, never positional: Claude Code replaces a dollar sign followed by a digit with a word
  # this command was invoked with, inside this fence too. "$@" is not replaced.
  local args=("$@"); local repo="${args[0]}"
  local o n
  o=$(git -C "$repo" remote get-url origin 2>/dev/null | sed 's#.*/##; s/\.git$//')
  n=$(basename "$(cd "$repo" && pwd)")
  [ -z "$o" ] && { echo "NOTE $n: no origin yet — name check deferred until origin exists"; return; }
  [ "$o" = "$n" ] && echo "OK   $n: folder = origin name" \
                  || echo "NAMING MISMATCH: folder '$n' vs origin '$o' — fix BEFORE first push"
}
check_name "."
for dir in */; do
  dir="${dir%/}"
  [ -d "$dir/.git" ] && check_name "$dir"
done
```

A mismatch at this point costs a `git remote set-url` or a folder rename; a mismatch discovered a
year in costs a coordinated rename across every checkout and host.

### 8. CDK Bootstrap (if using CDK)

```
{handle} aws cloudformation describe-stacks --stack-name CDKToolkit --region {region}
```

If not bootstrapped:
```bash
cd infrastructure
cdk bootstrap aws://{account}/{region}
```

### 9. Commit Orchestration Repo

```bash
# Scoped add by named paths — NEVER `git add -A` (that is the exact pattern that
# once swept a 36MB build zip into history). List only the framework paths that
# exist; drop any that don't.
git add -- CLAUDE.md AGENTS.md PROJECT_CHARTER.md progress.json IMPLEMENTATION_PLAN.md session_notes.md .gitignore .claude/ .agents/ tasks/ input/
git commit -m "setup: Initialize from {playbook} template

Template: {playbook}
Environment:
- Account: {account}
- Region: {region}
- Naming: {pattern}

🤖 Generated with Claude Code"
```

---

## Scenario B: Inject Commands to Existing Project

### 1. Verify Project State

Check what exists:
- `IMPLEMENTATION_PLAN.md` - should exist
- `progress.json` - may or may not exist
- `.claude/commands/` - probably missing

### 2. Copy Commands

```bash
mkdir -p .claude/commands .claude/hooks .claude/skills .agents/skills
cp syndicate-playbooks-examples/_project-template/.claude/commands/*.md .claude/commands/

# Skills (each a directory). Without these, § 5b, /start-session § 4.0 and /update-progress § 12
# reference files that would not exist until the next /distribute-defaults.
cp -r syndicate-playbooks-examples/_project-template/.claude/skills/* .claude/skills/
cp -r syndicate-playbooks-examples/_project-template/.agents/skills/* .agents/skills/
cp syndicate-playbooks-examples/_project-template/PROJECT_CHARTER.md ./PROJECT_CHARTER.md

# Commit guard (mechanical protection against `git add -A` sweeping build artifacts)
cp syndicate-playbooks-examples/_project-template/.claude/hooks/pre-commit .claude/hooks/
cp -n syndicate-playbooks-examples/_project-template/.claude/hooks/artifact-guard.allow .claude/hooks/ 2>/dev/null || true
chmod +x .claude/hooks/pre-commit          # BEFORE git add → the index records mode 100755
cp -n syndicate-playbooks-examples/_project-template/.gitignore ./.gitignore 2>/dev/null || true   # seed only if absent (don't clobber an existing one)
git config core.hooksPath .claude/hooks
```

If `.gitignore` already existed, run `/setup-workflow-only` Step 7's tracked-state block before
§ 5's commit; otherwise a blanket ignore can keep `progress.json` or the playbook's other state out
of it.

### 3. Create progress.json (if missing)

If no `progress.json`, create from existing spec:

```json
{
  "project": "{project_name}",
  "description": "{the operator's sentence}",
  "description_reviewed": "{now}",
  "last_updated": "{now}",
  "current_task": "1.1",
  "context_hints": {
    "aws_account": "{from environment}",
    "aws_region": "{from environment}",
    "project_prefix": "{from environment}"
  },
  "phases": {
    "phase_1": {
      "name": "{from spec}",
      "status": "in_progress",
      "tasks": []
    }
  }
}
```

`{now}` is the current UTC instant from `date -u +%Y-%m-%dT%H:%M:%SZ`, never a bare date — the
estate dashboard's rule is to render `last_updated` at the precision recorded, so a date without a
time is shown as that date only and never as minutes or hours ago (`/update-progress` Step 3
states the rule; `/progress-check` warns `DATE-ONLY` on a bare date at commit time).

`project_prefix` is the one name this project's repositories and resources share (Scenario A § 2
item 3, which `/check-aws` filters by): take it from the existing spec or environment, and ask the
operator when neither names it. No MCP tool or AWS profile key is written, for the reason Scenario
A § 2 gives.

Ask the operator for the two things only they can give, exactly as Scenario A § 2 items 5-6 do,
and write them as Scenario A § 4 says:
- **`description`**: their one sentence saying what this project is for, checked against the
  existing spec's overview, with `description_reviewed` set to the moment it is written. Never
  composed from the README, the folder name or a template's instruction text.
- **What does this repository manage (`PROJECT_CHARTER.md` § 14)?** Write the `relations` block
  they answer, beside `git_repos`. **Never seed `"members": []`**: that is a positive claim, written
  only when the operator says "nothing". With no answer the block is left out and the question stays
  open, which `/start-session` § 3.5 reports.

Ask user to define tasks or read from existing task documentation.

### 4. Create executor instruction entries (if missing)

Create or preserve `CLAUDE.md` as the detailed project-owned instruction source. Create
`AGENTS.md` from `_project-template/AGENTS.md.template` when absent; if it exists, preserve its
project-owned content and add only the missing pointer/invocation facts.

Copy template and fill in values.

### 5. Commit Changes

```bash
git add -- .claude/ .agents/ progress.json CLAUDE.md AGENTS.md PROJECT_CHARTER.md .gitignore
git commit -m "setup: Add playbook commands to existing project

🤖 Generated with Claude Code"
```

---

## Output

```
## Setup Complete

### Mode
[New project from template / Commands injected to existing project]

### Template
[playbook name if new project]

### Environment
- Account: {account} ✓
- Region: {region} ✓
- AWS handle: {the handle § 6 resolved} ✓ (this machine only, recorded nowhere; or: no AWS
  connection on this host, so {account} was not checked)
- Prefix: {project_prefix}
- Naming: {pattern}

### Files Created/Updated
- IMPLEMENTATION_PLAN.md [created/existed]
- progress.json [created/existed]
- CLAUDE.md [created/updated]
- AGENTS.md [created/updated]
- .claude/commands/ [created]
- .claude/skills/ [created]
- .agents/skills/ [created]
- tasks/ [created/existed]

### Repositories
| Repo | Status |
|------|--------|
| orchestration | pushed |
| infrastructure | created |
| ... | ... |

### Ready
Run `/start-session` to begin work.
```

---

## Notes

- Playbooks vary in what they ship (see Scenario A step 3) — copy what exists. Some carry a spec/phases/tasks; some carry only CLAUDE.md/README.md/progress.json.
- If the selected playbook ships a complete spec + tasks, `/setup` copies and customizes them — no need to generate phases. If it does not, follow the Phase 0 flow (draft the spec, then `/generate-phases`).
- For additions mid-project, use `/add-work`
- Commands in `_project-template/.claude/commands/` are the source of truth
