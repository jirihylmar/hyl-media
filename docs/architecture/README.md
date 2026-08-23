# Architecture Documentation

## Diagram

![HYL Media Architecture](hyl_media_architecture.png)

## Components

| Component | Resource Name | Purpose |
|-----------|---------------|---------|
| Amplify App | `d2r70lavusnzlx` | Hosting, CI/CD from GitHub `main` |
| CloudFront | via Amplify Hosting | SPA delivery with custom rewrite rules |
| Cognito | `eu-central-1_GJhwO2ww5` | Email/password authentication |
| AppSync | `366ya64s65cqjhilw34nx5r2vu` | GraphQL: DC custom resolvers only (legacy CRUD removed in Phase 17.6e) |
| metadata-api Lambda | `amplify-...-metadataapilambda*` | DC read/write over the metadata-repository table |
| **DynamoDB (DC store)** | `hyl-media-metadata-repository` | **Sole read/write store — 1242 conformant DC records (PK=id), GSI `resource-account-index`** |
| Secrets Manager | `hyl-media/anthropic-api-key` | Anthropic key for Claude enrichment (runtime fetch only) |

> **As of Phase 17.6e the cutover is COMPLETE.** The app reads and writes entirely from the DC
> metadata-repository (`hyl-media-metadata-repository`). The legacy `KnowledgeGraphItem` table was
> **DELETED** (backup under the storage bucket's `backups/` prefix); the create path is now the
> operator agent panel for entities and `AssetUpload` → `createDocumentMetadata` for PDF uploads,
> and relationship display resolves DC URI fields.

## Dublin Core Metadata Repository (Phases 15–19)

The catalog is stored in the **Digital Horizon metadata-repository** format — every item is
described by a **conformant sidecar** that the DH Python CLI syncs into DynamoDB.

**Since Phase 22 most resources are VIRTUAL** — metadata-only, with no S3 content object
(`_virtual: true`, `s3_key: null`, `dc_source_uri: null`). Measured live: **824 of 1242 records are
virtual**; the 418 non-virtual ones are exactly the `documents` category (books + sheet music with
real PDF bytes).

**S3 layout** — measured top-level prefixes are `agent-turns/`, `backups/`, `documents/`,
`library/`, `metadata/`, `sheet-music/`. Note there is **no `datasets/` or `agents/` content
prefix**: those names survive only as `_category` facets underneath `metadata/` (Phase 22 deleted
the descriptor objects they used to hold).

```
documents/<uuid>/<name>.pdf                          # books + sheet music — the only content objects
metadata/<category>/<uuid>/<file>.metadata.json      # the conformant DC sidecars
                                                     #   category = datasets | agents | documents
                                                     #   measured: agents 551, documents 418, datasets 273
library/, sheet-music/                               # legacy upload prefixes, still present
agent-turns/, backups/                               # operator-agent transcripts; legacy table backup
```

**Sidecar structure (exact rules, verified by `scripts/audit-dc-conformance.mjs` — all 1242 ALL PASS):**
top-level `{ id, SK, DocumentId, Title, ContentType, Attributes }` with `DocumentId===id`,
`SK===Attributes.sort_key` of shape `#<lang>#<slug>`; the first **28 `Attributes` keys in the exact
canonical DH order** (`_authors … dc_is_part_of`), then hyl-media domain extensions. **Unlike the 28,
the extension tail is conditional and its order is NOT a conformance rule** — the auditor validates
only `Object.keys(Attributes).slice(0, 28)`. Extension keys seen live include `dc_creator`,
`dc_contributor`, `_entity_kind`, `_legacy_id`, `_tags`, `_external_links`, `_given_name`,
`_family_name`, `_roles`, `_virtual`, and the relationship extensions `_cast_uris` /
`_performer_uris`; which appear depends on the record;
`dc_type` ∈ DCMI {Text, Sound, Dataset, MovingImage, …} + `Agent` (dcterms:Agent — for
person/band/collaboration, which have no DCMI type and carry `_category = agents`);
`dc_source_uri` derived from bucket+key **for file-backed records only** — virtual records have
both `s3_key` and `dc_source_uri` null.

**Lifecycle — the `managed-resource` skill** (`.claude/commands/managed-resource.md`):

```
create/emit sidecar → DH CLI sync (S3→DDB) → enrich (Claude) → reconcile (DDB→S3) → edit/pin → approve → verify
```

- **Enrichment** (`scripts/enrich-dc.mjs`): Claude (`claude-opus-4-8`) fills `dc_abstract` + refines
  `dc_subject`. Key fetched at runtime from Secrets Manager. Branches **public vs private** by whether
  a *resolved* authoritative link exists (wikipedia/imdb/musicbrainz/openlibrary/goodreads/discogs) —
  public uses world knowledge, private uses only record fields + **embedded PDF metadata** (`pdfinfo`),
  no fabrication. Writes a `public`/`private` curation tag. Respects `_explicit_fields` pins.
- **Reconcile** (`scripts/sync-dc-to-s3.mjs`): pushes DDB values back into the S3 sidecars in
  canonical order, keeping **S3 as the source of truth** so a CLI re-sync is safe.
- **Frontend**: each detail page shows a **"metadata" link** (`MetadataLink` in `DcEntityHeader`)
  opening the signed raw sidecar JSON.

**Coverage:** all 1242 records have `dc_abstract` + refined `dc_subject`. Visibility tags measured
live: **566 public / 534 private / 142 carrying neither** (the 142 are records created after the
Phase 18.3 batch enrichment run, mostly via the operator agent).

## Data Model (Single-Table Design)

Counts measured live against `hyl-media-metadata-repository` (1242 records total); the kind is
`Attributes._entity_kind`.

| Entity Type | Count | `_category` | Description |
|-------------|-------|-------------|-------------|
| person | 484 | agents | Actors, directors, authors, artists, musicians |
| book | 307 | documents | Library items with author, real PDF content |
| recording | 172 | datasets | Songs/tracks with performer links (virtual) |
| sheet_music | 112 | documents | Chord sheets with artist, real PDF content |
| movie | 100 | datasets | Films with language, cast links (virtual) |
| band | 59 | agents | Music groups |
| collaboration | 8 | agents | Music collaborations (reuses BandDetail) |

**Relationships are no longer entities.** The legacy `movie_cast` / `recording_performer` /
`sheet_music_performer` cross-reference *rows* died with the `KnowledgeGraphItem` table. An edge is
now a **URI field inside both records' `Attributes`**: `dc_relation` (string[]), `dc_has_part`
(string[]), `dc_is_part_of` (string), plus the extensions `_cast_uris` and `_performer_uris`.
Consumers take path segment `[1]` of the URI as the target primary key (`pkFromUri`,
`src/lib/dcMap.ts`) and never fetch the object.

### Key Fields on All Entities

These are the **Dublin Core** field names; the camelCase legacy names (`externalLinks`, `tags`,
`updatedAt`) died with the legacy table.

- `_external_links` — external link storage (`Array<{url, type}>`)
- `_tags` — string array, controlled vocabulary from the tag dictionary
- `_explicit_fields` — operator-pinned fields that enrichment must not overwrite
- `_created_at` / `_last_updated_at` — audit trail
- `_approval_status` / `_approved_by` / `_approved_at` — review lifecycle

### External Link Sources

> **Coverage figures below are from Phase 8 (2026-03-24) and have NOT been re-measured since the
> Dublin Core migration.** They are retained as the last known survey, not as current state. The
> denominator alone has moved from 1,067 to 1,242 records.

| Type | Used For | Coverage |
|------|----------|----------|
| wikipedia | All entity types | Movies 100%, Bands 100%, People 63%, Recordings 73%, Sheets 59% |
| imdb | Movies, People (actors/directors) | Movies 100%, People 47% |
| nkp | Books (Czech National Library) | 100% |
| openlibrary | Books (international) | 20% |
| musicbrainz | Recordings, Sheet Music | Recordings 90%, Sheets 85% |
| supermusic | Recordings, Sheet Music | Recordings 97%, Sheets 100% |

Total (Phase 8 survey): 908/1,067 items had at least one external link (85%).

## S3 Buckets (all managed by Amplify stack)

| Bucket | Type | Contents |
|--------|------|----------|
| `...-hylmediastoragebucketefb-*` | User content | `documents/` (PDF content), `metadata/` (DC sidecars), `library/` + `sheet-music/` (legacy upload prefixes), `agent-turns/`, `backups/` |
| `...-amplifydataamplifycodege-*` | Amplify internal | CodeGen artifacts |
| `...-modelintrospectionschema-*` | Amplify internal | GraphQL schema introspection |

All 3 buckets are created and managed by the Amplify CloudFormation stack. Do not delete them manually.

## DynamoDB GSIs

The six GSIs previously listed here (`byType`, `byCastMovie`, `byPersonFilm`, `byRecording`,
`byPerformer`, `byLanguage`) belonged to the **deleted** `KnowledgeGraphItem` table and no longer
exist. The DC store has one, verified live:

| GSI | Purpose |
|-----|---------|
| `resource-account-index` | Select the records belonging to a registered resource account (`hylm`) |

Everything else is a `Scan` with a filter on `Attributes.dc_type` or `Attributes._entity_kind` —
the corpus is ~1.2k records, so this is deliberate, not an oversight.

## Frontend — Navigation

The app uses a **Dossier-first** navigation model:

```
/                    Dossier (main hub — 8 tabs: Overview, Movies, Bands, People,
                     Recordings, Library, Sheet Music, Tags)
  /?tab=movies       Deep-link to specific Dossier tab
  /movies            Movie list (+ New, filters) — breadcrumb back to Dossier
  /movies/:id        Movie detail (inline edit, cast, tags, links) — breadcrumb
  /persons            People list — breadcrumb back to Dossier
  /persons/:id       Person detail — breadcrumb
  /bands             Band list — breadcrumb
  /bands/:id         Band detail — breadcrumb
  /collaborations    Collaboration list — breadcrumb
  /collaborations/:id Collaboration detail (reuses BandDetail)
  /recordings        Recording list — breadcrumb
  /recordings/:id    Recording detail — breadcrumb
  /library           Library list (+ Upload Book) — breadcrumb
  /library/:id       Book detail — breadcrumb
  /sheet-music       Sheet music list (+ Upload) — breadcrumb
  /sheet-music/:id   Sheet music detail — breadcrumb
  /dossier           Alias for / (backward compat)
```

**Layout**: Minimal top bar (logo + user/sign out). No sidebar. Full-width content.

**Visual theme**: 80s FBI terminal — dark background, green monospace text, CRT scanline overlay.

## Regenerating Diagram

```bash
python3 docs/architecture/generate.py
```

Requirements:
- `pip3 install diagrams`
- `apt-get install graphviz`
