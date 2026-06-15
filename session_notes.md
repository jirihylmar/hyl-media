# Session Notes

This file tracks session history for context continuity between Claude Code sessions.

---

## ⮕ NEXT SESSION — START HERE (handover 2026-06-15, updated)

**State:** Phases 0–16 complete. Phase 17 (frontend DC cutover) **17.1–17.5 complete**;
**17.6 deferred** (decommission legacy — blocked + destructive, needs approval). Phase 18
(DC lifecycle/enrichment): **18.1 engine + 18.2 pinning + 18.3 batch-enrichment COMPLETE** —
**all 1194 DC records now have dc_abstract + refined dc_subject** (0 failures; 520 public /
521 private; ~$7.3 Opus 4.8). 18.4–18.6 pending. Deploy pipeline healthy (jobs 55–65 green).
DC store = `hyl-media-metadata-repository` (1194 records).

**Resume work, in order:**
1. **18.4** — frontend DC editor: edit `dc_title`/`dc_abstract`/`dc_subject`/`dc_creator`, pin
   edited fields into `_explicit_fields` via the `updateMetadata` mutation (already deployed).
   DH allowlist = `UPDATABLE_DC_FIELDS`; SET-only writes.
2. **18.5–18.6** — regenerate (non-pinned only) + approve (`_approval_status=approved`) mutations;
   end-to-end lifecycle verify + cost/usage report.
3. **17.6** — only after the create path (CreateEntityForm/AssetUpload) + Dossier cross-refs move
   to DC; destructive (export backup first) → get explicit user approval.

**18.3 enrichment — DONE, how it works (`scripts/enrich-dc.mjs`):**
- `classifyVisibility(a)`: PUBLIC iff a *resolved* authoritative link exists
  (wikipedia/imdb/musicbrainz/openlibrary/goodreads/discogs/databazeknih). **nkp + supermusic are
  auto-generated SEARCH urls** (present on every book / every sheet) → excluded; youtube weak → excluded.
- `readPdfMetadata(a)`: `pdfinfo` over the S3 PDF (book/sheet_music) → embedded Title/Author/Subject/Pages,
  fed into the prompt. Graceful null on non-PDF or non-conformant files (e.g. the user's own "Scales - macro").
- Prompt branches: **public** → world knowledge OK (as movies); **private** → STRICTLY record fields +
  embedded metadata, no fabricated facts (thin info → short plain description).
- Writes a `public`/`private` curation tag into `_tags` (also added to `tagDictionary.ts`).
- Run again for any new empty-abstract records: `node scripts/enrich-dc.mjs [--kind <k>] --apply` (idempotent).
- **KNOWN DIVERGENCE:** writes are **DDB-only**; the S3 sidecars still hold empty `dc_abstract`. A CLI
  `update-metadata` re-sync from S3 would clobber the enrichment → re-emit sidecars from current DDB data
  first. Frontend reads DDB (Phase 17), so the live app is correct.

**Key facts for the next session:**
- Anthropic key: Secrets Manager `hyl-media/anthropic-api-key` (ARN …-KBL4LX). **Rotate it** — it
  was pasted in chat once. Model used: `claude-opus-4-8`, structured outputs, effort low.
- DC table Lambda (for spot-checks): `amplify-d2r70lavusnzlx-ma-metadataapilambda72099A2-oojXNsn35cPO`.
  Bucket: `amplify-d2r70lavusnzlx-ma-hylmediastoragebucketefb-p0iq0m7stthq`.
- KnowledgeGraphItem (legacy, still live): `KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE`.
- Verify frontend: `node scripts/verify-frontend-{dc,detail,dossier}.mjs` (Playwright login).
- Tasks file: `tasks/phase_18_dc_lifecycle_enrichment.md`; mapping spec `docs/dc-metadata-mapping.md`.

---

### Session: 2026-06-15 (cont.) — Phase 20: agent entities re-typed (dc_type=Agent) + agents/ partition

User flagged (viewing a person's sidecar via the metadata link): `ContentType: DATASET` / `dc_type:
Dataset` is wrong — "its not dataset" — a person isn't a dataset. Clarified: KEEP persons/bands
(don't lose them); their metadata just needs to make sense. Decision: type agents per **DC Terms**
(`dc_type=Agent` = dcterms:Agent — the DCMI Type Vocabulary has no agent type) and **move the
partition to `agents/`**.

**20.1 — re-type + repartition (non-destructive of data):**
- Source-of-truth scripts: `dc-paths.mjs` (CATEGORIES += `agents`; `AGENT_ENTITY_TYPES` →
  categoryForEntityType returns `agents`); `entity-to-dc.mjs` (`ENTITY_DC` person/band/collaboration
  → dcType `Agent`, ContentType `PERSON`/`BAND`/`COLLABORATION`; descriptor branch emits to `agents/`).
  Self-tests updated + pass.
- Live migration `scripts/repartition-agents.mjs`: for each of the 509 agent records — copy descriptor
  + rewrite sidecar to `agents/<uuid>/…`, update DDB in place (s3_key, ContentType, _category,
  dc_source_uri, dc_type, bump _last_updated_at), delete the old `datasets/` objects. Idempotent
  (skips records already in `agents/`). **509 moved, 0 errors.** Verified: 509 records `_category=agents`
  & `dc_type=Agent`; 0 agents left in `datasets/`; Staša Bartůňková sidecar keeps its enriched
  dc_abstract/subjects/_tags, first 28 keys still canonical. **Nothing lost** — same PK/SK/uuid.
- Cross-reference URIs in movies/recordings still point at `datasets/<uuid>` cosmetically but RESOLVE
  fine — the frontend keys on the uuid (`pkFromUri` ignores the category). (Could rewrite them as a
  cleanup; not needed for correctness.)

**20.2 — frontend + storage + docs:** `dcClient.ts` `DC_TYPE_BY_KIND` agents → `Agent`
(listMetadataByType('Agent') + `_entity_kind` narrowing keeps person/band/collaboration separate);
`storage/resource.ts` grants `agents/*` read; `audit-dc-conformance.mjs` accepts `agents` + `Agent`;
managed-resource skill + architecture README/diagram updated. tsc clean. Re-audit ALL PASS.

**Movies stay `MovingImage`/datasets, recordings `Sound`/datasets, books/sheet `Text`/documents —
only the agents moved.** Deploy + live list verification follow.

---

### Session: 2026-06-15 (cont.) — Phase 19: conformance, S3 reconcile, managed-resource skill, metadata link

User asks: (1) prove the S3 structure + sidecar content match the DH example *following exact rules*
(the WHOLE structure, not just dc_* terms); (2) a `managed-resource` workflow skill (usable here +
mirrors a future frontend dialog); (3) a metadata link next to each resource in the frontend;
(4) run `/generate-architecture` at the end.

**19.1 — Full structural conformance audit (`scripts/audit-dc-conformance.mjs`):** encodes the
ENTIRE example ruleset — top-level keys, `DocumentId===id`, `SK===sort_key`, SK shape `#<lang>#<slug>`,
`Title`/`ContentType` non-empty, the **canonical 28 `Attributes` keys present IN ORDER** (checked on
the S3 sidecar — DDB maps are unordered), `dc_type` ∈ DCMI set, `_category` ∈ {audio,datasets,documents},
`dc_source_uri` derivation, field types, DDB-mirrors-sidecar. Read all 1194 S3 sidecars → **ALL PASS,
0 unreadable.** Verified against `/home/ubuntu/digital-horizon-playbook/.../recordings/_shared/metadata.ts`
+ `docs/metadata-repository-producers.md` (canonical example). hyl-media uses datasets+documents
categories (no audio — legitimate subset); appends domain extensions AFTER the canonical 28.

**19.2 — Reconcile S3 ← DDB (`scripts/sync-dc-to-s3.mjs`):** Phase 18.3 enrichment was DDB-only;
this rebuilds each sidecar's `Attributes` in canonical order with values from the live DDB record
(DDB-only keys appended) and writes back to `metadata/<category>/<uuid>/<file>.metadata.json`.
Idempotent. Dry-run: 1194 changed / 0 missing / 0 errors. Applied → S3 now == DDB (re-audit ALL PASS).
**Restores the S3-sidecar-is-source-of-truth invariant** so a future DH CLI re-sync is safe.

**19.3 — `managed-resource` skill (`.claude/commands/managed-resource.md`):** documents the full
lifecycle (create→sync→enrich→reconcile→edit/pin→approve→verify) with the EXACT structural rules,
the public/private enrichment signal, the source-of-truth+reconcile guardrail, and the driving
commands (migrate-to-dc / enrich-dc / sync-dc-to-s3 / audit-dc-conformance). Mirrors the future
frontend "managed resource" dialog. Registered + appears in the skills list.

**19.4 — Frontend metadata link:** `src/components/MetadataLink.tsx` signs
`metadata/<s3Key>.metadata.json` via `Storage.getUrl` and renders a "⧉ metadata" link; wired into
the shared `DcEntityHeader` next to the title (all 6 detail pages). `amplify/storage/resource.ts`
grants authenticated read on `metadata/*` + `datasets/*`. tsc clean. Live check after deploy.

Then ran `/generate-architecture` to refresh docs/skills/CLAUDE.

---

### Session: 2026-06-15 (cont.) — Phase 18.3 complete: enrich ALL 1194 DC records

Finished Phase 18.3 by applying the operator's enrichment guidance, then enriching every
remaining kind. All independently verified against real DynamoDB.

**Engine changes (`scripts/enrich-dc.mjs`, commit 52dc279):**
- **Public/private classification** — `classifyVisibility()`: PUBLIC only when a *resolved*
  authoritative link exists (wikipedia/imdb/musicbrainz/openlibrary/goodreads/discogs/databazeknih).
  Discovered via `scripts/inspect-dc-kinds.mjs` that **nkp (306/306 books) and supermusic (112/112
  sheet) are auto-generated SEARCH urls** — false public-ness signals → excluded; youtube (playlist)
  excluded too.
- **Embedded PDF metadata** — `readPdfMetadata()` runs `pdfinfo` over the S3 artifact for
  book/sheet_music, extracting Title/Author/Subject/Pages, fed into the prompt. Graceful null on
  non-PDF / non-conformant files (the user's own "Scales - macro" isn't a valid PDF — handled).
- **Prompt branches** public (world knowledge, as movies) vs private (strictly record fields +
  embedded metadata, no fabricated facts; thin info → short plain description).
- **Visibility tag** `public`/`private` written into `_tags`; both added to `tagDictionary.ts`
  curation category.

**Enrichment runs (claude-opus-4-8, structured outputs, effort low):**
- Movies 94 (last session) + **band 59 (0 failed)** + **rest 1041 (0 failed)** = **1194/1194**.
- 520 public / 521 private; embedded PDF metadata used on **352 of 419** PDFs. Total ~**$7.3**.
- Verified: DDB COUNT scan = 1194/1194 non-empty `dc_abstract`. Spot-checks — private
  person/book/recording get conservative factual abstracts (no fabrication, Czech→Czech); public
  sheet/recording get rich accurate ones (artist/year/album).

**Write path:** direct `UpdateItem` SET on `dc_abstract`/`dc_subject`/`_tags`/`_last_updated_at`
(non-pinned fields only; respects `_explicit_fields` pin from 18.2). **KNOWN DIVERGENCE:** DDB-only —
S3 sidecars still empty; re-emit before any CLI re-sync. Frontend reads DDB (Phase 17) → app correct.

**Phase 18 status: 18.1–18.3 complete; 18.4 (frontend editor) next.** Rotate the Anthropic key
when convenient (pasted in chat once).

---

### Session: 2026-06-15 — Deploy fix + Phase 17.1/17.2 (frontend DC cutover begun)

**Deploy blocker diagnosed + fixed (was pre-existing, broke jobs 50–56):**
- Symptom: Amplify backend deploy failed at CDK assembly with `spawnSync docker ENOENT`.
- Root cause (confirmed in decompiled `aws-cdk-lib/aws-lambda-nodejs/bundling.js`):
  `shouldBuildImage = !esbuildInstallation` — with no resolvable esbuild, CDK builds a Docker
  image to bundle Amplify's auth/data custom-resource Lambdas; the Amplify build image has no
  Docker. esbuild existed only nested under `tsx`, never at root. Regressed because the Amplify
  build image stopped providing a global esbuild/Docker (our code never changed).
- Fix: added `esbuild ^0.27.7` devDependency (major `0.x` — satisfies vite 8's `^0.27` peer AND
  CDK's `startsWith('0.')` guard; linux-x64 binary in lockfile). **Jobs 55, 56, 57, 58 all green.**
- Correction logged: my earlier claim that the `navigate` fix would restore deploys was wrong —
  it was a real cleanup but not the blocker.

**Anthropic key:** stored in Secrets Manager `hyl-media/anthropic-api-key` (ARN …-KBL4LX) for
Phase 18. Never committed. **Rotate after Phase 18** (pasted in chat once).

**Phase 17 — Frontend DC cutover (started):**
- **17.1** ✓ `amplify/functions/metadata-api/` Lambda + 3 Cognito-authed custom AppSync queries
  (`getMetadata`, `listMetadataByType`, `searchMetadata`) over `hyl-media-metadata-repository`.
  IAM read granted by ARN in `backend.ts`. Deployed (job 57). Verified by direct-invoking the
  live Lambda: getMetadata(Dirty Dancing)→MovingImage + 2 dc_has_part URIs + PK==id;
  listMetadataByType(MovingImage)→movies; searchMetadata('dirty dancing')→hit.
- **17.2** ✓ `src/lib/dcMap.ts` (pure types + `dcToViewModel` + `pkFromUri`, node-tested on the
  real Dirty Dancing record) + `src/lib/dcClient.ts` (calls the 17.1 queries, `resolveUris`).
  tsc clean. Not yet wired into pages.

**17.3 — read-path cutover COMPLETE (17.3a lists + 17.3b detail pages):**
- **17.3a** — `dcQueries.listEntitiesForList(kind)` + one `EntityList` swap cut all 7 lists to DC.
  Playwright (job 59): Movies 94 / People 442 / Recordings 172 / Library 307 / Sheet 112. ALL PASS.
- **17.3b backend** — `getMetadataByLegacyId` (fixed: `_legacy_id` needs an ExpressionAttributeName
  alias) + `updateMetadata(pk, patch)` mutation (SET dc_title/language_code/_tags/_external_links,
  refreshes ASCII Title, bumps _last_updated_at; IAM +UpdateItem) + `documents/*` storage read.
  Verified via Lambda: getByLegacyId returns records; updateMetadata add+revert round-trip clean.
- **17.3b frontend** — all 6 detail pages read from DC (`getEntityDetail` resolves relationships)
  and write editable fields (`updateEntity`). Shared `DcEntityHeader`; `TagManager`/`ExternalLinks`
  gained a DC `save` override. PDFs download from `documents/<uuid>/`. Relationships read-only
  (DC collapsed per-edge roles); relationship EDITING deferred. Playwright (job 62): Dirty Dancing
  soundtrack, recording featured-in, book author+PDF download, Mike Nichols filmography — ALL PASS.
- **Migration bug fixed (found by the filmography check):** the relationship indexer omitted
  `personId`, so `movie_cast` reverse edges (person→movie filmography) were dropped — movies still
  got their cast (indexed by `movieId`). Added `personId` to the indexer in migrate-to-dc.mjs +
  audit, re-emitted + re-synced (1194 writes). Filmography confirmed.

**Known transient limitations until 17.4 / create+editor cutover:**
- Dossier (DataManagement) + GlobalSearch still read the legacy `KnowledgeGraphItem` table (they
  work — legacy data is intact). Detail-page edits write DC, so they can momentarily diverge from
  Dossier/search until those cut over.
- `+ New` (CreateEntityForm) and AssetUpload still write legacy → new items won't appear in DC
  lists until the create path is cut over.

**17.4 — Dossier + GlobalSearch on DC (COMPLETE):** GlobalSearch rewired to the server-side
`searchMetadata` DC query (debounced, grouped, tag-aware). Dossier sources its 6 entity arrays
from DC (`listEntitiesForList`); relationship cross-refs stay on the intact legacy table for
read-only display (legacy ids align). Playwright (job 64): Dossier DC counts, search name+tag.

**17.5 — full parity (COMPLETE):** Comprehensive Playwright across the cutover — lists, details,
relationships, Dossier, search. **PDF download confirmed end-to-end:** in-app `getUrl` (Cognito
identity) fetched a real 2.2 MB PDF from `documents/<uuid>/` → HTTP 200. (Earlier 403s were a test
error — HEAD on GET-signed presigned URLs; downloads work.) `npm run verify:dc-ui` runs all 3 suites.

**17.6 — decommission: DEFERRED/BLOCKED.** Cannot run yet: the CREATE path (CreateEntityForm +
AssetUpload) still writes legacy, and the Dossier relationship cross-refs still read legacy
(movie_cast/recording_performer/sheet_music_performer). Decommissioning would break create +
relationship display. Also destructive (delete table + S3 prefixes) → needs explicit approval +
a verified backup first. Recommend after Phase 18 (create + editor on DC).

**Phase 17 status: 17.1–17.5 complete (entire read+write entity path on DC, verified live); 17.6
deferred.** Deploy pipeline healthy (jobs 55–65 green).

**Net:** the app now reads (and edits scalar fields) entirely from `hyl-media-metadata-repository`.
Still on legacy until later: creating new entities, uploading assets, relationship cross-ref
display in Dossier, and relationship editing.

**Next options:** (a) move the create/upload path + Dossier cross-refs to DC (unblocks 17.6);
(b) Phase 18 — Claude enrichment (dc_abstract) via the Secrets Manager key + full editor +
approve/regenerate; (c) 17.6 decommission once (a) is done and you approve. Rotate the Anthropic
key when convenient.

---

### Session: 2026-06-14 (cont.) — Execute Phase 16: DC Migration (all 6 tasks complete)

Migrated the catalog into the DC metadata-repository, verifying each step against real data.

- **16.1** Pre-flight cleanup: `entity-to-dc` `resolveArtifact()` now emits a file-less book
  (`syndikat_synd`) as a Text descriptor; `scripts/dc-preflight-cleanup.mjs` removed 6 redundant
  legacy link attrs (3 items) and deleted 5 junk `tag` items. audit:dc → 0 skipped / 0 legacy / 0 tag.
- **16.2** `scripts/migrate-to-dc.mjs` — emits sidecars (no PK) + descriptors + copies PDFs to
  `documents/<uuid>/`. Dry-run reconciled: 1194 / 776 / 418.
- **16.3** `--limit 5 --apply` to real S3, verified keys, cleaned up.
- **16.4** Full emit: 1194 sidecars + 776 descriptors + 418 PDF copies (2388 objects, 1.57 GB).
  S3 `ls --summarize` confirmed counts. Additive (library/ + sheet-music/ untouched).
- **16.5** Reused DH Python CLI `update-metadata --resource hylm`: 1194 writes, 0 failures. MCP
  scan COUNT = 1194. (CLI writes by default; `--dry-run` is the opt-out — no `--apply` flag.)
- **16.6** `scripts/verify-dc-migration.mjs` → ALL PASS: counts match audit (Text 419/Dataset
  509/Sound 172/MovingImage 94), all 28 DH Attributes keys present, PK==id, sort_key==SK, 7
  relationship spot-checks across all dc_types. Report: `docs/migration-reports/dc-migration.md`.

**Note on key order:** DDB maps are unordered and the CLI round-trips sidecars through boto3, so
Attributes key ORDER is not preserved in the table — order fidelity is verified at the sidecar
level (15.4/15.7); the table check asserts all 28 keys present.

**Also**: fixed the pre-existing unused-`navigate` build error in `GlobalSearch.tsx` (Phase 14a).
**Not pushed** — push triggers an Amplify deploy; holding for user go-ahead.

**All phases 0-16 complete (103 tasks).** Next: Phase 17 (frontend on DC store) + Phase 18 (full lifecycle).

---

### Session: 2026-06-14 (cont.) — Execute Phase 15 end-to-end (all 7 tasks complete)

Ran Phase 15 autonomously, verifying each task independently against the reference solution
(`/home/ubuntu/digital-horizon-playbook`) and real DynamoDB data.

**Delivered & verified**:
- **15.1** `docs/dc-metadata-mapping.md` — all 7 entity + (now) 4 relationship types → conformant sidecar.
- **15.2** `scripts/lib/dc-paths.mjs` — S3 layout; self-test ALL PASS (11).
- **15.3** `IMPLEMENTATION_PLAN.md` §10 + 3 Decision Log rows (incl. Rule-6 exception).
- **15.4** `scripts/lib/build-dc-sidecar.mjs` — faithful port of DH `metadata.ts`; 28 Attributes in exact order; cross-checked `sortKeySlug` vs the CLI's Python `_normalize_for_sk` (agree on plain titles, diverge only on internal punctuation; documented). Self-test ALL PASS (18).
- **15.5** `scripts/lib/entity-to-dc.mjs` — relationship→DC resolver. Self-test ALL PASS.
- **15.7** `scripts/audit-dc-migration.mjs` — read-only dry-run: 1193 sidecars + 775 descriptors to `.dc-audit/`, dc_type Text 418 / Dataset 509 / Sound 172 / MovingImage 94, **0 overwriting collisions**. Emitted sidecar validated against conformant shape (first 28 Attributes == DH order, PK==id, sort_key==SK).
- **15.6** Created `hyl-media-metadata-repository` table via the **reused DH Python CLI** (registered `hylm` bucket in `config/metadata-repository.yaml`; added backward-compatible `table_name` support to the DH CLI `config.py`, committed in the nested platform repo `5519a28`). MCP describe-table: ACTIVE, PK/SK + `resource-account-index`, PAY_PER_REQUEST, 0 items.

**Key discovery (via audit)**: `movie_cast` (327 items) is a **4th relationship type** the initial study missed — it lacks a `name` attr so it's invisible to the sparse `byType` GSI. Added handling (director→`dc_creator`, actor→`dc_contributor`).

**Flagged for Phase 16**: 1 book without `s3Key` (`syndikat_synd`); 6 items with leftover `youtubeUrl`/`wikiUrl` outside `externalLinks`; 5 junk `tag` items; 34 benign cross-PK SK shares.

**Build note**: local `npm run build` fails on (a) missing `amplify_outputs.json` (generated at deploy — environmental) and (b) a pre-existing unused `navigate` in `GlobalSearch.tsx` (Phase 14a, commit 7af20a9). **Phase 15 changed no `src/` files** — no build regression. The `navigate` error is flagged for a future cleanup.

**Standing instructions added** (per user): CLAUDE.md Rule 7 (autonomous execution + independent verification) and Rule 6 exception; memories `autonomous-execution-and-verification`, `dc-metadata-compatibility-refactor`. Playwright installed for Phase 17 frontend inspection.

**All phases 0-15 complete (97 tasks).** Next: Phase 16 migration (add via /add-work).

---

### Session: 2026-06-14 — Add Phase 15: DC Metadata Model (Design & Foundation)

**Context**:
- All phases 0-14a complete (90 tasks). User requested a comprehensive refactor to make
  hyl-media's metadata compatible with the Digital Horizon platform
  (`/home/ubuntu/digital-horizon-playbook`) and consequently Dublin Core terms.

**Study performed** (read real source, not just summaries):
- DH metadata builder: `digital-horizon-platform/amplify/functions/recordings/_shared/metadata.ts`
- Schema/table doc: `docs/metadata-repository.md` (legacy auto-gen shape)
- Producer guide: `docs/metadata-repository-producers.md` (the authoritative contract)
- **Key finding 1**: Two formats exist. The **conformant sidecar** (metadata.ts shape) is the
  authoritative one for new producers; the table-doc shape is older legacy Python-CLI output.
- **Key finding 2**: The format is **artifact-centric** — every row describes a real S3 file
  (`s3_key`, `_category`, `_file_type`, `dc_source_uri`). hyl-media's non-file entities must be
  materialized as S3 artifacts to comply.
- **Key finding 3**: Pipeline is **S3-sidecar-first** — producers emit
  `metadata/<category>/<uuid>/<file>.metadata.json`; the Python CLI (`tools/metadata-repository`)
  scans registered buckets and upserts to DDB. Same S3 organization requires emitting sidecars.

**Decisions captured (via AskUserQuestion)**:
1. Storage: **own** `hyl-media-metadata-repository` table, same schema (not shared with DH).
2. Entity scope: **all** entity types; non-file entities → **JSON descriptor per entity**.
3. Lifecycle: **full** (enrichment, `_explicit_fields`, approve/regenerate/edit) — Phase 18.
4. Revise IMPLEMENTATION_PLAN.md: **yes** (task 15.3).
5. Sync: **reuse the existing Python CLI** (register a hyl-media bucket).
6. Format authority: **conformant sidecar** (metadata.ts), not the legacy table-doc shape.

**Work added** — Phase 15 (7 tasks, all non-destructive design/foundation):
- 15.1 DC field-mapping spec · 15.2 S3 layout/bucket plan · 15.3 revise IMPLEMENTATION_PLAN.md
- 15.4 port conformant-sidecar builder · 15.5 entity→artifact + relationship→DC resolver
- 15.6 register bucket + create empty table via CLI · 15.7 read-only dry-run audit

**Heads-up**: 15.6 deviates from Critical Rule #6 (infra via Amplify) — the metadata table is
CLI-created to stay identical to DH. Documented in 15.3.

**Roadmap (added later via /add-work)**: Phase 16 migration · 17 frontend on DC store · 18 full lifecycle.

**No code/AWS changes this session** — planning only. Next: start Task 15.1.

---

### Session: 2026-04-12 — Revert Phase 14/15, Add Real Enrichment Work

**Context**:
- All phases 0-13 complete (78 tasks). Previous Phase 14 (knowledge graph improvements) was reverted — it only built a manual UI component (SoundtrackManager) instead of the automated enrichment the user wanted.

**What was done**:
- Reverted 7 commits (`git reset --hard c223fa3`) removing Phase 14 (SoundtrackManager, tag-recommended script, test suite, tag search) and Phase 15 (verification tasks)
- Added new Phase 14: Knowledge Graph Enrichment via LLM Knowledge (5 tasks)
  - Goal: Use Claude's knowledge to create missing movie/recording entities and link them automatically
  - New entities auto-tagged `recommended`
  - Follows `enrich-recordings.mjs` pattern with `--audit-only` / `--dry-run`

**Phase 14 — Knowledge Graph Enrichment (5 tasks)**:
1. **Audit** — Scanned 94 movies, 145 recordings, 14 existing links. LLM knowledge identified 27 missing recordings, 44 new links, 33 movies needing soundtrack tags.
2. **Enrichment script** — `scripts/enrich-movie-recordings.mjs` with `MOVIE_RECORDING_LINKS` array of ~55 movie↔recording connections. Follows `enrich-recordings.mjs` pattern.
3. **Curation tags** — Added `curation` category to tag dictionary with `recommended`, `favorite`, `hidden-gem` (pink #ec4899).
4. **Execution** — Created 27 recordings (My Heart Will Go On, Tiny Dancer, Twist and Shout, etc.), 44 recording_movie links, tagged 33 movies with 'soundtrack'.
5. **Verification** — Spot-checked Titanic ↔ My Heart Will Go On, confirmed bidirectional. Total: 172 recordings, 44 links.

**Key decisions**:
- Old Phase 14 approach (manual UI linking) rejected — user wants automated enrichment using LLM knowledge
- Test suite from old Phase 14 not carried forward (can be re-added later if needed)
- New recordings auto-tagged `[soundtrack, recommended]` + genre tags
- Movies receiving soundtrack links auto-tagged `soundtrack`

**Phase 14 complete (5 tasks).**

**Additional work (Phase 14a — 2 tasks)**:
1. **Global search** — `src/components/GlobalSearch.tsx` in Layout top bar. Available on every screen. Searches entity names AND tags. Ctrl+K shortcut. Lazy-loads data on first focus. Dropdown with grouped results + tag badges.
2. **/enrich-connections skill** — `.claude/commands/enrich-connections.md`. Run after adding new entries to auto-detect missing connections using LLM knowledge.

**Verification results**:
| Task | Verify | Result |
|------|--------|--------|
| 14.1 | Audit lists entities + links | PASSED — 27 recordings, 44 links, 33 tags |
| 14.2 | --dry-run shows plans | PASSED |
| 14.3 | Curation category in tag dictionary | PASSED |
| 14.4 | Entities visible in DynamoDB | PASSED — 172 recordings, 44 links |
| 14.5 | Spot-check Titanic ↔ My Heart Will Go On | PASSED |
| 14a.1 | Build passes, search in top bar | PASSED |
| 14a.2 | Skill file exists | PASSED |

**All phases 0-14a complete (90 tasks). Pushed + deploying.**

---

### Session: 2026-04-03 — Recording Enrichment from YouTube Playlist

**Context**:
- All phases 0-12 complete (73 tasks). User provided YouTube playlist TSV (132 lines) with recordings to import/enrich.

**What was done**:

**Phase 13 — Recording Enrichment (4 tasks)**:
1. **Parse TSV** — `scripts/parse-youtube-playlist.mjs` parses YouTube titles into structured JSON. 115 unique entries from 132 lines (9 private, 8 duplicates). Manual overrides for 51 ambiguous titles. All entries have resolved artist type.
2. **Audit DynamoDB** — `scripts/enrich-recordings.mjs --audit-only` queries existing data: 94 recordings matched, 18 to create, 13 bands + 21 persons to create, 61 cross-refs needed.
3. **Enrichment script** — Combined audit + enrichment in single script. Supports `--audit-only` and `--dry-run` modes. Follows existing `create-missing-entities.mjs` patterns.
4. **Execution** — Created 13 bands, 21 persons, 18 recordings, 61 recording_performer cross-refs. Updated 20 recording tags.

**Key decisions**:
- Compilations (Various Artists, Amy Winehouse Greatest Hits, Sade Best Of) skipped — not single recordings
- "Precedens" treated as person (solo project) rather than band
- Artist name normalization: P!NK→Pink, ELÁN→Elán, Prodigy→The Prodigy, etc.
- Featured artists tracked separately and linked via cross-refs (e.g., Scorpions + Vanessa-Mae)

**Fix — Task 13.4a (user-reported)**:
5. **YouTube links + tag fix** — User reported band pages (e.g., Puding pani Elvisovej) missing YouTube links. Root cause: enrichment only added links to recording entities, but BandDetail/PersonDetail pages only show their own externalLinks. `scripts/fix-enrichment.mjs` propagated 95 YouTube links to band/person entities and corrected 100 genre tags using LLM knowledge (e.g., "world"→"pop, rock" for Slovak bands, "artist"→genre-specific for persons).

**Issues encountered**:
- Initial enrichment did not propagate YouTube links to band/person entities — only to recordings
- Old bulk-tag script had assigned generic/wrong genres (e.g., "world" for all non-English, "artist" for all persons)
- Fix required LLM knowledge to assign correct genres per artist

**Phase 13 complete (5 tasks). All phases 0-13 complete (78 tasks).**

---

### Session: 2026-04-02 — Dossier-First Navigation Refactor

**Context**:
- All 57 tasks (phases 0-9) were complete. User identified nav duplication: Home page, Editor nav group, and Dossier tabs all pointed to similar content.

**What was done**:

**Phase 10 — Dossier-First Nav Refactor (5 tasks)**:
1. **Dossier becomes /**  — `/` now renders DataManagement (Dossier). `/dossier` kept as alias. Home.tsx deleted.
2. **Editor nav group removed** — sidebar now shows only `> DOSSIER` + sign out. CLASSIFIED // PERSONAL banner removed. All editor CSS cleaned up.
3. **+ New buttons on Dossier tabs** — each entity tab (Movies, Bands, People, etc.) has a `+ New` button linking to the list page with `?create=1`. EntityList, LibraryList, SheetMusicList auto-open create forms from URL param. Dossier supports `?tab=` for deep-linking to tabs.
4. **Breadcrumb navigation** — new `Breadcrumb` component added to all 6 detail pages and EntityList. Format: `DOSSIER > Movies > [name]`. Links back to Dossier with correct tab param.
5. **Dead code cleanup** — deleted Home.tsx and ArtistList.tsx (both orphaned). TypeScript + Vite build clean.
6. **Sidebar → top bar** — user noted sidebar with single link was useless. Replaced with minimal top bar (logo left, user+signout right). 180 lines sidebar CSS deleted. Content gets full viewport width.

**Key decisions**:
- Entity routes (`/movies`, `/movies/:id`, etc.) preserved — URLs stay addressable
- Navigation flow: Dossier → entity tab → detail/list page → breadcrumb back
- No sideways navigation between entity types — always return to Dossier hub
- Create forms reached via `+ New` on Dossier tabs or directly on list pages

**Phase 10 complete (6 tasks). All phases 0-10 complete (63 tasks).**

### Phase 11 — Automated CRUD Tests:
7. **Test helper module** — `scripts/test-helpers.mjs`: shared Amplify auth, CRUD functions (createItem, getItem, updateItem, deleteItem, listByType), assert utilities, cleanup function.
8. **4 test suites** — movies (24 assertions), persons (15), bands+recordings (14), books+sheets (19). Each creates `_test_*` items, exercises create/read/list/update/tags/links/delete, verifies deletion.
9. **Test runner** — `scripts/test-crud.mjs` (`npm run test:crud`): runs all 4 suites with pre/post cleanup.
10. **Cleanup script** — `scripts/test-cleanup.mjs` (`npm run test:cleanup`): scans all entity types for orphaned `_test_*` items.

**Issues encountered**:
- `amplify_outputs.json` was stale — missing `tags` and `externalLinks` fields (added in phases 6/8). Regenerated via `ampx generate outputs`. This also affects local dev — fields invisible to Amplify client until outputs regenerated.
- Amplify `update()` doesn't return array fields (tags, roles) — fixed by re-fetching item after update in test helper.
- Amplify `create()` rejects `__typename` and `createdAt` fields — removed from test helper (app's createItem in queries.ts passes them but Amplify client may handle differently in browser vs Node.js).

**Key decisions**:
- Tests run against real DynamoDB (not mocked) — true integration tests
- Traceable naming: `_test_1_movie`, `_test_1_person`, etc. for easy lookup/cleanup
- `amplify_outputs.json` is gitignored — must be regenerated locally

**Phase 11 complete (7 tasks).**

### Phase 12 — Full-Text Search:
11. **Search bar replaces banner** — removed "Dossier // Personal Media Intelligence" banner and "DOSSIER" heading. Replaced with full-width search input.
12. **Real-time search** — filters across all ~1,600 entities by name, author, artistName, givenName, familyName. Diacritics-insensitive. Min 2 chars. Results grouped by entity type (Movies, Bands, People, etc.), max 20 per group.
13. **Search results link to detail pages** — each result is a clickable link with author/artist/roles metadata. fbi-banner CSS replaced with search-bar/results styles.

**Phase 12 complete (3 tasks). All phases 0-12 complete (73 tasks).**

---

### Session: 2026-03-24 — 80s FBI Terminal Theme + Dossier Rename

**Context**:
- Task 5.4 (UI polish) completed, then full visual redesign per user request

**What was done**:

**Task 5.4 — UI Polish (commit 403dc70)**:
1. Responsive sidebar with hamburger menu (768px breakpoint)
2. Table horizontal scroll wrappers on all data tables
3. Shared CSS classes (btn, card, meta, table-wrap, dash-grid)
4. Cleaned Vite template CSS from App.css
5. Fixed Home page: removed stale Artists card, updated labels

**FBI Terminal Theme (commit b07000a)**:
6. **Renamed Data → Dossier** — user said core info page shouldn't be called "data", chose FBI-style "Dossier"
7. **Full dark terminal aesthetic**: #0a0a0a background, #00ff41 green monospace text, CRT scanline overlay
8. **Sidebar**: dark panel with `> HYL MEDIA` prompt, amber "CLASSIFIED // PERSONAL" banner, `> ` active indicator
9. **Dossier page**: FBI banner header, terminal-style tab bar, themed tables/badges/links
10. **All 14 component files themed**: Layout, EntityList, all detail pages, forms, CastManager, PerformerManager, ExternalLinks, TagManager, InlineEdit, AssetUpload
11. **CSS variables**: --green, --amber, --red, --border, --bg-card, etc. for consistent theming
12. **User direction**: "80s internet FBI-like with all modern features under the hood" — Claude Cowork is primary operator

**Nav Restructure + Readability (commit 49551ea)**:
13. **Nav restructured**: Dossier only at top level, Editor as collapsible `▶ EDITOR` toggle with entity pages underneath
14. **Readability pass**: brighter text (#44dd55 vs #00dd36), base font 15px (was 14px), scanline 6% opacity (was 15%), bumped cell/tab/button font sizes

**Key decisions**:
- Dossier as sole top-level nav item (primary page)
- Entity edit pages collapsed under "Editor" group
- Green terminal (#44ee66) — tuned brighter for readability
- Monospace font (Courier New) throughout
- CRT scanline CSS overlay — lightened to not impair reading
- Claude Cowork is primary operator — nav kept functional, not hidden

**Phase 9 added (4 tasks, all complete). All phases 0-9 complete (57 tasks).**

---

### Session: 2026-03-24 — Phase 5 Complete: UI Polish & Responsive Design

**Context**:
- Phase: 5 - Edit Forms & Polish
- Task: 5.4 (complete) — UI polish and responsive design

**What was done**:
1. **Responsive sidebar**: Collapsible nav with hamburger menu on mobile (768px breakpoint), overlay backdrop, auto-close on navigation
2. **Responsive tables**: All tables in EntityList and DataManagement wrapped with `table-wrap` for horizontal scroll on small screens
3. **Shared CSS classes**: Created `App.css` with reusable classes — `btn`/`btn-primary`/`btn-secondary`/`btn-sm`, `card`, `meta`, `dash-grid`, `table-wrap`
4. **Cleaned up App.css**: Removed all Vite template leftovers (.hero, .counter, #center, etc.)
5. **Fixed Home page**: Removed stale Artists card (dead route since Phase 6), updated labels to match nav (People, Library)
6. **Button consistency**: Replaced inline button styles in EntityList, CreateEntityForm, AssetUpload, LibraryList, SheetMusicList with CSS classes
7. **Meta text**: Replaced inline `fontSize/color` on all 6 detail pages with `.meta` class

**All phases (0-8) are now complete.** Only remaining is any future work the user wants to add.

---

### Session: 2026-03-24 — Phase 8: Flexible External Links + Multi-Source Research + Data Page

**Context**:
- Phase: 8 - Flexible External Links + Link Research
- Tasks: 8.1-8.10 (all complete)

**What was done**:

**Architecture (8.1-8.5)**:
1. Schema: replaced 4 fixed URL fields with single `externalLinks` JSON string `Array<{url, type}>`
2. ExternalLinks component: supports 10 known types + any custom type
3. All 6 detail pages updated, legacy fields kept for Amplify compatibility

**Link Research (8.6-8.9)**:
4. Wikipedia: 94 movies, 45 bands, 260 persons, 69 recordings, 66 sheet music, 5 books
5. IMDB: 94 movies, 196 persons (all actors/directors)
6. NKP (Czech National Library): 306/306 books (100%)
7. Open Library: 61 international books
8. MusicBrainz: 85 recordings, 95 sheet music
9. Supermusic.cz: 91 recordings, 112 sheet music

**Data Page Rewrite (8.10)**:
10. 8 consolidated tabs: Overview, Movies, Bands, People, Recordings, Library, Sheet Music, Tags
11. Each tab shows: name→detail, related entities (clickable to person/band), tags, external links (clickable badges)
12. Fixed terminology: Books→Library
13. Fuzzy diacritics-insensitive matching for author/artist→person/band links

**Final coverage**: 908/1067 items (85%) have external links
- 100%: Movies, Bands, Library, Sheet Music
- 97%: Recordings
- 63%: People (remaining are obscure book authors)

**Link sources used**: Wikipedia, IMDB, NKP, Open Library, MusicBrainz, Supermusic

---

### Session: 2026-03-24 — Phase 8: Flexible External Links + Link Research

**Context**:
- Phase: 8 - Flexible External Links + Link Research
- Tasks: 8.1–8.7 (all complete)

**What was done**:
1. **Schema change** (8.1): Replaced 4 fixed URL fields (`wikiUrl`, `imdbUrl`, `spotifyUrl`, `youtubeUrl`) with single `externalLinks` JSON string field storing `Array<{url, type}>`.
2. **Data migration** (8.2): No data to migrate — old fields were never populated with data.
3. **Component refactor** (8.3): `ExternalLinks` component now supports 7 known types (wikipedia, imdb, spotify, youtube, discogs, goodreads, musicbrainz) plus any custom type.
4. **Detail pages** (8.4): All 6 detail pages updated to pass new `externalLinks` prop.
5. **Build verified** (8.5): TypeScript clean, Vite build succeeds.
6. **Wikipedia research** (8.6): 94/94 movies + 45/45 bands now have Wikipedia links. Used MediaWiki API for automated lookup + manual URLs for Czech/Slovak bands (cs/sk Wikipedia).
7. **IMDB research** (8.7): 94/94 movies now have IMDB links with manually verified title IDs.

**Architecture decision**: External links now use `{url, type}` pattern — any new link source (Discogs, Goodreads, MusicBrainz, etc.) can be added without schema changes.

---

### Session: 2026-03-24 — Phase 8: Flexible External Links + Multi-Source Research + Data Page

**Context**:
- Phase: 8 - Flexible External Links + Link Research
- Tasks: 8.1-8.10 (all complete)

**What was done**:

**Architecture (8.1-8.5)**:
1. Schema: replaced 4 fixed URL fields with single `externalLinks` JSON string `Array<{url, type}>`
2. ExternalLinks component: supports 10 known types + any custom type
3. All 6 detail pages updated, legacy fields kept for Amplify compatibility

**Link Research (8.6-8.9)**:
4. Wikipedia: 94 movies, 45 bands, 260 persons, 69 recordings, 66 sheet music, 5 books
5. IMDB: 94 movies, 196 persons (all actors/directors)
6. NKP (Czech National Library): 306/306 books (100%)
7. Open Library: 61 international books
8. MusicBrainz: 85 recordings, 95 sheet music
9. Supermusic.cz: 91 recordings, 112 sheet music

**Data Page Rewrite (8.10)**:
10. 8 consolidated tabs: Overview, Movies, Bands, People, Recordings, Library, Sheet Music, Tags
11. Each tab shows: name→detail, related entities (clickable to person/band), tags, external links (clickable badges)
12. Fixed terminology: Books→Library
13. Fuzzy diacritics-insensitive matching for author/artist→person/band links

**Final coverage**: 908/1067 items (85%) have external links
- 100%: Movies, Bands, Library, Sheet Music
- 97%: Recordings
- 63%: People (remaining are obscure book authors)

**Link sources used**: Wikipedia, IMDB, NKP, Open Library, MusicBrainz, Supermusic

---

### Session: 2026-03-24 — Phase 8: Flexible External Links + Link Research

**Context**:
- Phase: 8 - Flexible External Links + Link Research
- Tasks: 8.1-8.7 (all complete)

**What was done**:
1. **Schema change** (8.1): Replaced 4 fixed URL fields with single externalLinks JSON string field storing Array<{url, type}>.
2. **Data migration** (8.2): No data to migrate - old fields were never populated.
3. **Component refactor** (8.3): ExternalLinks component now supports 7 known types plus any custom type.
4. **Detail pages** (8.4): All 6 detail pages updated to pass new externalLinks prop.
5. **Build verified** (8.5): TypeScript clean, Vite build succeeds.
6. **Wikipedia research** (8.6): 94/94 movies + 45/45 bands now have Wikipedia links.
7. **IMDB research** (8.7): 94/94 movies now have IMDB links.

**Architecture decision**: External links now use {url, type} pattern - extensible without schema changes.

---

### Session: 2026-03-22 — Task 0.1: Read Input Materials

**Context**:
- Phase: 0 - Planning & Setup
- Task: 0.1 - Read input materials and explore examples

**Input Materials Analysis**:

#### File: `input/idea.md`
| Attribute | Detail |
|-----------|--------|
| Type | Project brief / requirements sketch |
| Purpose | High-level project definition |

**Extracted Requirements & Decisions:**
1. **AWS Account**: 299
2. **Naming convention**: `hyl-media-{...}`
3. **Storage**: Single S3 bucket with resources, partitioned by type
4. **Database**: DynamoDB for links/metadata (not for storing resources themselves)
5. **Data sources to include**: DynamoDB knowledge graph (dynamo_implementation/), book library (library/), sheet music (music-read/)
6. **Architecture**: All resources stored in S3, links/metadata in DynamoDB
7. **Future scope**: Kindle library integration
8. **Frontend**: Modern standards, manageable and runnable by "cowork claude" (i.e., Claude Code should be able to maintain and run it)

**Key constraint**: Frontend must be AI-maintainable — favors well-structured, convention-over-configuration frameworks like Amplify Gen 2.

---

#### File: `input/dynamo_implementation/WORKER_INSTRUCTIONS.md`
| Attribute | Detail |
|-----------|--------|
| Type | Technical specification — complete DynamoDB schema + Amplify data model |
| Purpose | Ready-to-implement knowledge graph design |

**Extracted Requirements & Decisions:**

**Entity Types (6 + relationships):**
| Entity | Count | Key Fields |
|--------|-------|------------|
| movie | 94 | id, name, language (en/cs) |
| person | 231 | id, name, given_name, family_name, roles[], language |
| band | 33 | id, name, language |
| artist | 3 | id, name, language (P!nk, Amy Winehouse, Dario G) |
| collaboration | 8 | id, name, language (one-off pairings) |
| tag | 5 | id, name, language (non-performer labels — hide from nav) |
| recording | 94 | id, name, language |

**Relationship Types (3):**
| Relationship | Count | Links |
|-------------|-------|-------|
| movie_cast | 327 | movie → person (role: actor/director) |
| recording_performer | 96 | recording → performer (type: band/artist/person/collaboration/tag) |
| recording_movie | 14 | recording → movie (soundtracks) |

**Total items**: 905 (verified against data files)

**DynamoDB Table**: `knowledge_graph`
- PK: `id` (String) — globally unique slug_hash
- SK: `entity_type` (String)
- 6 GSIs: byType, byCastMovie, byPersonFilm, byRecording, byPerformer, byLanguage

**Frontend Spec (from WORKER_INSTRUCTIONS.md):**
- Stack: Amplify Gen 2 + React + TypeScript + Amplify UI
- 10 routes defined (list + detail pages for movies, persons, bands, artists, collaborations, recordings)
- Edit forms: inline edit for name/language, add/remove cast/performer
- Auth: `allow.authenticated()`
- Amplify data model provided as TypeScript code

**Upload Script**: Provided (BatchWrite, 25 items/batch, eu-central-1)

**Checklist from doc**: Create table → GSIs → upload → verify counts → init Amplify → data model → list views → detail views → edit forms → deploy

---

#### File: `input/dynamo_implementation/data/` (10 JSON files)
| Attribute | Detail |
|-----------|--------|
| Type | Data — ready-to-import JSON files |
| Purpose | Pre-built knowledge graph data for DynamoDB |

**Verified counts match WORKER_INSTRUCTIONS.md:**
- all_items.json: 905, movies: 94, persons: 231, bands: 33, artists: 3, collaborations: 8, tags: 5, recordings: 94, movie_cast: 327, recording_performers: 110

**Note**: recording_performers.json has 110 items but WORKER_INSTRUCTIONS says 96 performer links + 14 recording_movie links = 110 total. The file contains both `recording_performer` and `recording_movie` entity types.

---

#### File: `input/library/` (307 files)
| Attribute | Detail |
|-----------|--------|
| Type | Data — PDF/epub book collection |
| Purpose | Personal digital library to be stored in S3 and cataloged |

**Key observations:**
- 307 files (mix of PDF and epub, some .doc/.xps)
- Languages: English and Czech
- Topics: yoga, spirituality, medicine, electronics, programming, fiction, philosophy
- Naming pattern: `{Title} by {Author}.{ext}` (mostly consistent)
- Some files authored by the user (Jiří Hylmar)
- Metadata extraction needed: title, author, format, language from filename
- **Spec implication**: S3 storage with DynamoDB metadata catalog. Need a `book` entity type or similar.

---

#### File: `input/music-read/` (112 files)
| Attribute | Detail |
|-----------|--------|
| Type | Data — sheet music PDF collection |
| Purpose | Guitar/piano chord sheets and tabs to be stored in S3 and cataloged |

**Key observations:**
- 112 PDF files (some .doc)
- Pattern: `{Artist} - {Song Title}.pdf` (mostly consistent)
- Mix of English and Czech songs
- Artists include: Bob Dylan, David Bowie, Rolling Stones, U2, Nick Cave, Velvet Underground, Lou Reed, Czech artists (Katapult, Tři sestry, Nohavica, etc.)
- Holiday songs section (Koledy)
- **Overlap with knowledge graph**: Many artists here appear in the DynamoDB knowledge graph (U2, Rolling Stones, David Bowie, Lou Reed, Nick Cave, etc.)
- **Spec implication**: S3 storage with DynamoDB metadata. Need a `sheet_music` entity type. Could link to existing `person`/`band` entities in knowledge graph.

---

#### File: `input/environment.md`
| Attribute | Detail |
|-----------|--------|
| Type | Configuration (generated during /setup) |
| Purpose | Records environment decisions |

AWS Account 299, eu-central-1, playbook-aws-serverless-multirepo template. No new requirements.

---

### Playbook Example Analysis

**Template explored**: `playbook-aws-serverless-multirepo`

**Structure**: Multi-repo (orchestration + infrastructure + backend + frontend + testing)
**Stack**: CDK, Lambda, API GW, DynamoDB, S3, React

**Adaptation needed for hyl-media:**
- The input specifies **Amplify Gen 2** (not raw CDK + Lambda + API GW). Amplify Gen 2 bundles: hosting, auth (Cognito), data (AppSync/DynamoDB), storage (S3). This simplifies the multi-repo approach — Amplify Gen 2 is a mono-repo pattern.
- **Decision point for Task 0.2**: Multi-repo may be overkill. Amplify Gen 2 is inherently a single project with `amplify/` dir for backend definitions. May adapt to fewer repos or mono-repo.
- Data import is a one-time script, not an ongoing backend service.

**Key architectural tension**: WORKER_INSTRUCTIONS.md specifies Amplify Gen 2 (which manages its own infrastructure via Amplify backend). The playbook template assumes CDK + Lambda + API GW (manual infrastructure). These are different approaches. Need to decide in Task 0.2.

---

### Summary of All Requirements

| # | Requirement | Source |
|---|-------------|--------|
| R1 | AWS account 299, eu-central-1 | idea.md |
| R2 | Naming: hyl-media-{...} | idea.md |
| R3 | Single S3 bucket, partitioned | idea.md |
| R4 | DynamoDB for links/metadata | idea.md |
| R5 | Knowledge graph: 905 items, 6 entity types, 3 relationship types | dynamo_implementation |
| R6 | DynamoDB table `knowledge_graph` with 6 GSIs | dynamo_implementation |
| R7 | Amplify Gen 2 + React + TypeScript frontend | dynamo_implementation |
| R8 | 10 routes (list + detail for each entity) | dynamo_implementation |
| R9 | Inline edit forms with updated_at/updated_by | dynamo_implementation |
| R10 | Book library: 307 files → S3 + catalog | library/ |
| R11 | Sheet music: 112 files → S3 + catalog | music-read/ |
| R12 | Future Kindle integration | idea.md |
| R13 | Frontend manageable by Claude Code | idea.md |
| R14 | All resources in S3, links in DynamoDB | idea.md |

### Decisions Needed (Task 0.2)
1. **Amplify Gen 2 vs CDK+Lambda**: Input specifies Amplify Gen 2. This changes the playbook structure significantly.
2. **Mono-repo vs multi-repo**: Amplify Gen 2 naturally fits mono-repo. Multi-repo may add unnecessary complexity.
3. **New entity types**: `book` and `sheet_music` not in current DynamoDB schema — need to extend the knowledge graph or create separate catalog.
4. **S3 partitioning scheme**: Single bucket, but how to partition (by type? by entity?).

---

### Task 0.2: Template Selection

**Selected**: `playbook-aws-serverless-multirepo` (adapted)

**Rationale**:
- Best match for AWS serverless + DynamoDB + S3 + frontend project
- The MCP mono-repo template is for documentation/MCP instances — completely wrong use case
- However, the template needs significant adaptation:

**Adaptations required**:
1. **Amplify Gen 2 replaces CDK + Lambda + API GW**: The input specifies Amplify Gen 2, which bundles backend (AppSync/DynamoDB), auth (Cognito), storage (S3), and hosting. This is a fundamentally different architecture than raw CDK + Lambda. Amplify Gen 2 manages its own CloudFormation stacks.
2. **Reduced repo count**: Amplify Gen 2 is a mono-repo pattern (`amplify/` dir inside the React project). Instead of 5 repos (orchestration, infrastructure, backend, frontend, testing), we need 2: orchestration (this repo) + the Amplify app itself.
3. **Data import is a one-time script**, not an ongoing Lambda backend. The upload script from WORKER_INSTRUCTIONS.md can run locally or as a one-off.
4. **Extended data model**: Beyond the knowledge graph, need `book` and `sheet_music` entity types for the library and music-read collections, with S3 references.

**Template structure adaptation**:
```
hyl-media/                      # Orchestration repo (this)
├── app/                        # Amplify Gen 2 app (separate git repo)
│   ├── amplify/                # Amplify backend definitions
│   │   ├── data/               # DynamoDB schema (AppSync)
│   │   ├── auth/               # Cognito config
│   │   └── storage/            # S3 config
│   ├── src/                    # React frontend
│   └── scripts/                # Data import scripts
├── IMPLEMENTATION_PLAN.md
├── progress.json
├── session_notes.md
├── input/                      # Source materials (read-only)
└── tasks/
```

---

### Session: 2026-03-24 — Phase 8: Flexible External Links + Multi-Source Research + Data Page

**Context**:
- Phase: 8 - Flexible External Links + Link Research
- Tasks: 8.1-8.10 (all complete)

**What was done**:

**Architecture (8.1-8.5)**:
1. Schema: replaced 4 fixed URL fields with single `externalLinks` JSON string `Array<{url, type}>`
2. ExternalLinks component: supports 10 known types + any custom type
3. All 6 detail pages updated, legacy fields kept for Amplify compatibility

**Link Research (8.6-8.9)**:
4. Wikipedia: 94 movies, 45 bands, 260 persons, 69 recordings, 66 sheet music, 5 books
5. IMDB: 94 movies, 196 persons (all actors/directors)
6. NKP (Czech National Library): 306/306 books (100%)
7. Open Library: 61 international books
8. MusicBrainz: 85 recordings, 95 sheet music
9. Supermusic.cz: 91 recordings, 112 sheet music

**Data Page Rewrite (8.10)**:
10. 8 consolidated tabs: Overview, Movies, Bands, People, Recordings, Library, Sheet Music, Tags
11. Each tab shows: name→detail, related entities (clickable to person/band), tags, external links (clickable badges)
12. Fixed terminology: Books→Library
13. Fuzzy diacritics-insensitive matching for author/artist→person/band links

**Final coverage**: 908/1067 items (85%) have external links
- 100%: Movies, Bands, Library, Sheet Music
- 97%: Recordings
- 63%: People (remaining are obscure book authors)

**Link sources used**: Wikipedia, IMDB, NKP, Open Library, MusicBrainz, Supermusic

---

### Session: 2026-03-24 — Phase 8: Flexible External Links + Link Research

**Context**:
- Phase: 8 - Flexible External Links + Link Research
- Tasks: 8.1-8.7 (all complete)

**What was done**:
1. **Schema change** (8.1): Replaced 4 fixed URL fields with single externalLinks JSON string field storing Array<{url, type}>.
2. **Data migration** (8.2): No data to migrate - old fields were never populated.
3. **Component refactor** (8.3): ExternalLinks component now supports 7 known types plus any custom type.
4. **Detail pages** (8.4): All 6 detail pages updated to pass new externalLinks prop.
5. **Build verified** (8.5): TypeScript clean, Vite build succeeds.
6. **Wikipedia research** (8.6): 94/94 movies + 45/45 bands now have Wikipedia links.
7. **IMDB research** (8.7): 94/94 movies now have IMDB links.

**Architecture decision**: External links now use {url, type} pattern - extensible without schema changes.

---

### Session: 2026-03-22 — Full Build (Phases 0-4)

**Context**: First session. Built entire project from scratch.

**Completed**:
- Phase 0 (9 tasks): Read inputs, selected template, drafted spec, got approval, generated all phase tasks
- Phase 1 (5 tasks): Amplify Gen 2 init, data model + 6 GSIs, auth, storage, deployed sandbox to eu-west-1
- Phase 2 (6 tasks): Imported 905 knowledge graph items, 307 books (S3+DynamoDB), 112 sheet music (S3+DynamoDB), 21 cross-references
- Phase 3 (5 tasks): Full knowledge graph frontend — movies, persons, bands, artists, collaborations, recordings with relationship navigation
- Phase 4 (2 tasks): Library + sheet music browsing with S3 download links

**Key Decisions**:
- AWS region ended up as eu-west-1 (user's CLI default), not eu-central-1
- AWS account is 182059100462 (not "299" from idea.md — that was shorthand)
- Mono-repo instead of multi-repo (Amplify Gen 2 is inherently mono)
- Had to fix broken CDKToolkit stack (UPDATE_ROLLBACK_FAILED) before first deploy
- Book import had duplicate ID issue — fixed with author+format in hash

**Artifacts (WRONG ACCOUNT — DELETED)**:
- ~~DynamoDB table: KnowledgeGraphItem-zw7vswr6vjhwdfo2kvafx6433m-NONE~~ (182059100462/eu-west-1 — deleted)
- ~~S3 bucket: amplify-hylmediainit-hylm-hylmediastoragebucketefb-42igexn5weic~~ (deleted)
- ~~Stack: amplify-hylmediainit-hylmarj-sandbox-3722643844~~ (deleted)

**Artifacts (CORRECT ACCOUNT 299)**:
- DynamoDB table: KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE
- S3 bucket: amplify-d2r70lavusnzlx-ma-hylmediastoragebucketefb-p0iq0m7stthq
- AppSync: 366ya64s65cqjhilw34nx5r2vu.appsync-api.eu-central-1.amazonaws.com
- Cognito: eu-central-1_GJhwO2ww5
- Amplify App: d2r70lavusnzlx
- URL: https://main.d2r70lavusnzlx.amplifyapp.com

**INCIDENT: Wrong Account Deployment**:
- Root cause: Used default AWS CLI profile (account 182059100462) instead of JiHy__vsb__299 (account 299025166536)
- Impact: All Phase 1-2 resources created in wrong account/region
- Resolution: Deleted sandbox stack, re-imported all data to correct account
- Prevention: MCP tool `mcp__aws-vsb-299__call_aws` installed, CLAUDE.md updated with strict rules

**Bug Fixes**:
- Amplify client `generateClient()` race condition — moved to lazy init
- Null items in query results — added filterNulls()
- Auth guard — prevent rendering before user authenticated

**Deployment Fixes (continued same session)**:
- Added `__typename: 'KnowledgeGraphItem'` to all import scripts — AppSync requires it
- Added `createdAt` timestamp to all items — Amplify client returns null without it
- Fixed SPA rewrite rules: regex `</^[^.]+$/>` for extensionless paths, `404-200` fallback
- Fixed CloudFront caching: `no-cache, no-store, must-revalidate` on index.html
- Removed aggressive regex rewrite that was serving index.html for JS/CSS files
- All verified via curl before telling user

**Next Session**:
- Phase 5: edit forms, cast/performer management, UI polish
- Use MCP tool `mcp__aws-vsb-299__call_aws` for ALL AWS operations

---

### Session: 2026-03-23 — Phase 5 + Phase 6 (12 tasks)

**Completed**:
- Architecture diagram with actual resource names, all 3 S3 buckets, 6 GSIs
- **Task 5.1**: InlineEdit component + updateItem mutation on all detail pages (name, language)
- **Task 5.2**: CastManager — add/remove actors/directors on movie detail with person search
- **Task 5.3**: PerformerManager — add/remove performers on recording detail with type filter
- **Task 6.1**: Schema extension — wikiUrl, imdbUrl, spotifyUrl, youtubeUrl, tags[] fields
- **Task 6.2**: Artist→person migration — 3 artists merged, 3 recording_performer links updated
- **Task 6.3**: Removed /artists route and nav, BandDetail no longer handles artist type
- **Task 6.4**: ExternalLinks component on all detail pages (colored badges, alt+click to edit)
- **Task 6.5**: CreateEntityForm on Movies, Persons, Bands, Recordings lists (+ New button)
- **Task 6.6**: AssetUpload component — S3 upload with progress bar for books/sheet music
- **Task 6.7**: Tag dictionary (genre/library_type/content) + TagManager UI on all detail pages

**Key Decisions**:
- Artist entity type merged into person with roles=['artist'] — no more standalone artist
- External links as fixed fields (wikiUrl, imdbUrl, etc.) not flexible JSON — simpler for "cowork" use
- Tag dictionary with 3 categories: Genre (17 tags), Library Type (9), Content (12)
- PersonList now has "Artist" role filter post-merge

**New Components Created**:
- `src/components/InlineEdit.tsx` — click-to-edit with Enter/Escape
- `src/components/CastManager.tsx` — movie cast CRUD
- `src/components/PerformerManager.tsx` — recording performer CRUD
- `src/components/ExternalLinks.tsx` — link badges with edit
- `src/components/CreateEntityForm.tsx` — generic entity creation
- `src/components/AssetUpload.tsx` — S3 file upload with metadata
- `src/components/TagManager.tsx` — tag picker from controlled vocabulary
- `src/lib/UserContext.tsx` — auth user ID context
- `src/lib/tagDictionary.ts` — controlled tag vocabularies

**Data Migration**:
- `scripts/migrate-artist-to-person.mjs` — run successfully against production

**Task 5.4 (UI polish) skipped** — user chose to jump to Phase 6

**Next Session**:
- All phases 0-6 complete
- App ready for "cowork claude" to enrich data (add links, tags, new entities)
- Could add: tag filtering on list pages, search, Kindle integration

---

### Session: 2026-03-24 — Phase 7: Library & Sheet Music Enrichment (7 tasks)

**Completed**:
- **Task 7.1**: TagManager + ExternalLinks + InlineEdit on LibraryDetail (books)
- **Task 7.2**: TagManager + ExternalLinks + InlineEdit on SheetMusicDetail + fixed stale /artists path
- **Task 7.3**: PersonDetail shows "Books" section (author name match), LibraryDetail links author to person entity
- **Task 7.4**: SheetMusicDetail shows "Related Recordings" via performer cross-refs. PersonDetail and BandDetail show "Sheet Music" sections (reverse links from sheet_music_performer)
- **Task 7.5**: Bulk-tagged 306 books with library_type + content tags (yoga, spiritual, medical, technical, etc.)
- **Task 7.6**: Bulk-tagged 112 sheet music with genre tags (rock, pop, folk, country, soul, reggae, world)
- **Task 7.7**: Build verified clean. All pages follow established component patterns.

**Key Changes**:
- LibraryDetail now has full parity with MovieDetail: InlineEdit, ExternalLinks, TagManager, author-to-person link
- SheetMusicDetail now has full parity: InlineEdit, ExternalLinks, TagManager, cross-refs to persons/bands, related recordings
- PersonDetail shows Sheet Music + Books sections (reverse graph edges)
- BandDetail shows Sheet Music section (reverse graph edges)
- Fixed stale /artists route in SheetMusicDetail cross-refs (now routes to /persons after artist merge)

**Scripts Created**:
- `scripts/bulk-tag.mjs` — rule-based tagging for books (library_type + content) and sheet music (genre by artist)

**Manual Tag Corrections**:
- Máj → poetry, creative (Czech romantic poem, not non-fiction)
- Předpoklady vzpřímeného držení těla → manual, medical
- Staré pověsti české → prose, historical
- Katyně → prose, historical, political

**Phase 7 Extension (same session)**:
- **Task 7.8**: Created 182 person entities (169 book authors + 13 sheet music artists) and 12 band entities (sheet music). Created 62 sheet_music_performer cross-refs. Near-match handling for Rolling Stones, Nick Cave, Patti Smith, Johnny Cash, Jiri Suchy.
- **Task 7.9**: Tag dictionary expanded: +instrument category (guitar, piano, vocals, etc.), +role category (actor, director, artist, author, composer, producer)
- **Task 7.10**: Data Management page at /data with 5 tabs: Overview (entity counts, link/tag stats), Books (linked/unlinked), Sheets (linked/unlinked), Persons (by role browser), Tags (dictionary with usage counts)

**Scripts Created**:
- `scripts/create-missing-entities.mjs` — creates person/band entities for unmatched book authors and sheet music artists, plus cross-refs

**Entity Counts After Migration**:
- Persons: 234 → ~416 (added 169 authors + 13 artists)
- Bands: 33 → 45 (added 12 sheet music bands)
- Cross-refs: 21 → 83 (added 62 sheet_music_performer)

**Phase 7 Further Extension (same session)**:
- **Task 7.11**: Fuzzy name matching — normalize() strips diacritics, fuzzyMatch() does substring matching. Fixed "Tři sestry"↔"Tri sestry", "Rolling Stones"↔"The Rolling Stones", "Nick Cave"↔"Nick Cave & The Bad Seeds". Applied to SheetMusicDetail, LibraryDetail, PersonDetail, BandDetail. Nav: Persons→People. PersonList: +Author filter.
- **Task 7.12**: Tag dictionary method descriptions — each category now has a `method` field explaining how tags were established.
- **Task 7.13**: Bulk-tagged 649 remaining items: 416 persons (role from roles[]), 45 bands (genre), 94 movies (entertainment), 94 recordings (genre from performer). Data page Tags tab shows coverage per entity type. 0 untagged items across all entity types.

**Scripts Created**:
- `scripts/bulk-tag-all.mjs` — tags persons (role), bands (genre), movies (entertainment), recordings (genre from performer)

**Next Session**:
- All phases 0-7 complete (13 tasks in Phase 7)
- Could add: tag filtering on list pages, search, Kindle integration

---

<!-- Sessions are prepended above this line -->
