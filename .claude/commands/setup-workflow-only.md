---
description: Inject playbook workflow into existing project without full setup (project)
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

<!--
  Centrally distributed by /distribute-defaults from syndicate-playbooks-examples.
  Project-specific additions go in .claude/local-overlays/<this-filename> as
  splice fragments (see /distribute-defaults for the overlay format).
  Direct edits to this file will be flagged on the next distribution.
-->

# Setup Workflow Only

Inject the playbook workflow system into an existing project that wasn't created with `/setup`.

Use this when:
- Project already exists with code/structure
- Want to add session discipline and progress tracking
- Don't need full template setup

---

## Step 1: Verify This Is an Existing Project

Check current state:

```bash
ls -la
```

**Expected**: Project has existing code, configs, or structure.

**If empty directory**: Recommend using `/setup` instead for full template setup.

---

## Step 2: Check What Already Exists

```bash
# Check for existing playbook files (each path on its own: one missing path must not hide the rest)
found=""
for p in CLAUDE.md AGENTS.md progress.json PROJECT_CHARTER.md .claude/commands/ .claude/skills/ .agents/skills/ .claude/hooks/; do
  [ -e "$p" ] && found="$found $p"
done
echo "found:${found:- none}"
```

If any exist, ask:
```
## Existing Files Detected

Found: [list files]

Options:
1. **Merge** - Keep existing, add missing pieces
2. **Replace** - Overwrite with fresh workflow files
3. **Cancel** - Stop and review manually
```

Use AskUserQuestion.

---

## Step 3: Locate Examples Repository

```bash
EXAMPLES_PATH=""   # or the path the operator gave, when a first run printed NOT_FOUND
# Inside this project (a tool clone made for this setup), beside it, then in $HOME, where the
# workstation and syndicate-join keep their copy: a project under /mnt/c/Users/<name> has no
# sibling copy. A folder counts only if it holds the template.
if [ -z "$EXAMPLES_PATH" ]; then
  for p in ./syndicate-playbooks-examples ../syndicate-playbooks-examples "$HOME/syndicate-playbooks-examples"; do
    if [ -d "$p/_project-template/.claude/commands" ]; then EXAMPLES_PATH="$p"; break; fi
  done
fi
if [ -n "$EXAMPLES_PATH" ] && [ -d "$EXAMPLES_PATH/_project-template/.claude/commands" ]; then
  EXAMPLES_PATH="$(cd "$EXAMPLES_PATH" && pwd -P)"
  echo "EXAMPLES_PATH=$EXAMPLES_PATH"
  # What is copied is the template as that copy has COMMITTED it, extracted to a temporary folder.
  # Never its working tree: on the workstation that is the engine's own checkout, which may hold
  # uncommitted changes, and a project file that matches no committed version blocks the next
  # distribution for the whole host. The committed tree also holds no Python cache, and
  # core.autocrlf=false keeps a Windows-side clone's CRLF out of the guard's first line.
  if git -C "$EXAMPLES_PATH" rev-parse -q --verify HEAD >/dev/null 2>&1; then
    T="$(mktemp -d "${TMPDIR:-/tmp}/syndicate-template.XXXXXX")" \
      && git -c core.autocrlf=false -C "$EXAMPLES_PATH" archive HEAD _project-template | tar -x -C "$T" \
      && echo "TEMPLATE=$T/_project-template" \
      && echo "  (committed at $(git -C "$EXAMPLES_PATH" log -1 --format='%h %cs'); a temporary copy, nothing to clean up)"
  else
    echo "TEMPLATE=$EXAMPLES_PATH/_project-template"
    echo "  (not a git checkout: its files as they are)"
  fi
else
  echo "EXAMPLES_PATH=NOT_FOUND"
fi
```

**If NOT_FOUND**:
```
## Examples Repository Not Found

The examples repo is needed to copy workflow files.

Options:
1. Clone it: `git clone https://github.com/hub440-syndicate/syndicate-playbooks-examples.git`
2. Specify path if it's elsewhere

Where is the examples repository?
```

Use AskUserQuestion.

Given a path, run the block again with it on the first line (`EXAMPLES_PATH="<that path>"`).

The block prints two lines to keep: `EXAMPLES_PATH=` and `TEMPLATE=`. Shell variables do not
survive between commands, so each later block starts by setting what it uses, quoted, with the
value printed here in place of the placeholder.

A copy found beside the project or in `$HOME` is only read from. It is someone's working checkout
(on the workstation, the engine's own) or the one `syndicate-join` keeps current, and Step 8 leaves
it where it is.

---

## Step 4: Copy Workflow Files

### 4.1 Commands (verify present)

Commands should already be copied (per README instructions). Verify and copy if missing:

> **This copies commands only when they are ABSENT — it is not a refresh.** Re-running
> `/setup-workflow-only` on a project that already has commands leaves them as they are. To *update*
> an existing project's defaults on a machine outside the syndicate, run `syndicate-join` in a WSL
> terminal (`syndicate-playbooks-examples/README.md` § *Syndicate External Onboarding*). The skills
> copy below is unconditional precisely because a missing skill silently breaks § 4.4 and the
> open-work render.

```bash
EXAMPLES_PATH="<EXAMPLES_PATH printed by Step 3>"
TPL="<TEMPLATE printed by Step 3>"
if [ ! -d ".claude/commands" ] || [ -z "$(ls .claude/commands/ 2>/dev/null)" ]; then
  mkdir -p .claude/commands
  cp "$TPL"/.claude/commands/*.md .claude/commands/
  echo "Commands copied"
else
  echo "Commands already present (to UPDATE, run the distribute engine locally — see note above)"
fi

# Skills (each a directory: SKILL.md + its files). Without these, § 4.4's
# syndicate-connect, /start-session § 4.0 and /update-progress § 12 (open_work.py) reference
# files that do not exist until the next /distribute-defaults.
# Copied over what is there, so a skill of the project's own keeps its folder. Python's caches stay
# behind: a TEMPLATE that is a working tree holds __pycache__/ wherever a test has run there, the
# engine never ships *.pyc, and the commit guard refuses a new __pycache__/.
mkdir -p .claude/skills
tar -C "$TPL/.claude/skills" --exclude=__pycache__ --exclude='*.pyc' -cf - . | tar -C .claude/skills -xf -
echo "Skills copied ($(ls -1d .claude/skills/*/ | wc -l) present)"

# Codex adapters are additive and inert for Claude-only projects.
mkdir -p .agents/skills
tar -C "$TPL/.agents/skills" --exclude=__pycache__ --exclude='*.pyc' -cf - . | tar -C .agents/skills -xf -
echo "Codex skills copied ($(ls -1d .agents/skills/*/ | wc -l) present)"

# The charter is delivered byte for byte, but the name can be taken: an existing project may keep a
# PROJECT_CHARTER.md of its own. It is written only when absent, already the template's, or an earlier
# committed version of it, compared without CRs (a Windows checkout's), which is how the engine
# decides (classify_charter).
lf="$(mktemp)"; [ -f PROJECT_CHARTER.md ] && tr -d '\r' < PROJECT_CHARTER.md > "$lf"
if [ ! -f PROJECT_CHARTER.md ] || cmp -s "$lf" "$TPL/PROJECT_CHARTER.md" \
   || git -C "$EXAMPLES_PATH" log --format= --raw --no-abbrev -- _project-template/PROJECT_CHARTER.md 2>/dev/null \
      | grep -qF " $(git hash-object --no-filters "$lf") "; then
  cp "$TPL/PROJECT_CHARTER.md" ./PROJECT_CHARTER.md && echo "CHARTER: installed"
else
  echo "CHARTER: PROJECT_CHARTER.md is this project's own document and was not replaced - stop and ask the operator"
fi
rm -f "$lf"
```

A `CHARTER:` line saying the file is the project's own stops the command until the operator
answers. The distribution would refuse to overwrite it too, and reports it as divergent, which blocks
its run for the whole host. Usually the operator renames the project's document, and Step 4.1 runs
again.

### 4.1b Commit Guard (install and arm)

The guard is what `/setup` and every distribution install. Git runs it on every commit, however the
files were staged. It refuses a commit that newly adds a build artifact, an oversize blob or a file
that looks like a secret, and one whose `progress.json` loses data. Without it, Step 9's commit and
every one after it are unguarded until the next distribution reaches this project.

```bash
TPL="<TEMPLATE printed by Step 3>"
top="$(git rev-parse --show-toplevel 2>/dev/null)"
G=.claude/hooks/pre-commit
if [ -z "$top" ]; then echo "GUARD: NOT armed - this folder is not a git work tree"
elif [ "$top" != "$(pwd -P)" ]; then
  echo "GUARD: NOT armed - this folder is inside the repository at $top, not its root; ask the operator"
elif [ ! -f "$TPL/$G" ]; then echo "GUARD: NOT armed - there is no guard at $TPL/$G"
elif [ -f "$G" ] && ! cmp -s "$G" "$TPL/$G" && ! head -3 "$G" | grep -q 'syndicate framework commit guard'; then
  echo "GUARD: NOT armed - $G is this project's own hook; ask the operator"
else
  # Hooks that stop running once core.hooksPath points at .claude/hooks: say so, never silently.
  was="$(git config --get core.hooksPath)"
  if [ -z "$was" ]; then
    for h in "$(git rev-parse --git-common-dir)"/hooks/*; do
      [ -f "$h" ] && [ -x "$h" ] && case "$h" in *.sample) ;; *) echo "HOOKS: $h no longer runs";; esac
    done
  elif [ "$was" != .claude/hooks ]; then echo "HOOKS: core.hooksPath was $was; its hooks no longer run"; fi
  mkdir -p .claude/hooks
  tr -d '\r' < "$TPL/$G" > "$G"      # LF whatever the copy's line endings: a CR after the shebang refuses every commit
  chmod +x "$G"
  cp -n "$TPL/.claude/hooks/artifact-guard.allow" .claude/hooks/ 2>/dev/null || true   # project-owned: seeded only if absent
  # The .gitignore baseline: the template's managed block, appended once, as the engine does.
  # Every line the project already had stays.
  BEGIN='# >>> syndicate artifact-guard baseline'
  if ! grep -qsF "$BEGIN" .gitignore; then
    { [ -s .gitignore ] && printf '\n'
      awk -v b="$BEGIN" 'index($(0),b){f=1} f{print} f && /<<< syndicate artifact-guard baseline/{exit}' "$TPL/.gitignore"
    } >> .gitignore && echo "GITIGNORE: artifact-guard baseline appended"
  fi
  git config core.hooksPath .claude/hooks    # repo-local config: arms the guard for this clone
  if [ -x "$G" ] && [ "$(git config --local --get core.hooksPath)" = .claude/hooks ]; then
    echo "GUARD: armed (core.hooksPath=.claude/hooks); Step 9 commits it at 100755"
    git check-ignore -q -- "$G" \
      && echo "GUARD: a .gitignore line ignores $G - Step 7 must make it trackable before Step 9"
  else
    echo "GUARD: NOT armed - the guard is not in place and executable, or core.hooksPath did not take; read the lines above"
  fi
fi
```

Report the `GUARD:` line in the Output. `NOT armed` with "ask the operator" stops the command until
the operator answers. A project's own `.claude/hooks/pre-commit` is not overwritten here; an older
copy of the guard is. The distribution overwrites that path whatever it holds, so the operator's
answer is needed before the project is next reached.

A `HOOKS:` line names a hook the project had that stops running now; the distribution would arm
the guard the same way at its next run. Report each one in the Output, and leave what to do about
it to the operator. Do not edit `.claude/hooks/pre-commit` to call it: the guard is centrally
owned, and the next distribution overwrites a changed copy.

### 4.2 Session Notes (if missing)

```bash
TPL="<TEMPLATE printed by Step 3>"
if [ ! -f session_notes.md ]; then
  cp "$TPL/session_notes.md" ./
fi
```

### 4.3 CLAUDE.md (merge or create)

**If CLAUDE.md exists:**

Read the existing file and append workflow sections. Do NOT overwrite existing content.

```markdown
# Append to existing CLAUDE.md:

---

## Playbook Workflow

This project uses playbook session discipline for task tracking.

### Commands
The live inventory is `.claude/commands/` — one file per command — and the skills in
`.claude/skills/<name>/SKILL.md` (Codex: `.agents/skills/<name>/SKILL.md`), each with a one-line
`description:`. `/start-session` enumerates both every session (do not maintain a hardcoded list
here). Before building anything, check them for a command or skill that already does it. Core
workflow: `/start-session` → work → `/update-progress`.

### Session Discipline
- Start each session with `/start-session`
- End each session with `/update-progress`
- Track tasks in `progress.json`
- Document handoffs in `session_notes.md`

### Working Style
Work autonomously within tasks. Pause for the operator only at the checkpoints in
`PROJECT_CHARTER.md` § 3 (*Checkpoints*). Finishing a task and starting the next one is not one of
them: completion is announced, not asked about.
```

Use Edit tool to append, preserving all existing content.

**If CLAUDE.md does not exist:**

Copy template and customize:
```bash
TPL="<TEMPLATE printed by Step 3>"
cp "$TPL/CLAUDE.md.template" ./CLAUDE.md
```

Ask user for:
- Project name
- Project prefix (Step 5.1 item 3, asked once for both files)
- AWS account/region (if applicable)
- GitHub org (optional)
- Any project-specific rules

Ask for no MCP tool and no AWS profile name, and fill in no placeholder that asks for one (leave
that line out): each is a nickname, true on the machine it was read on (`/start-session` § Two
Environments), and `CLAUDE.md` is committed and travels. `/check-aws` Step 2 resolves the AWS
handle on each host from that session's live tool inventory.

Leave line 3 as the template ships it, a pointer at `progress.json`'s `description`. The sentence
is asked for in Step 5.1 and lives in `progress.json` alone, so it has one place to be corrected.

### 4.3b AGENTS.md (merge or create)

Do not duplicate the project-owned prose from `CLAUDE.md`. If `AGENTS.md` is absent, copy the thin
Codex entry and fill its project placeholders:

```bash
TPL="<TEMPLATE printed by Step 3>"
cp "$TPL/AGENTS.md.template" ./AGENTS.md
```

If `AGENTS.md` already exists, it is project-owned: preserve it and add only a short pointer to
`CLAUDE.md` plus the `.agents/skills/` entry convention when those facts are not already present.

### 4.4 Verify This Host Can Report Knowledge (the syndicate inbox)

An existing project being put on the workflow is usually on a host that has never run one — so
check the knowledge path here, at injection, not months later. `/update-progress` § 11 delivers every
extraction to the **one** inbox by HTTPS POST to the ingest endpoint, on every host (the box
included), resolving the route as § 11.0 does:

```bash
INGEST="$HOME/.syndicate-remote-secrets/ingest.json"
if [ -s "$INGEST" ] && python3 -c "import json,sys;d=json.load(open('$INGEST'));sys.exit(0 if d.get('url') and d.get('token') else 1)" 2>/dev/null
then echo "ingest — POSTs to the endpoint over HTTPS"
elif [ -f "$INGEST" ]; then echo "NO ROUTE — $INGEST is empty or lacks url|token; extractions would spool"
else echo "NO ROUTE — this host cannot deliver; extractions would spool forever"; fi
```

**`NO ROUTE` is a setup gap, not a runtime condition.** A valid `ingest.json` never appears on its
own: extractions land in `~/.syndicate-knowledge-spool/` and stay there, because the spool is drained
only by a run that *does* resolve a route.

**The fix is one command with two inputs — the ingest URL and a per-host token.** Ask the operator
to run it with their URL, in their own terminal, from this project's root and outside this session.
It prompts for the token without echo, so the token never enters this session (PROJECT_CHARTER.md
§ 8, *Git contains the recoverable system*):

```bash
bash .claude/skills/syndicate-connect/connect.sh --url <ingest url>
```

It proves the token against the endpoint (empty-body probe: `400` = good, `401` = bad; no file
delivered) and writes `ingest.json` only after the proof. Re-run the resolver; it must print
`ingest`. (No skill? The operator does it by hand, in that same terminal:
`mkdir -p ~/.syndicate-remote-secrets && chmod 700` it, write `{"url":"...","token":"..."}` to
`~/.syndicate-remote-secrets/ingest.json` with an editor, never `echo` or `printf` with the token on
the command line, then `chmod 600`.)

**Where the project lives is irrelevant** — the resolver reads `$HOME` only, so this is machine-level
setup done once, and a project under `/mnt/c/Users/...` reports exactly like one under `~`. Delivery
is outbound HTTPS — no ssh key, no `box.json`, no firewall entry. `ingest.json` is per-machine, mode
600, outside every git repo — never commit it. Keep `$HOME` off `/mnt/c` (a Windows mount can't hold
0600, so the token would be world-readable). A checkout of the inbox is not a route, on the box
either: the retired `direct` route wrote extractions into one, where nothing committed them (83,
measured 2026-10-22). Never clone the inbox or write into one.

---

## Step 5: Create progress.json

This is the key file for workflow tracking.

### 5.1 Gather Project Info

```
## Project Information

1. **Project name**:
2. **Description**: one sentence, in your words, saying what this project is for
3. **Project prefix**: the one name this project's repositories and resources share (an existing
   project's is the one its resources already carry)
4. **Uses AWS?**: Yes/No
   - If yes: Account ID, Region
5. **Git remotes**: (I'll detect these)
6. **What does this repository manage (PROJECT_CHARTER.md § 14)?** Which repositories it
   directs, each by origin, and the word for how. "Nothing" and "not decided yet" are both answers.
```

Use AskUserQuestion.

Items 2 and 6 are the operator's to give, and nothing else may stand in for either. The description
(`PROJECT_CHARTER.md` § 11) is never composed from the README, the folder name or a template's
instruction text; an existing project's README opening may be offered as a starting point, but
what is written is the sentence the operator gives or confirms. The sub-repositories Step 5.2
detects may be offered as candidates for item 6, but a nested checkout is evidence, not a
declaration (§ 14): only the members the operator confirms are written.

### 5.2 Detect Git Repos

```bash
# Main repo
git remote -v 2>/dev/null | head -2

# Check for sub-repos
for dir in */ ; do
  if [ -d "$dir/.git" ]; then
    echo "$dir: $(cd $dir && git remote get-url origin 2>/dev/null || echo 'local only')"
  fi
done
```

### 5.3 Ask About Existing Work

```
## Define Current Work

What phase is this project in?

1. **Planning** - Still defining what to build
2. **Early development** - Initial implementation
3. **Mid-project** - Significant work done
4. **Maintenance** - Core features complete

What are you currently working on? (This becomes your first task)
```

Use AskUserQuestion.

### 5.4 Generate progress.json

Create based on gathered info:

```json
{
  "version": "2.0",
  "project": "{project_name}",
  "description": "{the operator's sentence}",
  "description_reviewed": "{now_utc}",
  "created_at": "{today}",
  "last_updated": "{now_utc}",
  "last_session_summary": "Workflow injected into existing project",

  "context_hints": {
    "aws_account": "{if applicable}",
    "aws_region": "{if applicable}",
    "project_prefix": "{item 3}"
  },

  "phases": {
    "phase_1_current": {
      "name": "{phase name based on project state}",
      "status": "in_progress",
      "started_at": "{today}",
      "tasks": [
        {
          "id": "1.1",
          "name": "{current work description}",
          "status": "pending",
          "size": "medium"
        }
      ]
    }
  },

  "current_task": "1.1",
  "current_phase": "phase_1_current",

  "git_repos": {
    "{repo name}": {"local": "{path}", "remote": "{origin url}", "status": "clean"}
  },

  "blockers": []
}
```

`{now_utc}` is the current UTC instant from `date -u +%Y-%m-%dT%H:%M:%SZ`, never a bare date:
the estate dashboard's rule is to render `last_updated` at the precision recorded, so a date
without a time is shown as that date only and never as minutes or hours ago (`/update-progress`
Step 3 states the rule; `/progress-check` warns `DATE-ONLY` on a bare date at commit time).
`{today}` in `created_at` and `started_at` may stay a calendar date. `description_reviewed` is
the same instant as `last_updated`: the sentence is reviewed at the moment it is written.

`project_prefix` is item 3's answer, the key `/check-aws` filters resources by. No MCP tool and no
AWS profile key is written, for the reason Step 4.3 gives.

**`relations` is not in the template above, on purpose.** Add it at the root, beside `git_repos`,
only as the operator answered item 6: `{"version": 1, "members": [...]}`, each member with its
`origin` (and its `path` too when it is nested here) and the operator's own `relation` word
(`PROJECT_CHARTER.md` § 14). **Never seed `"members": []`.** An empty array is a positive claim that
this repository manages nothing, so it is written only when the operator says "nothing". "Not
decided yet", or no answer, leaves the block out: the question stays open, and `/start-session`
§ 3.5 reports it every session until it is answered.

Write to `progress.json`, the description as JSON rather than through `sed`: it is free text, and a
quote, `&` or `|` in it would otherwise break the file or the sentence.

---

## Step 6: Offer to Define More Tasks

```
## Additional Tasks

Would you like to define more tasks now?

1. **Yes** - Add tasks for current phase
2. **Later** - Use `/add-work` when needed
3. **Generate** - Let me analyze codebase and suggest tasks
```

If "Generate":
- Scan codebase for TODOs, FIXMEs
- Check for incomplete features
- Look at open issues if GitHub repo
- Propose tasks based on findings

---

## Step 7: Update .gitignore (if needed)

Check if workflow files should be tracked:

```bash
# Add examples repo to gitignore if cloned locally
if [ -d "syndicate-playbooks-examples" ]; then
  grep -q "syndicate-playbooks-examples" .gitignore 2>/dev/null || \
    echo "syndicate-playbooks-examples/" >> .gitignore
fi
```

Then make sure the playbook's own state is tracked. A `.gitignore` that ignores `*.json` to keep
credentials out, re-including only `progress.json`, also ignores the distribution manifest and the
hygiene clock. They then live on one disk only, and nothing says so.

```bash
STATE="progress.json session_notes.md .claude/commands/start-session.md"
STATE="$STATE .claude/distribution-manifest.json .claude/hygiene-state.json"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "GITIGNORE: not checked - not a git work tree"   # check-ignore would fail for every path
else
  [ -s .gitignore ] && [ -n "$(tail -c1 .gitignore)" ] && echo >> .gitignore   # end on a newline
  # Decide with -q, not -v: -v also exits 0 for a path a `!` line re-includes. Append, never edit
  # a line with an anchored sed: its `$` never matches on a CRLF .gitignore, so nothing changes.
  for p in $STATE; do
    git check-ignore -q -- "$p" && ! grep -qsxF -- '!'"$p" .gitignore || continue
    why=$(git check-ignore -v -- "$p" | cut -f1)                 # <file>:<line>:<pattern>
    case $why in /*|.gitignore:*|.git/info/exclude:*) ;; *) continue ;; esac  # deeper one wins
    printf '!%s\n' "$p" >> .gitignore && echo "GITIGNORE: exception added for $p (was $why)"
  done
  STILL=$(for p in $STATE; do git check-ignore -q -- "$p" && printf '%s ' "$p"; done)
  if [ -z "$STILL" ]; then
    echo "GITIGNORE: ok - playbook state is tracked"
  else
    echo "GITIGNORE: STILL IGNORED: $STILL"
    for p in $STILL; do git check-ignore -v -- "$p"; done        # what ignores it, and where
  fi
fi
```

`STILL IGNORED` means a directory pattern such as `.claude/` excludes the file's parent, or a deeper
`.gitignore` (`.claude/.gitignore`, say) ignores the file. A `!` line in the root `.gitignore` can
override neither, so Step 9's commit would leave those files out. Each `<file>:<line>:<pattern>`
line names what to fix: fix it there by hand, keeping what it protected
(`.claude/settings.local.json`, say), and run the block again.

Then read each line a `was` or a `<file>:<line>` names. If a comment beside it records the exclusion
as deliberate, that is the project's decision: leave the line, delete the exception the block added
for it (after the last run, which would add it back), and report it. Name each exception added, each
hand fix and each deliberate exclusion left in place in the Output.

---

## Step 8: Remove the Tool Clone of the Examples Repository

All workflow files have been copied. Only a clone inside this project was made for this setup, so
only that one is removed. A copy Step 3 found beside the project or in `$HOME` is never removed.
A clone counts as a tool clone only when nothing in it exists anywhere else. A copy that is not its
own repository, that git cannot read, or that holds anything a fresh clone would not is kept,
because removing it cannot be undone (`PROJECT_CHARTER.md` § 8: a copy is never retired because it
looks like a leftover).

```bash
C=./syndicate-playbooks-examples
why=""
if [ -L "$C" ]; then rm -- "$C" && echo "CLEANUP: removed the link $C; what it points at is kept"
elif [ ! -d "$C" ]; then echo "CLEANUP: no tool clone in this project - nothing to remove"
else
  [ "$(git -C "$C" rev-parse --show-toplevel 2>/dev/null)" = "$(cd "$C" && pwd -P)" ] \
    || why="it is not a git repository of its own, or git cannot read it"
  [ -z "$why" ] && [ "$(cd "$C" && pwd -P)" = "$(cd "$HOME/syndicate-playbooks-examples" 2>/dev/null && pwd -P)" ] \
    && why="it is the \$HOME copy"
  [ -z "$why" ] && [ -n "$(git -C "$C" status --porcelain --ignored --untracked-files=all 2>&1)" ] \
    && why="it holds changed, untracked or ignored files"
  [ -z "$why" ] && [ -n "$(git -C "$C" stash list 2>&1)" ] && why="it holds a stash"
  [ -z "$why" ] && [ -n "$(git -C "$C" log --branches --tags --not --remotes --oneline 2>&1)" ] \
    && why="it holds commits no remote has"
  if [ -n "$why" ]; then echo "CLEANUP: kept $C - $why, so it is not a tool clone; ask the operator"
  else rm -rf -- "$C" && echo "CLEANUP: tool clone removed"; fi
fi
```

If the clone was removed, use the Edit tool to remove the `syndicate-playbooks-examples/` line Step 7
added to `.gitignore` (nothing is left to ignore).

---

## Step 9: Commit Workflow Files

```bash
TPL="<TEMPLATE printed by Step 3>"
# The commit takes the whole index, because a pathspec commit re-reads each path from the disk and
# would drop the executable bit staged below. So work the operator staged earlier would ride along:
# stop instead, and leave it staged. .claude/project-code is allowed: it is the guard's own fix for
# a skill the project named without its code.
other="$(git diff --cached --name-only | grep -vE '^(\.claude/(commands|skills|hooks)/|\.agents/skills/|(PROJECT_CHARTER|session_notes|CLAUDE|AGENTS)\.md$|progress\.json$|\.gitignore$|\.claude/project-code$)')"
if [ -n "$other" ]; then
  printf 'STAGED BEFORE THIS COMMAND - nothing committed; ask the operator:\n%s\n' "$other"
else
  # Exactly what this command delivered, by name: the template's commands, skills, Codex adapters and
  # guard, and the files written at the root. A skill or command of the project's own stays out, and
  # so do .claude/settings.local.json and any worktree under .claude/.
  set --
  while IFS= read -r f; do [ -e "$f" ] && set -- "$@" "$f"; done < <(
    cd "$TPL" && find .claude/commands .claude/skills .agents/skills -type f ! -name '*.pyc' ! -path '*/__pycache__/*'
    printf '%s\n' .claude/hooks/pre-commit .claude/hooks/artifact-guard.allow .claude/project-code \
      PROJECT_CHARTER.md progress.json session_notes.md CLAUDE.md AGENTS.md .gitignore)
  git add -- "$@"
  # The executable bit from the template, never from this disk: where core.fileMode=false (every
  # repository on /mnt/c) git stages a new file at 100644 whatever chmod did, and no other clone
  # of the project would run the guard.
  git add --chmod=+x -- .claude/hooks/pre-commit
  ( cd "$TPL" && find .claude/skills .agents/skills -type f -perm -u+x ! -name '*.pyc' ) \
    | while IFS= read -r f; do [ -f "$f" ] && git add --chmod=+x -- "$f"; done
git commit -m "workflow: Add playbook session discipline

Added:
- .claude/commands/ (distributed default commands)
- .claude/skills/ (distributed default skills)
- .agents/skills/ (Codex workflow adapters)
- .claude/hooks/ (commit guard, armed by core.hooksPath)
- PROJECT_CHARTER.md (the rules every project shares)
- progress.json (task tracking)
- session_notes.md (session handoff)

Updated:
- CLAUDE.md (workflow rules merged)
- AGENTS.md (Codex entry merged/created)
- .gitignore (artifact-guard baseline)

🤖 Generated with Claude Code"
git status --short --ignored -- "$@"
git ls-tree HEAD -- .claude/hooks/pre-commit
fi
```

The armed guard runs on this commit. If it refuses, read what it names and fix that; never pass
`--no-verify` to get past it. The status line must print nothing: a line is a file the command
delivered that is not in the commit (`!!` means a `.gitignore` line ignores it); fix it as Step 7
says, then run this block again. The last line must start `100755`: the guard as every clone gets it.

---

## Output

```
## Workflow Injection Complete

### Files Added/Updated
| File | Action | Purpose |
|------|--------|---------|
| `.claude/commands/*.md` | Added | Distributed default commands (count = files in the directory) |
| `.claude/skills/*/` | Added | Distributed default skills (count = directories) |
| `.agents/skills/*/` | Added | Codex adapters for the same commands and skills |
| `.claude/hooks/` | Added | Commit guard: the `GUARD:` line, and each `HOOKS:` line (a hook that no longer runs) |
| `PROJECT_CHARTER.md` | Added | The rules every project shares (or the `CHARTER:` line: the project's own, kept) |
| `progress.json` | Created | Task and phase tracking |
| `session_notes.md` | Created | Session handoff notes |
| `CLAUDE.md` | Merged/Created | Workflow rules appended |
| `AGENTS.md` | Merged/Created | Thin Codex entry; detailed rules remain in CLAUDE.md |
| `.gitignore` | Updated | Artifact-guard baseline (appended, or already present); exceptions added, hand fixes, deliberate exclusions left (or: none) |

### Commands and Skills Available
Enumerate the live directories rather than trusting a list (counts drift; the directories are
truth). Codex reads its adapters for both from `.agents/skills/`:
```bash
for f in .claude/commands/*.md; do basename "$f" .md; done
for d in .claude/skills/*/; do basename "$d"; done
```
Core workflow: `/start-session` → work → `/update-progress`; `/add-work` to add tracked tasks.

### Current State
- Phase: {phase_name}
- Task: 1.1 - {task_name}
- Status: Ready

### Cleanup
- Step 8's `CLEANUP:` line: tool clone removed, none to remove, or kept and why

### Next Steps
1. Review `CLAUDE.md` and adjust rules if needed
2. Run `/start-session` to begin tracked work
3. Use `/add-work` to define more tasks as needed

---
**Ready to start.** Run `/start-session` to begin.
```

---

## Notes

- This command injects workflow without restructuring the project
- Existing code, configs, and structure are preserved
- Use `/add-work` to expand tasks as project evolves
- Session discipline starts immediately after injection
