---
description: Break down specification into phases with atomic tasks (project)
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

<!--
  Centrally distributed by /distribute-defaults from syndicate-playbooks-examples.
  Project-specific additions go in .claude/local-overlays/<this-filename> as
  splice fragments (see /distribute-defaults for the overlay format).
  Direct edits to this file will be flagged on the next distribution.
-->

# Generate Phases

Break down the approved specification into phases, each containing atomic tasks.

**Run this AFTER specification approval, BEFORE any coding work begins.**

---

## Prerequisites (CRITICAL)

Before generating tasks, verify these conditions are met:

### 1. Environment Configuration Must Exist

Check for environment info in:
- `input/environment.md` or `input/env.md`
- `CLAUDE.md` Quick Reference section
- `progress.json` context_hints

**Minimum required:**
- Project naming prefix
- At least one AWS account/region/MCP tool combination — **unless the project uses no AWS**, which
  it declares as `"aws": "none"` in `progress.json` `context_hints` (written by `/setup` § 2 item 1,
  or on the operator's word). A missing account is never read as "none": the declaration is what
  makes it an answer, and without one the check below still stops.

**Structure is flexible** - may include:
- Multiple accounts (cross-account scenarios)
- Multiple regions
- Multiple MCP tools
- Integration notes

**If missing:** STOP and direct user to run `/setup` (its environment-collection step gathers
account/region/MCP/naming), or to add the values to `CLAUDE.md` / `input/environment.md` directly —
then re-run this command. A project with no AWS needs only the prefix and the declaration; its
phases then name no AWS resource, and their verify steps check what the project actually runs.

### 2. Specification Must Be Approved

Check for approval indicator (the Phase 0 spec-approval task records the approval — it does not
appear on its own):
- `session_notes.md` contains an explicit approval record from the spec-approval task, OR
- `IMPLEMENTATION_PLAN.md` carries a `## Status: Approved` line the approver added

**If not approved:** STOP and inform user:
```
## Cannot Generate Phases

The specification must be reviewed and approved first.

### Next Steps
1. Review IMPLEMENTATION_PLAN.md
2. Provide explicit approval ("approved", "looks good", etc.)
3. Then run `/generate-phases`

Approval is given directly in the conversation — the spec-approval task in Phase 0 presents
IMPLEMENTATION_PLAN.md and blocks until you approve it.
```

### 3. Phases Must Not Already Exist

Check if phases have already been generated:
- Look for `tasks/phase_*.md` files
- Check if `progress.json` has phases with populated task arrays

**If phases already exist:** WARN user:
```
## Phases Already Generated

Phase files already exist. Running /generate-phases again will:
- NOT modify existing phases/tasks
- Only add new phases if specification has changed

To regenerate all phases, manually delete tasks/ folder and phase entries in progress.json first.

To add work to existing phases, use `/add-work` instead.
```

---

## Task Sizing Rules

### Each Task MUST:
1. **Single outcome** - one coherent, independently verifiable result
2. **Verifiable** - has a concrete verification step
   that comes out false on the defect it guards; a verify that would pass on a broken system is
   rewritten (`PROJECT_CHARTER.md` § 10, *Verify reality*)
3. **Session-sized** - completable in <30 min of Claude time
4. **Deployable state** - code works after task completes
5. **No implicit continuation** - doesn't require "then do X"

### Sizing Checklist (for each task):
- [ ] Can I describe the deliverable in one sentence?
- [ ] Can I verify it with one command/action?
- [ ] Is the boundary determined by one outcome rather than an arbitrary file count?
- [ ] If I stop after this task, is code deployable?

**If any answer is NO → break it down further**

Before creating phases or tasks, render all existing planned, ongoing and deferred work. Reuse or
reshape non-terminal entries when they already represent the outcome. Build a dependency graph and
mark every independent safe lane for parallel execution; do not manufacture sequential tasks from
work that can run concurrently.

---

## Steps

### 1. Verify Prerequisites
Run the checks from the Prerequisites section above:
```
Checking prerequisites...
✓ Environment: Found in CLAUDE.md (AWS: {account}, Region: {region})
   — or, for a project that declares no AWS: ✓ Environment: no AWS (context_hints.aws = "none"), prefix {prefix}
✓ Plan: IMPLEMENTATION_PLAN.md approved
✓ Tasks: Not yet generated

Ready to generate tasks.
```

If any check fails, stop and report what's needed.

### 2. Read Specification
Read `IMPLEMENTATION_PLAN.md` thoroughly.

Identify:
- Major phases/milestones
- Features to implement
- AWS resources needed
- Backend/frontend components
- Dependencies between features

**Also read environment config** to use correct:
- Naming conventions in verify steps
- AWS region in resource ARNs
- Account number in resource ARNs (an MCP tool reference or profile name in the config is never
  copied into a task: § 6)

### 3. Create Phase Structure
For each major phase, create a task file:

```bash
tasks/
├── phase_1_foundation.md
├── phase_2_backend.md
├── phase_3_seeding.md
└── ...
```

### 4. Decompose Each Feature into Atomic Tasks

**BAD (too big):**
```json
{"id": "2.1", "name": "Implement user authentication"}
```

**GOOD (atomic):**
```json
{"id": "2.1", "name": "Create Cognito User Pool via CDK", "verify": "aws cognito-idp list-user-pools --max-results 10 --region eu-central-1 shows pool", "size": "small"},
{"id": "2.2", "name": "Add signup Lambda function", "verify": "Invoked with a new email it creates the user; the same email again is refused", "size": "small"},
{"id": "2.3", "name": "Add login Lambda function", "verify": "Invoked with valid credentials it returns a token; a wrong password is refused", "size": "small"},
{"id": "2.4", "name": "Create API Gateway auth endpoints", "verify": "POST /auth/signup returns 201 for a new email and 409 for a repeated one", "size": "medium"},
{"id": "2.5", "name": "Add JWT validation middleware", "verify": "Protected endpoint returns 401 without a token and 200 with a valid one", "size": "small"}
```

### 5. Add Required Fields to Each Task

```json
{
  "id": "2.3",
  "name": "Add login Lambda function",
  "status": "pending",
  "repo": "infrastructure",
  "size": "small",
  "verify": "Invoked with valid credentials it returns a token; a wrong password is refused",
  "deliverable": "infrastructure/lambda/auth/login.py",
  "depends_on": ["2.1"],
  "authored_by": "Claude",
  "assigned_to": "Claude"
}
```

**Required fields:**
- `id` - Unique identifier (phase.task format)
- `name` - One sentence description
- `status` - Always starts as "pending"
- `repo` - Which repo this task works in
- `authored_by` and `assigned_to` - who wrote the entry and whose job it is, on every phase and
  every task (stable executor names, never a model version; `/add-work` § *Collect Work Details*).
  The commit guard (`/progress-check`) refuses new work that lacks either.

**Recommended fields:**
- `size` - small/medium (no large tasks!)
- `verify` - How to confirm it works (use correct naming convention!)
- `deliverable` - Primary file(s) created/modified
- `depends_on` - Task IDs that must complete first
  - When a task's `verify` or `deliverable` names another task's deliverable (a path, a command,
    an artifact id), that task's id goes in `depends_on`. A dependency stated only in prose is
    invisible to `/open-work` and to whoever picks the next ready task, so the task looks ready
    before it is.

### 6. Use Environment Values in Verify Steps

**IMPORTANT:** Use actual environment values from config:

```json
// BAD - the generated task still carries an unresolved placeholder
{"verify": "aws dynamodb describe-table --table-name {TABLE_NAME}"}

// GOOD - the generated task carries values RESOLVED from THIS project's environment.
// Illustration for a project whose naming pattern is myproject-{service}-{env}:
{"verify": "aws dynamodb describe-table --table-name myproject-experts-dev --region eu-central-1"}
```

Resolve at generation time what is true on every machine, from the project you are generating for,
and nothing else:
- **The MCP handle and the AWS profile**: never write the MCP handle or an AWS profile into
  `verify`; the session that runs verify resolves both, by /check-aws Step 2. Both are nicknames,
  true on one machine only, and `progress.json` travels (`/start-session` § Two Environments): a
  project that moves to another host runs its old tasks' verify there. (Until 2026-10-24 this
  bullet said to resolve both here and write them in, which /check-aws Step 2's "Record nothing"
  forbids.)
- **The region**: every regional command carries `--region` with the region the resource lives
  in. A region is the same on every machine, so it travels.
- **The resource name**: construct it from the project's own naming convention in
  `input/environment.md`. A real resource name belonging to some other project is wrong even if
  the command would run.

### 7. Write Phase Task Files

For each phase, write `tasks/phase_X_name.md`:

```markdown
# Phase X: [Name]

## Overview
[Brief description of what this phase accomplishes]

## Prerequisites
- Phase X-1 complete
- [Other requirements]

## Environment
- AWS Account: [from env]
- Region: [from env]
- Naming: [from env]

## Tasks

### Task X.1: [Name]
- **Repo**: infrastructure
- **Size**: small
- **Deliverable**: infrastructure/lib/stacks/auth-stack.ts
- **Verify**: `cdk synth` succeeds

**Details:**
[Implementation notes, code patterns to follow, etc.]

### Task X.2: [Name]
...
```

### 8. Update progress.json

Add all generated tasks to progress.json:

```json
{
  "phases": {
    "phase_0_planning": {
      "name": "Planning & Setup",
      "status": "complete",
      "tasks": [...]
    },
    "phase_1_foundation": {
      "name": "Foundation",
      "status": "pending",
      "tasks": [
        {"id": "1.1", "name": "...", "status": "pending", "repo": "...", "size": "small", "verify": "..."},
        {"id": "1.2", "name": "...", "status": "pending", "repo": "...", "size": "small", "verify": "..."}
      ]
    },
    "phase_2_backend": {
      "name": "Backend",
      "status": "pending",
      "tasks": [...]
    }
  },
  "current_task": "1.1"
}
```

### 9. Verify Task Count and Coverage

Check:
- [ ] Every feature from IMPLEMENTATION_PLAN.md has tasks
- [ ] No task is larger than "medium"
- [ ] Every task has a verify step with actual resource names
- [ ] Dependencies are correctly specified
- [ ] Task order is logical
- [ ] Naming conventions match environment config

### 10. Commit Phase Definitions

```bash
git add tasks/ progress.json
git commit -m "phases: generate from specification

Phases: X
Total tasks: Y
Average per phase: Z

Environment:
- Account: {account}
- Region: {region}
- Naming: {pattern}

🤖 Generated with Claude Code"
```

---

## Output

After running this command:

```
## Phase Generation Complete

### Prerequisites Verified
- Environment: ✓ (Account: 123456789012, Region: eu-west-1)
- Specification: ✓ (IMPLEMENTATION_PLAN.md approved)
- Existing phases: ✓ (None found, generating fresh)

### Phases Created
| Phase | Name | Tasks |
|-------|------|-------|
| 1 | Foundation | 5 |
| 2 | Backend | 8 |
| 3 | Seeding | 12 |

### Task Summary
- Total tasks: 25
- Small tasks: 20 (80%)
- Medium tasks: 5 (20%)
- Large tasks: 0 (0%) ✓

### Files Created
- tasks/phase_1_foundation.md
- tasks/phase_2_backend.md
- tasks/phase_3_seeding.md
- progress.json (created)

### Ready to Start
- Continuing with task 1.1 - [name]
```

---

## Notes

- Run this ONCE after specification approval, before starting implementation
- Generate phases before coding; do not interleave the two
- Commit the phase files, then **continue with task 1.1 in the same session**. Generating tasks
  is a task boundary, not a session boundary (project CLAUDE.md, *Working Style*): announce the
  transition and keep going. Yield only for a declared checkpoint, a blocker, or an explicit stop.
  (Until 2026-09-15 this note said "end session", and a project session reported the
  contradiction with its own rules — it followed the rules, correctly.)
- If tasks need adjustment later, use `/add-work` to add tasks with sub-IDs
- Always use actual environment values, not placeholders
