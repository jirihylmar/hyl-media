---
description: Manage a Dublin Core resource through its full lifecycle (create → sync → enrich → reconcile → edit/pin → approve → verify) on the hyl-media metadata-repository (project)
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
  - Write
  - mcp__aws-vsb-299__call_aws
---

# Managed Resource

The single workflow for taking a hyl-media catalog item through the **Digital Horizon
metadata-repository lifecycle**. Every resource is an S3 artifact described by a **conformant
sidecar** (`metadata/<category>/<uuid>/<file>.metadata.json`); the DH Python CLI syncs sidecars
into the `hyl-media-metadata-repository` DynamoDB table; Claude enrichment fills Dublin Core fields;
operator edits are pinned so enrichment never clobbers them.

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
  hyl-media then APPENDS its domain extensions: `dc_creator, dc_contributor, _entity_kind,
  _legacy_id, _tags, _external_links, _given_name, _family_name, _roles`.
- **Values:** `dc_type` ∈ {Text, Sound, Dataset, MovingImage, Image, InteractiveResource, Service};
  `_category` ∈ {audio, datasets, documents} (hyl-media uses datasets + documents);
  `dc_source_uri === https://<bucket>.s3.<region>.amazonaws.com/<s3_key>`.
- Reference: `docs/dc-metadata-mapping.md`, and the DH builder
  `/home/ubuntu/digital-horizon-playbook/.../recordings/_shared/metadata.ts`.

**Always verify with the auditor (Step 7) — it encodes every rule above.**

---

## Steps

### 0. Verify AWS access (ALWAYS)
```
mcp__aws-vsb-299__call_aws aws sts get-caller-identity
```
Must return `299025166536` / `eu-central-1`. STOP if wrong.

### 1. Create / register a resource (emit conformant sidecar + content)
Non-file entities (person, band, movie, recording, collaboration) → a JSON descriptor under
`datasets/<uuid>/`; books + sheet music → the PDF under `documents/<uuid>/`. Sidecars are built by:
- `scripts/lib/build-dc-sidecar.mjs` (faithful port of the DH builder — 28 Attributes in order),
- `scripts/lib/entity-to-dc.mjs` (entity/relationship → DC),
- `scripts/migrate-to-dc.mjs` (`--limit N` / `--apply`) emits descriptors + sidecars + copies PDFs.

### 2. Sync sidecars → DynamoDB (DH Python CLI)
The table is populated by the reused DH CLI (registered bucket key `hylm`):
```
# in tools/metadata-repository (DH CLI); --dry-run is the opt-out, it writes by default
update-metadata --resource hylm
```
Confirm: `mcp__aws-vsb-299__call_aws aws dynamodb scan --table-name hyl-media-metadata-repository --select COUNT`.

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
Operator edits `dc_title|dc_abstract|dc_subject|dc_creator|dc_license|dc_rights_holder` via the
`updateMetadata` mutation (SET-only). Each edited field is added to `_explicit_fields` (the **pin**),
so Step 3 skips it on future runs. Then re-run Step 4 to push the edit to S3.

### 6. Approve / regenerate (DH lifecycle — Phase 18.5)
- **regenerate** → re-run Step 3 for non-pinned fields only.
- **approve** → set `_approval_status=approved`, bump `_last_updated_at`; reconcile (Step 4).

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
- Decommissioning the legacy `KnowledgeGraphItem` table / `library/` + `sheet-music/` prefixes is
  **destructive** — back up first and get explicit user approval (tracked as Phase 17.6).
