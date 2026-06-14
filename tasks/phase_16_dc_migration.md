# Phase 16: Dublin Core Migration — emit to S3 + sync to metadata-repository

## Objective
Execute the migration designed in Phase 15: clean up the 3 data issues the audit found, emit JSON
descriptors + conformant sidecars to S3 in the DC layout, copy book/sheet PDFs into
`documents/<uuid>/`, sync sidecars into `hyl-media-metadata-repository` via the reused Digital
Horizon Python CLI, and verify. **Additive + reversible** — the existing `KnowledgeGraphItem`
table and `library/` + `sheet-music/` S3 prefixes are left intact until the Phase 17 cutover.

## Status: COMPLETE (6/6) — 2026-06-14

## Tasks

### 16.1 Pre-flight data cleanup
- `scripts/lib/entity-to-dc.mjs` `resolveArtifact()`: a file-less `book`/`sheet_music` (no PDF,
  e.g. `syndikat_synd`) → JSON descriptor in `datasets/` (dc_type preserved, `_file_missing`).
- `scripts/dc-preflight-cleanup.mjs`: removed 6 redundant legacy link attrs from 3 items, deleted
  5 junk `tag` items. **Verify**: `npm run audit:dc` → 0 skipped / 0 legacy / 0 tag.

### 16.2 Build `scripts/migrate-to-dc.mjs`
- Emits sidecars (no top-level PK) + descriptors to S3, copies PDFs to `documents/<uuid>/`.
- Flags: `--dry-run` (default), `--apply`, `--limit N`. **Verify**: dry-run = 1194 / 776 / 418.

### 16.3 Validation run
- `--apply --limit 5` to real S3, verified keys, cleaned up. **Verify**: keys correct, then removed.

### 16.4 Full emit to S3
- 1194 sidecars + 776 descriptors + 418 PDF copies (2388 objects). **Verify**: `s3 ls --summarize`.

### 16.5 CLI sync
- `metadata-repository --config config/metadata-repository.yaml update-metadata --resource hylm`:
  1194 writes, 0 failures. **Verify**: MCP scan COUNT = 1194. (CLI writes by default; `--dry-run`
  is the opt-out — there is no `--apply` flag.)

### 16.6 Verify + report
- `scripts/verify-dc-migration.mjs`: counts match audit, all 28 DH keys present, PK==id,
  sort_key==SK, 7 relationship spot-checks. Report: `docs/migration-reports/dc-migration.md`.

## Left for Phase 17 / 18
- Frontend cutover to the metadata-repository (Phase 17); then `_explicit_fields` + Claude
  enrichment + approve/regenerate/edit lifecycle (Phase 18).
- Old `KnowledgeGraphItem` table + `library/`/`sheet-music/` prefixes retired after Phase 17.
