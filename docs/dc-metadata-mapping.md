# Dublin Core Metadata Mapping — hyl-media → Digital Horizon metadata-repository

**Status:** Phase 15.1 design spec (authoritative for Phases 15–18).
**Goal:** make hyl-media metadata **byte-compatible** with the Digital Horizon (DH) metadata
warehouse so the same Elasticsearch/Kendra consumers can index hyl-media's catalog. The
**conformant sidecar** shape (DH `amplify/functions/recordings/_shared/metadata.ts`
`buildDublinCoreSidecar`) is the contract — **not** the legacy `docs/metadata-repository.md`
table-doc shape.

Reference files in `/home/ubuntu/digital-horizon-playbook`:
- `digital-horizon-platform/amplify/functions/recordings/_shared/metadata.ts` (builder)
- `digital-horizon-platform/docs/metadata-repository-producers.md` (producer contract)
- `digital-horizon-platform/tools/metadata-repository/` (sync CLI we reuse)

---

## 1. The conformant record (top level + Attributes)

Every hyl-media entity becomes ONE conformant record (a sidecar JSON in S3, upserted to the
`hyl-media-metadata-repository` DDB table by the CLI). Top-level keys and `Attributes` keys are
**exactly** DH's, in DH's order:

| Top-level | Source |
|---|---|
| `id` | entity UUID (see §4) |
| `SK` | `#<language_code>#<sortKeySlug(dc_title)>` |
| `DocumentId` | = `id` (back-compat alias) |
| `Title` | ASCII-folded `dc_title` |
| `ContentType` | human enum: `PDF` (books/sheet), `DATASET` (descriptors) |

`Attributes` (DH 27-field template + hyl-media `_` extensions — see §3):
`_authors, _category, _created_at, _document_title, _explicit_fields, _file_type,
_last_updated_at, s3_bucket, s3_key, dc_source_uri, sort_key, language_code,
additional_languages, size_estimate, daytime_estimate, dc_title, dc_type, dc_abstract,
dc_subject, dc_rights_holder, dc_license, dc_accrual_method, dc_source, dc_relation,
dc_has_format, dc_is_format_of, dc_has_part, dc_is_part_of` + `_entity_kind, _tags,
_external_links, _given_name, _family_name, _roles` (hyl-media extensions, `_`-prefixed so DH
consumers ignore them and round-trip is lossless).

---

## 2. Per-entity-type mapping

Real DynamoDB shapes confirmed by sampling (2026-06-14). Counts: movie 94, person 442,
book 307, recording 172, sheet_music 112, band ~45, collaboration ~8.

### Shared fields (all entity types)
| hyl-media field | → conformant field | Notes |
|---|---|---|
| `name` | `dc_title` (full Unicode), `Title`/`_document_title` (ASCII-fold), `SK`/`sort_key` (slug) | via `convertToAscii` + `sortKeySlug` |
| `language` (`cs`/`en`) | `language_code` | default `auto` if missing |
| `tags[]` | `dc_subject` (topical subset) + `_tags` (full, lossless) | see §2.7 |
| `externalLinks` (JSON `{url,type}[]`) | `_external_links` (parsed array) | NOT overloaded onto `dc_relation` (reserved for internal edges) |
| `createdAt` | `_created_at` | |
| `updatedAt` | `_last_updated_at` | |
| `updatedBy` | (dropped — not a DC concept; provenance kept in git/import logs) | |
| entity UUID | `id`, `DocumentId`, `PK` | |
| — | `dc_license` = `copyright`, `dc_accrual_method` = `creation`, `_explicit_fields` = `[]`, `additional_languages` = `[]`, `daytime_estimate` = `""` | DH defaults |
| — | `_entity_kind` = original `entityType` | lossless round-trip |

### 2.1 movie → artifact: JSON descriptor
- `dc_type` = **MovingImage**; `_category` = `datasets`; `_file_type` = `json`; `ContentType` = `DATASET`.
- `dc_abstract` = `""` (filled by Phase 18 enrichment).
- Relationships: soundtrack recordings → `dc_has_part` (URIs of recordings), see §2.8.

### 2.2 recording → artifact: JSON descriptor
- `dc_type` = **Sound**; `_category` = `datasets`; `_file_type` = `json`; `ContentType` = `DATASET`.
- Relationships: performers → `dc_creator` (names) + `_performer_uris`; soundtrack-of-movie → `dc_is_part_of` (movie URI).

### 2.3 person → artifact: JSON descriptor (agent)
- `dc_type` = **Dataset** (DCMI has no Agent type; the descriptor is structured data). True kind preserved in `_entity_kind=person`.
- `_category` = `datasets`; `_file_type` = `json`; `ContentType` = `DATASET`.
- `givenName`/`familyName` → `_given_name`/`_family_name`; `roles[]` → `_roles` + `dc_subject` role terms.
- Relationships: authored books, performed recordings, sheet music → `dc_relation` (URIs).

### 2.4 band → artifact: JSON descriptor (agent)
- Same as person but `_entity_kind=band`, no given/family name. `dc_type` = **Dataset**.

### 2.5 collaboration → artifact: JSON descriptor (agent)
- Same as band, `_entity_kind=collaboration`. `dc_type` = **Dataset**.

### 2.6 book → artifact: the existing PDF
- `dc_type` = **Text**; `_category` = `documents`; `_file_type` = `pdf` (from `format`); `ContentType` = `PDF`.
- `author` → `dc_creator` (array of one) + `dc_rights_holder` (first author).
- `s3Key` (currently `library/<name> by <author>.pdf`) → new content key `documents/<uuid>/<filename>` (§4); `dc_source_uri` = https form.

### 2.7 sheet_music → artifact: the existing PDF
- `dc_type` = **Text**; `_category` = `documents`; `_file_type` = `pdf`; `ContentType` = `PDF`.
- `artistName` → `dc_creator` (array of one).
- `s3Key` (currently `sheet-music/<...>.pdf`) → `documents/<uuid>/<filename>`.

### 2.7b tags → dc_subject (topical subset) + `_tags` (lossless)
hyl-media tags span 6 controlled categories. DH `dc_subject` = **content topics only** (excludes
format/role/document-type words). Mapping rule:
- `dc_subject` ⊇ tags from categories `genre`, `content`, `library_type`, `instrument` (topical).
- tags from `role` and `curation` are **excluded** from `dc_subject` (role is provenance, curation is internal), but **kept** in `_tags`.
- `_tags` = the full original `tags[]` array (every category), so nothing is lost.

### 2.8 Relationship items → DC relationship terms

Relationship items (`recording_performer` 61, `recording_movie` 44, `sheet_music_performer`) do
**not** become their own records. They merge into the two endpoint records as DC terms:

| Relationship item | Forward edge (on A) | Reverse edge (on B) |
|---|---|---|
| `recording_performer` (recording → performer) | recording.`dc_creator` += performerName; recording.`_performer_uris` += performer URI | performer.`dc_relation` += recording URI |
| `recording_movie` (recording → movie, "soundtrack") | recording.`dc_is_part_of` = movie URI | movie.`dc_has_part` += recording URI |
| `sheet_music_performer` (sheet → performer) | sheet.`dc_creator` += performerName; sheet.`_performer_uris` += performer URI | performer.`dc_relation` += sheet URI |
| book.`author` (derived, not an item) | book.`dc_creator` += author; `dc_rights_holder` = author | author person.`dc_relation` += book URI (when a matching person exists) |

`dc_creator` carries **names** (DH convention: array of strings). Internal graph edges
(`dc_relation`, `dc_has_part`, `dc_is_part_of`) carry **`dc_source_uri` URIs** (DH convention).
`dc_has_format`/`dc_is_format_of`/`dc_source` are unused by hyl-media (no multi-format bundles)
→ `null`.

---

## 3. DCMI `dc_type` summary

| entityType | dc_type (DCMI) | _category | _file_type | ContentType |
|---|---|---|---|---|
| movie | MovingImage | datasets | json | DATASET |
| recording | Sound | datasets | json | DATASET |
| person | Dataset (agent) | datasets | json | DATASET |
| band | Dataset (agent) | datasets | json | DATASET |
| collaboration | Dataset (agent) | datasets | json | DATASET |
| book | Text | documents | pdf | PDF |
| sheet_music | Text | documents | pdf | PDF |

DCMI Type vocabulary has no "Agent"; agents use `Dataset` (structured descriptor) with the true
kind preserved in `_entity_kind`. `_category` (S3 folder) is decoupled from `dc_type` (semantic),
exactly as DH allows.

---

## 4. Identifiers & S3 organization (see also 15.2)

- **UUID**: existing ids are slug-hash (`12-angry-men_v7jp`), not UUIDs. DH PK is a UUID. We mint
  a deterministic UUIDv5-shaped id via `derivedArtifactId(originalId, entityType)` (ported from
  metadata.ts) so re-runs are idempotent and the original slug-id is preserved in `_legacy_id`.
- **Content key**: `<category>/<uuid>/<filename>` — books/sheet keep their PDF basename;
  descriptors use `<slug>.json`.
- **Sidecar key**: `metadata/<category>/<uuid>/<filename>.metadata.json`.
- **dc_source_uri**: `https://<bucket>.s3.<region>.amazonaws.com/<content-key>`.
- **resource_account**: registry key `hylm` (added to the CLI config in 15.6).

---

## 5. Lifecycle (Phase 18, documented here for completeness)
`_explicit_fields` pins operator-edited DC fields; Claude enrichment fills `dc_abstract` and
refines `dc_subject`; approve/regenerate/edit mutations mirror DH. Not implemented in Phase 15.

---

## 6. Open items resolved
- **Agents have no DCMI type** → use `Dataset` + `_entity_kind` (above).
- **External authority links** (wiki/imdb/spotify/musicbrainz/nkp/…) → kept in `_external_links`,
  not `dc_relation` (which is reserved for internal graph edges).
- **Role/curation tags** → excluded from `dc_subject`, retained in `_tags`.
- **No abstracts today** → `dc_abstract=""`, populated in Phase 18.
