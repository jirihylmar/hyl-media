# Phase 15: Dublin Core Metadata Model — Design & Foundation

## Objective
Make hyl-media's metadata **byte-compatible** with the Digital Horizon `metadata-repository`
(`/home/ubuntu/digital-horizon-playbook`). The format, naming conventions, and **S3
organization MUST match** — the DH metadata is designed for Elasticsearch/Kendra, not just
pure Dublin Core, so field names, prefixes, and layout matter as much as DC semantics.

This phase is **design + foundation only** and is **non-destructive**: it produces the spec,
vocab, S3-layout plan, the faithful builder/resolver modules, table+bucket registration, and a
read-only dry-run audit. No entity data is written to S3/DDB yet — Phase 16 does the migration.

## Confirmed design decisions (session 2026-06-14)
- **Own table** `hyl-media-metadata-repository`, **created by the reused Python CLI** (not
  Amplify), identical schema to DH (PK/SK + `resource-account-index`).
- **Authoritative format = the "conformant sidecar"** (the `metadata.ts` shape), NOT the
  legacy auto-generated table-doc shape. Reference:
  `digital-horizon-playbook/digital-horizon-platform/amplify/functions/recordings/_shared/metadata.ts`
  and `.../docs/metadata-repository-producers.md`.
- **All entity types** become first-class S3 artifacts. File-backed assets (book, sheet_music)
  keep their PDF/epub; non-file entities (movie, person, band, recording, collaboration) get a
  **JSON descriptor** at `<bucket>/datasets/<uuid>/<slug>.json`.
- Each artifact gets a sidecar at `<bucket>/metadata/<category>/<uuid>/<file>.metadata.json`.
- **Relationships collapse** into DC terms (`dc_creator`, `dc_contributor`, `dc_isPartOf`,
  `dc_hasPart`, `dc_relation`) — the 3 cross-ref item types retire after migration.
- **Sync** via the existing `tools/metadata-repository` CLI (Path 2: S3 sidecars → CLI upsert).
- **Full lifecycle** (`_explicit_fields` pinning, Claude enrichment, approve/regenerate/edit)
  is deferred to **Phase 18**.

## Roadmap (later phases, added via /add-work once design lands)
- **Phase 16 — Migration**: emit JSON descriptors + sidecars to S3, run CLI sync, populate table.
- **Phase 17 — Frontend on DC store**: app reads/writes the metadata-repository.
- **Phase 18 — Full lifecycle**: `_explicit_fields`, Claude enrichment, approve/regenerate/edit.

## Conformant sidecar shape (target)
```json
{
  "id": "<uuid>",
  "SK": "#<language_code>#<sort-key-slug>",
  "DocumentId": "<uuid>",
  "Title": "<ASCII-folded title>",
  "ContentType": "<AUDIO|DATASET|TEXT|JSON|MARKDOWN|PDF|...>",
  "Attributes": {
    "_authors": ["..."],
    "_category": "audio|datasets|documents",
    "_created_at": "<ISO8601>",
    "_document_title": "<ASCII-folded>",
    "_explicit_fields": [],
    "_file_type": "json|pdf|mp3|...",
    "_last_updated_at": "<ISO8601>",
    "s3_bucket": "...",
    "s3_key": "<category>/<uuid>/<file>",
    "dc_source_uri": "https://<bucket>.s3.<region>.amazonaws.com/<s3_key>",
    "sort_key": "#<lang>#<slug>",
    "language_code": "cs|en|sk|auto",
    "additional_languages": [],
    "size_estimate": "small file|medium file|big file|",
    "daytime_estimate": "",
    "dc_title": "<full-unicode title>",
    "dc_type": "MovingImage|Sound|Text|Dataset|...",
    "dc_abstract": "...",
    "dc_subject": ["..."],
    "dc_rights_holder": "<first author|null>",
    "dc_license": "copyright",
    "dc_accrual_method": "creation",
    "dc_source": null,
    "dc_relation": null,
    "dc_has_format": null,
    "dc_is_format_of": null,
    "dc_has_part": null,
    "dc_is_part_of": null
  }
}
```

## S3 organization (must match DH exactly)
```
<bucket>/<category>/<uuid>/<filename>                        ← content artifact
<bucket>/metadata/<category>/<uuid>/<filename>.metadata.json ← sidecar
```
`<category>` ∈ {`audio`, `datasets`, `documents`}. hyl-media: books/sheet_music → `documents`,
JSON descriptors → `datasets`. Rows tagged with a `resource_account` registry key.

## Tasks

### Task 15.1: DC field-mapping spec
- **Size**: medium
- **Verify**: `docs/dc-metadata-mapping.md` covers all 8 entity types + 3 relationship types, each field mapped
- **Deliverable**: `docs/dc-metadata-mapping.md`
- Map every hyl-media field (name, givenName/familyName, roles, author, artistName, tags,
  externalLinks, s3Key, format, language) to a conformant-sidecar field.
- Map relationship items (recording_performer, recording_movie, sheet_music_performer) to the
  DC relationship vocabulary.
- Resolve `dc_type` per entity (DCMI): movie=MovingImage, recording=Sound, book/sheet_music=Text;
  decide agent descriptors (person/band/collaboration). Document the work-vs-artifact distinction.
- Decide how `tags`/`externalLinks` map (e.g. tags → `dc_subject` vs a custom Attributes field;
  externalLinks → `dc_relation` / `dc_source`).

### Task 15.2: S3 layout + category/bucket plan
- **Size**: small
- **Verify**: `scripts/lib/dc-paths.mjs` emits correct content + sidecar keys for a sample book and movie
- **Deliverable**: `scripts/lib/dc-paths.mjs` + a docs section
- **Depends on**: 15.1
- Define hyl-media's resource bucket + `resource_account` registry key (e.g. `hylm`).
- Implement content-key and sidecar-key builders mirroring DH naming.

### Task 15.3: Revise IMPLEMENTATION_PLAN.md
- **Size**: small
- **Verify**: IMPLEMENTATION_PLAN.md has a Dublin Core Metadata Model section
- **Deliverable**: Updated `IMPLEMENTATION_PLAN.md`
- **Depends on**: 15.1, 15.2
- Document the table, conformant-sidecar format, S3 layout, CLI sync pipeline.
- **Explicitly document the deviation from Critical Rule #6**: the metadata-repository table is
  CLI-created (not Amplify) to stay identical to Digital Horizon.

### Task 15.4: Faithful port of the conformant-sidecar builder
- **Size**: medium
- **Verify**: `scripts/lib/build-dc-sidecar.mjs` output matches `metadata.ts` field set + `#lang#slug` SK byte-for-byte on samples
- **Deliverable**: `scripts/lib/build-dc-sidecar.mjs`
- **Depends on**: 15.1
- Port `buildDublinCoreSidecar`, `convertToAscii` (Czech `ASCII_FOLD_MAP`), `sortKeySlug`,
  `dcSourceUriFor`, `derivedArtifactId`, `normalizeExplicitFields`, `sizeEstimate`,
  `contentTypeForExt`. Pure functions, no AWS deps.

### Task 15.5: Entity→artifact + relationship→DC-links resolver
- **Size**: medium
- **Verify**: `scripts/lib/entity-to-dc.mjs`: a recording with performer + movie cross-refs yields a JSON descriptor + correct `dc_creator`/`dc_isPartOf`/`dc_relation`
- **Deliverable**: `scripts/lib/entity-to-dc.mjs`
- **Depends on**: 15.2, 15.4
- Turn a KnowledgeGraphItem (+ its cross-refs) into (a) the descriptor content object and
  (b) the sidecar with `dc_*` relationship fields. Uses 15.4 builder + 15.2 paths.

### Task 15.6: Register bucket + create empty table via CLI
- **Size**: small
- **Verify**: CLI `describe-table` shows `hyl-media-metadata-repository` with PK/SK + `resource-account-index`; hyl-media bucket in registry
- **Depends on**: 15.2
- Reuse `tools/metadata-repository` CLI. Register hyl-media's bucket + `resource_account` key.
- Run `create-table` for the own table (account 299, eu-central-1). Empty — non-destructive.

### Task 15.7: Read-only dry-run migration audit
- **Size**: medium
- **Verify**: `scripts/audit-dc-migration.mjs` writes would-be sidecars to a local dir (no S3/DDB writes), reports counts per `dc_type`/category, flags SK collisions + unmapped fields
- **Deliverable**: `scripts/audit-dc-migration.mjs` + report
- **Depends on**: 15.4, 15.5
- Read real DynamoDB via `mcp__aws-vsb-299__call_aws` (read-only). Run builder + resolver across
  all entities. Surface SK collisions (same `#lang#slug`) and source fields not mapped to a DC field.
