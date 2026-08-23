---
description: Manage a Dublin Core resource through its full lifecycle (create → sync → enrich → reconcile → edit/pin → approve → verify) on the hyl-media metadata-repository (project)
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

# Managed Resource

The single workflow for taking a hyl-media catalog item through the **Digital Horizon
metadata-repository lifecycle**. Every resource is described by a **conformant
sidecar** (`metadata/<category>/<uuid>/<file>.metadata.json`); the DH Python CLI syncs sidecars
into the `hyl-media-metadata-repository` DynamoDB table; Claude enrichment fills Dublin Core fields;
operator edits are pinned so enrichment never clobbers them.

> **Since Phase 22 most resources are VIRTUAL** — metadata-only, with **no S3 content object**
> (`_virtual: true`, `s3_key: null`, `dc_source_uri: null`). Measured live: 824 of 1242 records are
> virtual; the 418 non-virtual ones are exactly the `documents` category (books + sheet music with
> real PDF bytes). There is **no `datasets/` or `agents/` content prefix in the bucket** — those
> names are `_category` facets underneath `metadata/` only.

This skill is the operator-facing contract. The future **frontend "managed resource" dialog mirrors
these exact steps** — keep them in lockstep.

> **Source-of-truth rule:** the **S3 sidecar is authoritative**. DDB is its synced mirror (+ a `PK`
> and S3-sync fields the CLI adds). Any write that lands only in DDB MUST be reconciled back to S3
> (Step 4) or a future CLI re-sync will clobber it.

---

## The conformant structure (EXACT RULES — the whole record, not just dc_* terms)

A sidecar is `{ id, SK, DocumentId, Title, ContentType, Attributes }` and MUST satisfy:

- **Top level:** `DocumentId === id`; `SK === Attributes.sort_key`; `SK` shape `#<lang>#<slug>`;
  `Title` (ASCII-folded) and `ContentType` non-empty.
- **`Attributes`** — the first **28 keys in this exact order** (DH `buildDublinCoreSidecar`):
  `_authors, _category, _created_at, _document_title, _explicit_fields, _file_type,
  _last_updated_at, s3_bucket, s3_key, dc_source_uri, sort_key, language_code,
  additional_languages, size_estimate, daytime_estimate, dc_title, dc_type, dc_abstract,
  dc_subject, dc_rights_holder, dc_license, dc_accrual_method, dc_source, dc_relation,
  dc_has_format, dc_is_format_of, dc_has_part, dc_is_part_of`.
  hyl-media then APPENDS its domain extensions. **Unlike the 28 above, the tail is conditional and
  its ORDER IS NOT A CONFORMANCE RULE** — `scripts/audit-dc-conformance.mjs` validates only
  `Object.keys(Attributes).slice(0, 28)`. Keys seen live: `dc_creator, dc_contributor, _entity_kind,
  _legacy_id, _tags, _external_links, _given_name, _family_name, _roles, _virtual`, plus the
  relationship extensions `_cast_uris` / `_performer_uris`. Which appear depends on the record —
  e.g. `_virtual` is present on the 824 metadata-only rows and absent on the 418 `documents` rows.
- **Values:** `dc_type` ∈ {Text, Sound, Dataset, MovingImage, Image, InteractiveResource, Service}
  **+ `Agent`** for agent entities (dcterms:Agent — the DCMI Type Vocabulary has no agent type);
  `_category` ∈ {audio, datasets, documents, **agents**};
  `dc_source_uri === https://<bucket>.s3.<region>.amazonaws.com/<s3_key>` **for file-backed rows
  only** — virtual rows have `s3_key` and `dc_source_uri` both `null`.
- **Per-kind typing** (the category below is `_category`, i.e. the `metadata/` facet — NOT a content
  path): movie→`MovingImage`, recording→`Sound` (`_category=datasets`, virtual);
  book/sheet_music→`Text` (`_category=documents`, real PDF under `documents/<uuid>/`);
  **person/band/collaboration→`Agent`** (`_category=agents`, virtual, ContentType
  PERSON/BAND/COLLABORATION).
  The real entity kind is always in `_entity_kind`.
- Reference: `docs/dc-metadata-mapping.md`, and the DH builder
  `/home/ubuntu/digital-horizon-playbook/.../recordings/_shared/metadata.ts`.

**Always verify with the auditor (Step 7) — it encodes every rule above.**

---

## Steps

### 0. Verify AWS access (ALWAYS)
```
mcp__aws-mcp__aws___call_aws  cli_command="aws sts get-caller-identity"  aws_profile="vsb-299"
```
Must return `299025166536`. STOP if wrong. (STS is global — this one call needs no region;
every regional call below needs `--region eu-central-1` inside `cli_command`.)

> The account comes from the **tool parameter** `aws_profile="vsb-299"`. A `--profile` flag inside
> `cli_command` is hard-rejected, and omitting `aws_profile` silently hits the WRONG account
> (`vsb-030`). See CLAUDE.md § CRITICAL: AWS Access Rules.

### 1. Create / register a resource (sidecar always; content only for real files)
Person, band, movie, recording, collaboration — and file-less books/sheet music — are
**metadata-only**: a sidecar with `_virtual=true` and null `s3_key`/`dc_source_uri`/`_file_type`,
and **no content object**. Only real PDFs get content, under `documents/<uuid>/`.
- `scripts/lib/build-dc-sidecar.mjs` (faithful port of the DH builder — 28 Attributes in order),
- `scripts/lib/entity-to-dc.mjs` (entity/relationship → DC; `entityToDc` always returns
  `descriptor: null`),
- **Current create paths:** the operator agent panel (`amplify/functions/agent/dc-emit.ts` +
  `writes.ts` `createResource`) for entities; the `createDocumentMetadata` mutation, driven by
  `AssetUpload`, for PDF uploads.

> ⛔ `scripts/migrate-to-dc.mjs` is a **historical one-shot** (Phase 16) and is **NOT a step in this
> lifecycle — do not run it.** It scans the deleted `KnowledgeGraphItem` table, so it fails at
> `scanAll()`; and because `descriptor` is now permanently null, every entity would fall into its
> PDF-copy branch with an undefined key. Reviving it would produce a *wrong* migration, not merely
> a failed one.

### 2. Sync sidecars → DynamoDB (DH Python CLI)
The table is populated by the reused DH CLI (registered bucket key `hylm`).
```bash
# The DH CLI is NOT in this repo — there is no hyl-media/tools/. It lives at:
#   /home/ubuntu/digital-horizon-playbook/digital-horizon-platform/tools/metadata-repository
# One-time install (the .venv is gitignored and is currently ABSENT):
#   python3 -m venv .venv && .venv/bin/pip install -e .
# `update-metadata` is a Click SUBCOMMAND, not an executable, and --config is MANDATORY:
# without it the CLI targets DH's own table and rejects `hylm`.
# --dry-run is the opt-out; it WRITES by default. There is no --apply flag.
.venv/bin/metadata-repository \
  --config /home/ubuntu/hyl-media/config/metadata-repository.yaml \
  update-metadata --resource hylm
```
Confirm with `mcp__aws-mcp__aws___call_aws`, passing
`cli_command="aws dynamodb scan --table-name hyl-media-metadata-repository --select COUNT --region eu-central-1"`
and `aws_profile="vsb-299"`. **`--region` is mandatory** — without it the profile resolves to
`eu-west-1` and the call returns `ResourceNotFoundException`.

### 3. Enrich Dublin Core (Claude — public/private aware)
```
AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 \
  node scripts/enrich-dc.mjs [--kind <movie|person|band|recording|book|sheet_music>] [--limit N] [--apply]
```
- Key auto-sourced from Secrets Manager `hyl-media/anthropic-api-key` (never logged/committed).
- **Public vs private** is decided by a *resolved* authoritative link
  (wikipedia/imdb/musicbrainz/openlibrary/goodreads/discogs/databazeknih). `nkp`/`supermusic` are
  auto-generated SEARCH urls (excluded); `youtube` is weak (excluded).
- **Public** → world knowledge OK. **Private** → strictly record fields + **embedded PDF metadata**
  (`pdfinfo` over the S3 PDF) — NO fabricated facts.
- Writes `dc_abstract`, `dc_subject`, a `public`/`private` curation tag in `_tags`, bumps
  `_last_updated_at`. **Respects `_explicit_fields` pins.** Writes to **DDB only** → go to Step 4.

### 4. Reconcile S3 sidecars ← DDB (MANDATORY after Step 3)
```
node scripts/sync-dc-to-s3.mjs [--limit N] [--apply]
```
Rebuilds each sidecar's `Attributes` in canonical order with values from DDB, writes back to S3.
Idempotent (only writes changed sidecars). After this, S3 == DDB and a CLI re-sync is safe.

### 5. Edit + pin (operator / frontend)
**Two paths write operator edits, and only the agent path pins.**

- **Frontend inline edit → the `updateMetadata` mutation** (`amplify/functions/metadata-api/handler.ts`,
  SET-only). Its allowlist is only `dc_title | language_code | _tags | _external_links`. Anything
  else in the patch is **silently dropped** — no error. A `dc_title` rename also refreshes the
  ASCII-folded `Title` / `_document_title`. **This path does NOT write `_explicit_fields`: nothing
  edited here is pinned.** Consequence: a hand-edited `_tags` value is clobbered by Step 3, whose
  pin check covers `dc_abstract` only.
- **Agent `update_metadata`** (`amplify/functions/agent/writes.ts`). Allowlist
  `dc_abstract | dc_title | dc_subject | language_code | _tags | dc_creator | dc_contributor`, and
  every field it sets **is** unioned into `_explicit_fields`. Use this path for abstract / subject /
  creator edits you want to survive re-enrichment.
- `dc_license` and `dc_rights_holder` are set once at creation and are editable by **neither** path.

Then re-run Step 4 to push the edit to S3.

### 6. Approve / regenerate (DH lifecycle — shipped as agent tools in `writes.ts`)
Both are operator-driven through the agent panel, not standalone mutations.
- **`regenerate(id)`** → re-derive `dc_abstract` + subjects for non-pinned fields only.
- **`approve(id)`** → set `_approval_status=approved` + `_approved_by` + `_approved_at`;
  reconcile (Step 4).

### 7. Verify (FULL structural conformance — every run)
```
node scripts/audit-dc-conformance.mjs        # whole-structure rules vs the DH example; expect ALL PASS
node scripts/enrich-dc.mjs                    # dry-run: candidates with empty dc_abstract should be ~0
```
Spot-check a private + a public record (abstract sensible, correct language, visibility tag present).

---

## Guardrails
- **Never** hardcode/print/commit the Anthropic key.
- **Never** write to DDB without reconciling to S3 (Step 4).
- **Never** break the 28-key order or the structural rules — the auditor (Step 7) is the gate.
- The legacy `KnowledgeGraphItem` table is already **DELETED** (Phase 17.6e; backup in the bucket's
  `backups/` prefix). Retiring the `library/` + `sheet-music/` S3 prefixes is still **destructive** —
  back up first and get explicit user approval.
