# HYL Media

Personal media catalog — movies, music, books, sheet music. DynamoDB single-table design with Amplify Gen 2 frontend.

---

## Quick Reference

| Item | Value |
|------|-------|
| AWS Account | `299025166536` (alias: 299) |
| AWS Region | `eu-central-1` |
| AWS Profile | `vsb-299` (MCP tool parameter) · `JiHy__vsb__299` (Bash `aws` CLI) — same key, either name works in Bash |
| MCP Tool | `mcp__aws-mcp__aws___call_aws` — account via the tool parameter `aws_profile="vsb-299"`, region via `--region eu-central-1` inside `cli_command` (2+ calls: `mcp__aws-mcp__aws___run_script`) |
| Amplify App ID | `d2r70lavusnzlx` |
| Amplify URL | `https://main.d2r70lavusnzlx.amplifyapp.com` |
| GitHub Repo | `jirihylmar/hyl-media` |
| Stack | Amplify Gen 2 (React + TypeScript + AppSync + DynamoDB + S3 + Cognito) |
| Repo | Mono-repo (orchestration + app in one) |

## CRITICAL: AWS Access Rules

**USE MCP TOOL FOR ALL AWS OPERATIONS:**
```
mcp__aws-mcp__aws___call_aws     # one API call    — aws_profile is a TOOL PARAMETER, not a CLI flag
mcp__aws-mcp__aws___run_script   # two or more     — same aws_profile parameter
```

**The server is NOT pre-configured for this project — you must name the account and the region on every call.**

- **Account** comes from the tool parameter `aws_profile="vsb-299"`. Passing `--profile` *inside*
  `cli_command` is hard-rejected: `The following global arguments cannot be set: --profile`.
- **Omitting `aws_profile` does not error.** It silently returns account `030062527147` (`vsb-030`)
  with a 200 OK — a different AWS account. This is the single most dangerous mistake here.
- **Region must be explicit** as `--region eu-central-1` inside `cli_command` for every regional
  service (DynamoDB, S3, Lambda, AppSync, Amplify, CloudWatch). Both `vsb-299` and
  `JiHy__vsb__299` default to `eu-west-1`, where none of this project's resources exist — so
  forgetting it yields `ResourceNotFoundException`, which reads like a missing resource rather
  than a missing flag. `sts get-caller-identity` is global and is the one exemption.

**NEVER use:**
- `--profile ...` inside an MCP `cli_command` (hard-rejected)
- an MCP call with `aws_profile` omitted (silently hits the WRONG account, `vsb-030`)
- an MCP `cli_command` for a regional service without `--region eu-central-1`
- `aws` CLI in Bash without `--profile JiHy__vsb__299 --region eu-central-1`
- Default AWS profile (goes to WRONG account)
- `export AWS_PROFILE=...`
- Any hardcoded region other than `eu-central-1`

**ALWAYS verify before any AWS operation:**
```bash
# Via MCP (preferred)
mcp__aws-mcp__aws___call_aws  cli_command="aws sts get-caller-identity"  aws_profile="vsb-299"
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
/managed-resource        # DC resource lifecycle: create→sync→enrich→reconcile→edit/pin→approve→verify
/enrich-connections      # BLOCKED — do not run (built on the deleted cross-ref table; see the skill file)
/maintenance-agent       # Change/extend the operator agent (amplify/functions/agent) — trace, fix, deploy, verify
```

## Project Skills
| Skill | When to Use | Purpose |
|-------|-------------|---------|
| `/managed-resource` | Any DC resource lifecycle work | Create→sync→enrich→reconcile→edit/pin→approve→verify on the metadata-repository |
| `/enrich-connections` | **BLOCKED — do not run** | Relationship linking. Built on the deleted `KnowledgeGraphItem` cross-ref-row model; needs a relation-field writer before it can be rewritten (see the banner in the skill file) |
| `/maintenance-agent` | "Make the agent able to…" / "the agent doesn't…" / add a capability | Playbook to change the Phase 21 operator agent (`amplify/functions/agent/`): anatomy map, robustness invariants, change recipes, deploy + live-verify loop |

## Dublin Core metadata-repository (Phases 15–19 — PRIMARY store)
The catalog now lives in `hyl-media-metadata-repository` (DynamoDB) as **conformant DH sidecars**
(S3 `metadata/<category>/<uuid>/<file>.metadata.json`; content in `datasets/`+`documents/`). The
frontend reads/edits from this DC store via the metadata-api Lambda. The legacy `KnowledgeGraphItem`
table was **DELETED** in Phase 17.6e — the decommission is COMPLETE and nothing reads or writes it.
The full lifecycle (public/private Claude enrichment + S3 reconcile + structural conformance rules)
is the **`/managed-resource` skill** — use it for any DC resource work. **Source-of-truth rule:** the
S3 sidecar is authoritative; never leave a write DDB-only — reconcile with `scripts/sync-dc-to-s3.mjs`.

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

## Deployment
- **Auto-deploy**: Push to `main` triggers Amplify Hosting build
- **Build**: `npx ampx pipeline-deploy` (backend) + `npm run build` (frontend)
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
**ALL AWS operations via `mcp__aws-mcp__aws___call_aws`** (or `mcp__aws-mcp__aws___run_script` for
two or more calls), **account via the tool parameter `aws_profile="vsb-299"`.**
Never omit `aws_profile` (silent fallback to the WRONG account). Never put `--profile` in
`cli_command` (hard-rejected). In *scripts*, take the region from `AWS_REGION` rather than
hardcoding it; in an *MCP* `cli_command`, `--region eu-central-1` is REQUIRED.
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
**Exception (Phase 15+):** the `hyl-media-metadata-repository` table is created by the reused
Digital Horizon Python CLI (`tools/metadata-repository`), NOT Amplify, to stay byte-identical to
the reference system. Documented in IMPLEMENTATION_PLAN.md § Dublin Core Metadata Model.

### 7. Autonomous Execution & Independent Verification
Work through tracked tasks **without stopping** between them — complete a phase end-to-end,
committing after each task. **Verify every task independently** before marking it complete:
run the script, query DynamoDB via the MCP tool, run `npm run build`, and **byte-compare
against the reference solution** (`/home/ubuntu/digital-horizon-playbook`) where applicable.
For frontend work, inspect the running app yourself (Playwright installed; deployed app is
Cognito-gated — log in with the test account above). Do NOT ask the user to confirm work that
you can verify yourself. Only stop for genuine branch-point decisions that are the user's to make.

---

## Tool Preferences

| Task | Use | Not |
|------|-----|-----|
| Read files | `Read` | `cat` |
| Edit files | `Edit` | `sed` |
| Search files | `Glob`/`Grep` | `find`/`grep` |
| AWS operations | `mcp__aws-mcp__aws___call_aws` + `aws_profile="vsb-299"` + `--region eu-central-1` | `--profile` inside `cli_command`; omitting `aws_profile` |
