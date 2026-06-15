# Phase 21: Agent-Based Operator Panel

## Objective
Replace the traditional DC editor (superseded 18.4) with an **agent on the right** — a chat panel
where the operator types natural-language intents (e.g. **"add movie Easy Virtue"**) and an agent
does the whole job: **research → propose a plan → (operator approves once) → create the conformant
DC record, find/create related agents, link relationships, enrich, set external links, reconcile
S3.** Everything is agent-driven; no forms.

## Reference — mirror Digital Horizon's assistant
DH already has a production agent-with-tools pattern (`/home/ubuntu/digital-horizon-playbook`):
- Lambda: `amplify/functions/recordings/assistant/{handler,tools}.ts`
- Loop: `amplify/functions/recordings/_shared/assistant/{loop,registry}.ts`
  (one tool/turn, `disable_parallel_tool_use`, propose→confirm→execute, Cognito identity threaded)
- Frontend: `src/components/assistant/{AssistPanel,assistantChatClient}.ts(x)` (stateless backend,
  history client-side; apply-to-fields vs server-confirm)
- AppSync: `assistantChat` mutation (json messages/confirm/mode) → assistant Lambda
- DH derives metadata from UPLOADED transcripts and uses **no web search**.

## Net-new vs DH
hyl-media creates catalog entries **from a name, not uploaded content** → the agent must **research**
(`research_entity`). This is the one genuinely new capability; the rest wrap scripts we already have
(`enrich-dc.mjs`, `sync-dc-to-s3.mjs`, `build-dc-sidecar.mjs`/`entity-to-dc.mjs`, `repartition-agents`).

## Locked decisions (this session)
1. **Research source:** Claude knowledge + **Anthropic server-side web search tool**, then resolve
   Wikipedia/IMDB/MusicBrainz URLs.
2. **Autonomy:** **Plan → approve batch → execute.** Agent proposes the FULL plan (create movie +
   N persons + links + abstract + external links); operator approves once; agent executes all and
   returns a summary step-log. (Not per-write confirmation.)
3. **Progress UX:** **Step log** returned per turn (panel renders "searching…", "created person
   Jessica Biel…"); live streaming is a later enhancement.

## Architecture
```
AssistPanel (right side, global)  ──agentChat mutation──►  agent Lambda (Claude tool-use loop)
  • chat input + step log                                    • key from Secrets Manager
  • renders the PLAN + Approve/Decline                        • Cognito sub/groups → every tool
  • stateless; history client-side                           • web search (research) + DC tools
                                                             • plan→approve→execute batch
        DC tools operate on  hyl-media-metadata-repository (DDB)  +  S3 sidecars (agents/datasets/documents)
        every run ends with the conformance audit (scripts/audit-dc-conformance.mjs rules) green
```

## Tasks (atomic; ≤3 files; deployable after each)
- **21.1 Agent Lambda + tool-use loop + `agentChat` mutation (skeleton).** Port DH `loop.ts`
  (one tool/turn, plan-gating); Secrets Manager key; Cognito-gated mutation; returns a step-log JSON.
  One read tool (`search_catalog`) to prove the loop. *Verify:* round-trip a turn; agent reads the catalog.
- **21.2 Read tools.** `search_catalog(query)`, `get_resource(id)`, `find_agent(name)` (fuzzy resolve
  existing person/band). Non-mutating, inline. *Verify:* "is Easy Virtue in the catalog?", "find Colin Firth".
- **21.3 `research_entity` tool (web search + extraction).** Anthropic web-search tool + structured
  extraction → `{kind,title,year,creators[],contributors[],genre,language,links[],disambiguation[]}`.
  *Verify:* "Easy Virtue" → 2008 (Stephan Elliott) vs 1928 (Hitchcock) disambiguation, then full facts.
- **21.4 Plan assembly + approval protocol.** Agent composes ONE structured plan (create movie;
  create N missing person agents; link cast/director; enrich; links) → returns `awaiting_approval`;
  operator approves once → loop executes the batch. *Verify:* plan lists movie + new persons + links.
- **21.5 Write tool: `create_resource`.** Conformant emit (build-dc-sidecar/entity-to-dc) → S3 sidecar
  + DDB sync, correct partition + dc_type per kind (agents/Agent for agents). *Verify:* Easy Virtue movie
  record created, conformant, appears in Movies list; audit passes.
- **21.6 Write tools: `find_or_create_agent` + `link_relationship`.** Create missing cast/director as
  agents (agents/, dc_type=Agent); set dc_creator/dc_contributor + `_cast_uris`/`_performer_uris`.
  *Verify:* cast persons created + linked; person filmography reverse-edge resolves.
- **21.7 Write tools: `enrich_resource` + `set_external_links` + `reconcile`.** Wrap the enrich-dc
  engine (public/private + pinning), write wiki/imdb links, run `sync-dc-to-s3`. *Verify:* movie gets
  abstract + links; sidecar reconciled; audit ALL PASS.
- **21.8 Frontend AssistPanel (right side, global).** Port DH AssistPanel + client; collapsible
  right-side chat on every page; renders step-log + the plan with Approve/Decline; stateless history.
  *Verify (Playwright):* "add movie Easy Virtue" in the deployed app → research → plan → approve →
  execution summary; movie + cast appear in lists with abstract.
- **21.9 Edit/regenerate/approve as tools (realizes superseded 18.4 + 18.5).** `update_metadata(id,
  fields)` (SET + pin to `_explicit_fields`), `regenerate(id)` (non-pinned refresh), `approve(id)`
  (`_approval_status=approved`). *Verify:* "set Easy Virtue abstract to …" pins it; regenerate
  preserves the pin; approve sets status.
- **21.10 Guardrails + identity + cost (realizes 18.6).** Cognito sub/groups threaded to tools (same
  gates as direct writes); per-run token/cost logged; prompt caching on system+tools; post-execution
  conformance audit. *Verify:* unauthorized blocked; cost/usage report; full E2E audit ALL PASS.

## Guardrails
- Key only from Secrets Manager `hyl-media/anthropic-api-key`; never logged/committed. **Rotate it.**
- Every executed plan ends with the structural conformance audit green (no off-spec records).
- Writes go DDB + S3 sidecar together (source-of-truth rule) — reuse `sync-dc-to-s3`.
- Disambiguation (e.g. two "Easy Virtue" films) → the agent asks before creating.
