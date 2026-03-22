# HYL Media

Personal media catalog — movies, music, books, sheet music. DynamoDB single-table design with Amplify Gen 2 frontend.

---

## Quick Reference

| Item | Value |
|------|-------|
| AWS Account | `299` |
| AWS Region | `eu-central-1` |
| Naming | `hyl-media-{component}-{env}` |
| Stack | Amplify Gen 2 (React + TypeScript + AppSync + DynamoDB + S3 + Cognito) |
| Repo | Mono-repo (orchestration + app in one) |

## Commands
```
/start-session           # Begin work session with verification
/update-progress         # Save progress at end of session
/generate-phases         # Create progress.json from approved plan
/generate-architecture   # Generate architecture diagram
/setup                   # Environment + repository setup
/add-work                # Add phases or tasks mid-project
/check-aws               # Verify AWS resources
```

## Key Files
| File | Purpose | Updates |
|------|---------|---------|
| `IMPLEMENTATION_PLAN.md` | Specification (architecture, design) | Rarely |
| `progress.json` | Task state - **SINGLE SOURCE OF TRUTH** | Every session |
| `tasks/phase_*.md` | Task implementation details | When tasks added |
| `session_notes.md` | Session history log | Every session |
| `input/` | Original requirements and input materials | Read-only, gitignored |

## Project Structure
```
hyl-media/
├── amplify/                  # Amplify Gen 2 backend definitions
│   ├── data/resource.ts      # DynamoDB schema (AppSync)
│   ├── auth/resource.ts      # Cognito config
│   └── storage/resource.ts   # S3 config
├── src/                      # React + TypeScript frontend
├── scripts/                  # Data import scripts
├── input/                    # Source materials (gitignored)
├── tasks/                    # Task details per phase
├── IMPLEMENTATION_PLAN.md
├── progress.json
└── session_notes.md
```

---

## Session Workflow

### Before Starting
1. Run `/start-session`
2. Verify AWS account matches
3. Check last completed task still works
4. Review context budget

### During Session
- Complete **AT LEAST ONE** task perfectly
- Leave codebase in **deployable state**
- Don't start tasks you can't finish

### Context Budget
Check with `/context`:
- **<40%**: Start any task
- **40-60%**: Small/medium tasks only
- **60-80%**: Finish current, then wrap up
- **>80%**: Update progress.json and end session

---

## Progress Rules

**progress.json is append-only for tasks.**

### ALLOWED:
- Change task `status`
- Add timestamps, artifacts, notes
- Add NEW tasks with sub-IDs (2.3a, 2.3b)

### NEVER:
- Remove tasks (mark `superseded` instead)
- Reorder or rename tasks
- Change task IDs

---

## Git Discipline

**Commits**: After completing each task.

**Pushes**: At meaningful boundaries, not after every commit.

---

## Task Sizing

Before adding task to progress.json:
- [ ] Single deliverable (one sentence)?
- [ ] Verifiable (one command/action)?
- [ ] ≤3 files touched?
- [ ] Deployable state after completion?

**If any NO → break it down further**

---

## Critical Rules

### 1. AWS Account Verification
**ALWAYS verify before any AWS operation.**
Must match account `299` / region `eu-central-1`

### 2. Pre-Work Verification
Before starting NEW work:
1. Find last `complete` task in progress.json
2. Run its `verify` step
3. If FAILS → fix before proceeding

### 3. Context Management
Check `/context` before significant work. If low:
1. Run `/update-progress`
2. Update `session_notes.md`
3. Commit all changes
4. End session

### 4. Verify Against Real Data
Before marking tasks complete, run against real data. Verify each component.

### 5. Use Project Methods
Use IMPLEMENTATION_PLAN.md, progress.json, tasks/ — not ad-hoc files.

### 6. Infrastructure via Amplify
All infrastructure managed by Amplify Gen 2 (`amplify/` definitions). No direct AWS CLI resource creation.

---

## Tool Preferences

| Task | Use | Not |
|------|-----|-----|
| Read files | `Read` | `cat` |
| Edit files | `Edit` | `sed` |
| Search files | `Glob`/`Grep` | `find`/`grep` |
