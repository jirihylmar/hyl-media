---
description: Change or extend the hyl-media operator agent (the Claude tool-use Lambda) — add/improve what it fills in on create, add new tools/capabilities (e.g. delete with orphan cleanup), end-to-end with deploy + live verify (project)
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
  - Write
  - mcp__aws-mcp__aws___call_aws
  - mcp__aws-mcp__aws___run_script
---

# Maintenance Agent

The playbook for **changing the competence of the operator agent** — the Claude tool-use Lambda in
`amplify/functions/agent/` that the frontend `AssistPanel` drives. Use this whenever the request is
"make the agent able to …" / "the agent doesn't … when it should" / "add a capability to the agent".

The agent is NOT a script you run; it is a deployed Lambda that runs an Anthropic Messages tool-use
loop. Improving it = editing tool definitions, the system prompt, the write/emit path, or the
frontend glue — then **deploying the backend and verifying live**. The whole point of this skill is
that those edits land in *every* layer the change touches, never break the two robustness pillars,
and keep the S3 sidecar authoritative. A half-applied change (e.g. a new field in the plan schema
but not in the emit) ships a silently broken agent.

> **AWS:** every AWS read/write goes through `mcp__aws-mcp__aws___call_aws` (or
> `mcp__aws-mcp__aws___run_script` for two or more calls). The account is the **tool parameter**
> `aws_profile="vsb-299"` — never a `--profile` flag inside `cli_command`, which is hard-rejected.
> Account `299025166536`; region `eu-central-1`, which must be given as `--region eu-central-1`
> inside `cli_command` (the profile's own default is `eu-west-1`). Verify identity first, and never
> omit `aws_profile` — that silently reaches the WRONG account.

---

## The agent's anatomy — the file map

Always start by locating the change in this map. A field/capability usually touches **several** of
these; the recipes below say which.

| File | Role | Touch it when… |
|------|------|----------------|
| `amplify/functions/agent/handler.ts` | Lambda entry + **`SYSTEM_INSTRUCTIONS`** (the agent's prompt/workflow), Secrets Manager key fetch, async dispatch/worker/poll envelope, cost log. | Changing *what the agent is told to do*, the add-resource workflow, model, timeout-bound behavior. |
| `amplify/functions/agent/assistant.ts` | Pure contract: `ToolDefinition`, `ToolRegistry`, `OperatorContext`, `canRead`/`canWrite` auth gate. **`mutating` flag lives here.** | Changing auth tiers or the tool/registry shape. Rarely. |
| `amplify/functions/agent/tools.ts` | **Read tools** (`search_catalog`, `get_resource`, `find_agent`), the `ToolDeps` factory, and **`buildRegistry`** (where every tool is registered). | Adding ANY tool (read or write) — it must be registered here. Adding read/lookup capability. |
| `amplify/functions/agent/research.ts` | `research_entity` — web-search sub-agent + structured extraction (`RESEARCH_SCHEMA`). This is where facts (year, links, creators, genre) are *gathered*. | The agent isn't gathering a field (e.g. links/genre) — fix the schema + research/extract prompts here. |
| `amplify/functions/agent/writes.ts` | **All mutations.** `commit_plan` (`PLAN_SCHEMA`, `parsePlan`, `executePlan`), the create executor (`createResource`), relationship edges (`appendRelation`), `patchAttributes`/`setExternalLinks`/`enrichResource`, and the edit tools (`update_metadata`/`regenerate`/`approve`, `EDITABLE` set). | The agent isn't *writing* a field it gathered; adding/changing what create persists; adding a new mutating tool (delete, etc.). |
| `amplify/functions/agent/dc-emit.ts` | Conformant DC emit: `EmitInput`, `buildRecord` (the 28 canonical Attributes + hyl extensions), `kindSpec`, `derivedId` (idempotent id), ASCII fold/slug. | Adding a NEW persisted field to the record shape, a new kind, or changing identity/slug. |
| `amplify/functions/agent/loop.ts` | The tool-use loop: runs read tools inline, **STOPS on the first mutating tool** for approval, caches tools, step-log. | Changing loop mechanics, iteration bound, parallel-tool policy. Rarely. |
| `amplify/functions/agent/resource.ts` | `defineFunction` — name, **timeout (300s)**, memory, env (`METADATA_TABLE`, `ANTHROPIC_SECRET_ID`, `ANTHROPIC_MODEL`). | Changing model, timeout, memory, env. |
| `amplify/data/resource.ts` | AppSync wiring: `agentChat` mutation + `getAgentTurn` query (both `allow.authenticated()`, `a.json()`). | Changing the API surface/args/auth of the agent. |
| `src/lib/agentClient.ts` | Frontend transport: dispatch+poll, history reduction, **`describeProposed`** (human label per mutating tool). | Adding a mutating tool → add its label here so the approval prompt reads well. |
| `src/components/AssistPanel.tsx` | The chat UI: renders `assistantText`, the step-log, and the approve/decline gate. | Changing how proposals/steps render. |

---

## The invariants — break one and the change is NOT flawless

These are the rules that make the agent trustworthy. Every change must preserve all of them.

1. **Propose → approve → execute.** Any tool that changes state MUST set `mutating: true`. The loop
   never executes a mutating tool inline — it stops and returns `awaiting_approval` with the proposed
   plan; the operator approves once; only then does the handler run. A new write capability that
   isn't `mutating: true` is a security bug. Read/lookup tools are `mutating: false`.
2. **S3 sidecar is authoritative; never leave a write DDB-only.** Every mutation writes BOTH the DDB
   item AND the S3 `metadata/<category>/<uuid>/<slug>.json.metadata.json` sidecar (read-modify-write
   preserving key order). Use the existing helpers — `createResource`, `patchAttributes`,
   `appendRelation`, `setExternalLinks` — which already do both. A new mutation that touches only DDB
   will be clobbered on the next S3 re-sync. (CLAUDE.md source-of-truth rule.)
3. **Conformant emit.** New records go through `buildRecord` (`dc-emit.ts`) so the 28 canonical
   Attributes stay in DH order with hyl extensions appended. Adding a persisted field = adding it to
   `EmitInput` + `buildRecord` (in the extensions block, never reordering the 28), then plumbing it
   through `resourceToEmitInput`/`executePlan`. Re-run the conformance audit after (below).
4. **Idempotency by derived id.** `derivedId(entityKind, title, year)` makes create idempotent;
   `createResource` reuses an existing row's language for a stable SK and deletes stale-SK duplicates.
   Don't introduce a write path that bypasses this and duplicates rows.
5. **Never invent.** The system prompt forbids inventing ids/titles/dates/cast/links. Any new
   gather/extract path must keep "use '' / [] when the source doesn't establish it" and "ask to
   disambiguate rather than guess" (see `research.ts` `needs_disambiguation`).
6. **Operator pins are sacred.** `_explicit_fields` lists operator-pinned fields; `enrichResource`
   and `regenerate` must skip them. Any new auto-fill must honor `_explicit_fields`.
7. **Prompt cache prefix stays stable.** `SYSTEM_INSTRUCTIONS` and the tool list carry
   `cache_control` breakpoints; volatile `surfaceContext` goes AFTER the breakpoint. Keep the stable
   prefix stable — don't interpolate per-request data into `SYSTEM_INSTRUCTIONS`.

---

## Procedure (every change)

1. **Verify AWS** — `mcp__aws-mcp__aws___call_aws  cli_command="aws sts get-caller-identity"  aws_profile="vsb-299"`
   → must be `299025166536`.
2. **Locate** the change in the anatomy map. List *every* layer it touches (gather → schema → emit →
   prompt → register → frontend label). Trace the data flow end-to-end before editing.
3. **Edit all layers** in one pass. Match surrounding style and comment density.
4. **Typecheck/build.** `npm run build` (or for backend-only TS, the loop verify below catches
   wiring). Fix every error before deploying.
5. **Test against the loop** — see Verify. Read tools and mutating tools both have a no-network test
   path (mock Claude + live DDB).
6. **Deploy** — commit, push to `main`; Amplify Hosting builds backend+frontend (jobs in the console,
   e.g. job 78/79). Watch the job to `SUCCEED` — a backend Lambda change only takes effect after the
   job completes. (Backend-only: `npx ampx pipeline-deploy --branch main --app-id d2r70lavusnzlx`.)
7. **Verify live** — drive the deployed agent through `AssistPanel` (Cognito-gated; log in with the
   test account), then confirm both stores via MCP. Run the conformance audit if a record shape
   changed.
8. **Track** — commit per task; update `progress.json`/`session_notes.md` per the project rules.

---

## Recipe A — improve/extend what the agent FILLS IN on create

> Example: "when inserting a movie (or any resource/agent) the agent doesn't fill in external links
> (IMDb, Wikipedia) and tags."

This is a **data-flow trace across four layers** — a field is missing because one link in the chain
drops it. Walk the chain for the field in question:

1. **Gather** — `research.ts`: is the field in `RESEARCH_SCHEMA` and asked for in the `research` +
   `extract` system prompts? Links and genre already are; if a new field, add it to the schema and
   tell the research/extract prompts to populate it from authoritative sources only.
2. **Plan** — `writes.ts` `PLAN_SCHEMA` + `parsePlan`: does the plan carry the field from research to
   commit? `resource.external_links` and `resource.genre` exist; ensure new fields are in the schema
   and validated.
3. **Prompt** — `handler.ts` `SYSTEM_INSTRUCTIONS`: does the workflow tell the agent to *carry* the
   researched value into the plan? The classic cause of "it researched links but didn't save them" is
   the prompt not instructing it to put `research_entity.links` into `commit_plan.resource.external_links`
   (and `genre` → tags). Add an explicit step: "Carry the authoritative links and genre from
   research_entity into the plan's external_links and genre — do not drop them."
4. **Persist** — `writes.ts` `resourceToEmitInput` + `executePlan` + `dc-emit.ts buildRecord`: is the
   field actually written to both stores? `executePlan` already calls `setExternalLinks` when
   `plan.resource.external_links` is present and maps `genre → _tags`. For a brand-new persisted
   field, add it to `EmitInput`, set it in `buildRecord` (extensions block), and plumb it through
   `resourceToEmitInput`. For agents (people/bands), note the create in `executePlan` step 3 passes
   only `roles`/`tags`/`relations` — if links/tags should land on *agents* too, extend that call.

**Tip:** the fastest way to find the broken link is to run a live turn and read the persisted record
via MCP — whichever layer's value is empty is the one to fix. Don't guess; trace.

After: redeploy, run a live create, and confirm `_external_links` / `_tags` (and any new field) are
present in BOTH the DDB item and the S3 sidecar.

---

## Recipe B — add a NEW capability/tool (e.g. delete with orphan cleanup)

> Example: "delete the movie The Da Vinci Code, and also delete the actors who don't appear anywhere
> else." Generalize to any asset (movie/recording/book/sheet music) and its linked agents.

Adding a tool is mechanical once you respect the pillars:

1. **Define the tool** in the right file — a mutation belongs in `writes.ts`. Set **`mutating: true`**,
   a precise `description` (Claude reads it), and a tight `inputSchema`. The handler checks
   `canWrite(operator)` first and returns `{ content, summary, isError }`.
2. **Implement both-stores writes** with the existing helpers, or new ones that mirror them
   (DDB + S3 sidecar, both, always). For delete: remove the DDB row(s) for the PK (use
   `queryAllByPK`) AND the S3 sidecar (and content object if non-virtual) — `DeleteObjectCommand`.
3. **Register** it in `tools.ts` `buildRegistry`.
4. **Frontend label** — add a human label to `describeProposed` in `src/lib/agentClient.ts` (e.g.
   `delete_resource: 'Delete this resource and any orphaned agents'`) so the approval prompt reads well.
5. **Prompt** — add a workflow note to `SYSTEM_INSTRUCTIONS` so the agent knows when/how to use it
   (e.g. "To delete a resource: find it with search_catalog/get_resource to get its id, then call
   delete_resource(id). It is approval-gated like every write.").

### The orphan-cleanup rule (delete, specifically)

An agent (person/band/collaboration) is **orphaned** after deleting resource R when **no other
record references it**. References to check across the whole table (the agent's logical URI and its
title both appear in different edge fields):

- forward edges on resources: `_cast_uris`, `_performer_uris` (URIs), `dc_creator`,
  `dc_contributor` (names);
- the agent's own reverse `dc_relation` would point only at R.

Algorithm for `delete_resource(id, { cascade_orphans = true })`:

1. `get_resource(id)` → collect its linked agent URIs (`_cast_uris` + `_performer_uris`) and
   creator/contributor names.
2. Delete R: DDB row(s) for the PK + S3 sidecar (+ content object if not `_virtual`).
3. For each linked agent: scan the table for *any other* record (PK ≠ deleted ones) whose
   `_cast_uris`/`_performer_uris` contains the agent URI, or whose `dc_creator`/`dc_contributor`
   contains the agent name. **If none → delete the agent** (DDB + S3). **If some remain →** keep the
   agent but `appendRelation`-style remove R's URI from its `dc_relation` (both stores) so no dangling
   edge survives.
4. Return a summary: resource deleted, N agents deleted, M agents kept (edges cleaned).

**Make it one approval.** Like `commit_plan`, do the whole cascade inside the single mutating tool's
handler so the operator approves once and the batch executes server-side — don't emit a chain of
separate mutating calls.

**Safety:** deletion is destructive and hard to reverse. Confirm the target by `get_resource` before
deleting; never delete by fuzzy name alone (resolve to an id first). Consider logging the deleted
sidecars' JSON to the step-log/console so an accidental delete is recoverable.

---

## Verify

Choose the checks the change needs; do all that apply.

- **Build / typecheck:** `npm run build`. Backend TS wiring errors surface here and in the loop test.
- **Loop test (no network, live DDB)** — `scripts/verify-agent-loop.mts` drives the REAL
  `runAssistantTurn` + `buildRegistry` against the live table with a *mock Claude* that emits the
  tool_use you want to exercise. Extend it (or copy to a scratch `scripts/verify-agent-<change>.mts`)
  to mock the new tool's `tool_use`, and for a mutating tool, the follow-up `approval` signal. Run:
  `AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 npx tsx scripts/verify-agent-<change>.mts`.
  For destructive tools, point it at a throwaway record you created for the test, and assert via MCP
  that both stores changed as expected.
- **Conformance audit (record-shape changes):** `npm run audit:dc` (and/or
  `node scripts/audit-dc-conformance.mjs`) — must stay ALL PASS. A new persisted field must not break
  the 28-key order.
- **Live E2E (always, after deploy):** wait for the Amplify job to `SUCCEED`, open
  `https://main.d2r70lavusnzlx.amplifyapp.com`, log in (test account in CLAUDE.md / Quick Reference),
  open the AssistPanel, issue the natural-language command, watch the propose → approve → execute
  step-log, then **confirm both stores via MCP**:
  - DDB: `mcp__aws-mcp__aws___call_aws` with
    `cli_command="aws dynamodb query ... --region eu-central-1"` (or scan-filter) and
    `aws_profile="vsb-299"`, on `hyl-media-metadata-repository` for the PK.
  - S3: same tool with `cli_command="aws s3api get-object ... --region eu-central-1"` /
    `list-objects-v2` on the sidecar key under `metadata/<category>/<uuid>/`.
    (Playwright is installed for the gated UI.)

---

## Related skills

- `/managed-resource` — the operator-facing DC resource lifecycle (create→sync→enrich→reconcile→
  edit/pin→approve→verify). The agent's write path mirrors it; when changing what the agent persists,
  keep both in lockstep and reuse its conformance rules.
- `/enrich-connections` — detect + add knowledge-graph connections for new entities (the relationship
  edges the agent's `commit_plan` also writes).

## Completion checklist

- [ ] AWS identity verified `299025166536` before any AWS call.
- [ ] Every layer the change touches was edited (gather → schema → emit → prompt → register →
      frontend label, as applicable).
- [ ] All invariants hold: mutating tools are `mutating: true`; every write hits DDB **and** S3;
      records go through `buildRecord`; pins honored; cache prefix stable.
- [ ] `npm run build` clean; loop/scratch verify passes; conformance audit ALL PASS (if shape changed).
- [ ] Deployed — Amplify job `SUCCEED`ed; agent change is live.
- [ ] Live E2E driven through AssistPanel; both stores confirmed via MCP.
- [ ] Committed per task; `progress.json` + `session_notes.md` updated.
