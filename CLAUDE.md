# HYL Media

Personal media catalog — movies, music, books, sheet music. DynamoDB single-table design with Amplify Gen 2 frontend.

---

## Quick Reference

| Item | Value |
|------|-------|
| AWS Account | `299025166536` (alias: 299) |
| AWS Region | `eu-central-1` |
| AWS Profile | `JiHy__vsb__299` |
| MCP Tool | `mcp__aws-vsb-299__call_aws` |
| Amplify App ID | `d2r70lavusnzlx` |
| Amplify URL | `https://main.d2r70lavusnzlx.amplifyapp.com` |
| GitHub Repo | `jirihylmar/hyl-media` |
| Stack | Amplify Gen 2 (React + TypeScript + AppSync + DynamoDB + S3 + Cognito) |
| Repo | Mono-repo (orchestration + app in one) |

## CRITICAL: AWS Access Rules

**USE MCP TOOL FOR ALL AWS OPERATIONS:**
```
mcp__aws-vsb-299__call_aws
```

This MCP tool is pre-configured with profile `JiHy__vsb__299` and region `eu-central-1`.

**NEVER use:**
- `aws` CLI without `--profile JiHy__vsb__299 --region eu-central-1`
- Default AWS profile (goes to WRONG account)
- `export AWS_PROFILE=...`
- Any hardcoded region other than `eu-central-1`

**ALWAYS verify before any AWS operation:**
```bash
# Via MCP (preferred)
mcp__aws-vsb-299__call_aws sts get-caller-identity
# Must return account 299025166536

# Via CLI (if MCP unavailable)
aws sts get-caller-identity --profile JiHy__vsb__299 --region eu-central-1
```

**INCIDENT HISTORY:** First session deployed to wrong account (182059100462/eu-west-1) using default profile. Required full cleanup and reimport. This rule exists to prevent recurrence.

---

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

## Testing

**Tests are mandatory before any pull request.**

```bash
npm test          # Run all tests (must pass before PR)
npm run test:watch  # Watch mode during development
```

- **Framework**: Vitest + React Testing Library + jsdom
- **Test files**: Co-located with source (`*.test.ts`, `*.test.tsx`)
- **Setup**: `src/test/setup.ts` (jest-dom matchers), `src/test/mocks.ts` (data factories)
- **Coverage**: Tag dictionary, SoundtrackManager, TagManager, CreateEntityForm

When adding new features or components, add corresponding tests.

## Deployment
- **Auto-deploy**: Push to `main` triggers Amplify Hosting build
- **Build**: `npx ampx pipeline-deploy` (backend) + `npm run build` (frontend)
- **Pre-deploy checklist**: Run `npm test` — all tests must pass
- **URL**: https://main.d2r70lavusnzlx.amplifyapp.com
- **Test account**: jiri.hylmar@gmail.com / HylMedia123!

---

## Session Workflow

### Before Starting
1. Run `/start-session`
2. **Verify AWS account via MCP** — must be 299025166536
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
**Pushes**: At meaningful boundaries (triggers auto-deploy).

### 7. Tests MUST Pass Before Pull Requests
**Run `npm test` before creating any pull request.** All tests must pass.
- If tests fail, fix the issue before pushing or creating a PR.
- Never skip tests or merge with failing tests.
- When adding new features or components, add corresponding tests.

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

### 1. AWS Account — USE MCP TOOL
**ALL AWS operations via `mcp__aws-vsb-299__call_aws`.**
Never use default profile. Never hardcode regions in scripts.
Account: 299025166536, Region: eu-central-1.

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
| AWS operations | `mcp__aws-vsb-299__call_aws` | `aws` CLI without profile |
