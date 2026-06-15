# Architecture Documentation

## Diagram

![HYL Media Architecture](hyl_media_architecture.png)

## Components

| Component | Resource Name | Purpose |
|-----------|---------------|---------|
| Amplify App | `d2r70lavusnzlx` | Hosting, CI/CD from GitHub `main` |
| CloudFront | via Amplify Hosting | SPA delivery with custom rewrite rules |
| Cognito | `eu-central-1_GJhwO2ww5` | Email/password authentication |
| AppSync | `366ya64s65cqjhilw34nx5r2vu` | GraphQL: DC custom resolvers + legacy CRUD |
| metadata-api Lambda | `amplify-...-metadataapilambda*` | DC read/write over the metadata-repository table |
| **DynamoDB (DC store)** | `hyl-media-metadata-repository` | **Primary read/write store — 1194 conformant DC records (PK=id)** |
| DynamoDB (legacy) | `KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE` | Still live for the create path + relationship cross-refs |
| Secrets Manager | `hyl-media/anthropic-api-key` | Anthropic key for Claude enrichment (runtime fetch only) |

> **As of Phases 17–19** the app reads and edits entities **from the DC metadata-repository**
> (`hyl-media-metadata-repository`). The legacy `KnowledgeGraphItem` table remains live only for
> the create path (CreateEntityForm/AssetUpload) and relationship cross-ref display, pending Phase
> 17.6 decommission.

## Dublin Core Metadata Repository (Phases 15–19)

The catalog is stored in the **Digital Horizon metadata-repository** format — every item is an S3
artifact described by a **conformant sidecar** that the DH Python CLI syncs into DynamoDB.

**S3 layout** (in the storage bucket, alongside the legacy `library/` + `sheet-music/`):

```
datasets/<uuid>/<slug>.json                          # descriptors: person, band, movie, recording, collaboration
documents/<uuid>/<name>.pdf                           # books + sheet music
metadata/<category>/<uuid>/<file>.metadata.json      # the conformant DC sidecars (category = datasets|documents)
```

**Sidecar structure (exact rules, verified by `scripts/audit-dc-conformance.mjs` — all 1194 ALL PASS):**
top-level `{ id, SK, DocumentId, Title, ContentType, Attributes }` with `DocumentId===id`,
`SK===Attributes.sort_key` of shape `#<lang>#<slug>`; the first **28 `Attributes` keys in the exact
canonical DH order** (`_authors … dc_is_part_of`), then hyl-media domain extensions (`dc_creator`,
`_entity_kind`, `_legacy_id`, `_tags`, `_external_links`, `_given_name`, `_family_name`, `_roles`);
`dc_type` ∈ DCMI {Text, Sound, Dataset, MovingImage, …}; `dc_source_uri` derived from bucket+key.

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

**Coverage:** all 1194 records have `dc_abstract` + refined `dc_subject` (520 public / 521 private).

## Data Model (Single-Table Design)

| Entity Type | Count | Description |
|-------------|-------|-------------|
| movie | 94 | Films with language, cast links |
| band | 45 | Music groups |
| person | 416 | Actors, directors, authors, artists, musicians |
| recording | 94 | Songs/tracks with performer links |
| collaboration | 8 | Music collaborations (reuses BandDetail) |
| book | 306 | Library items with author, S3 file reference |
| sheet_music | 112 | Chord sheets with artist, S3 file reference |
| movie_cast | ~400 | Relationship: movie <> person (role) |
| recording_performer | ~160 | Relationship: recording <> person/band |
| sheet_music_performer | ~62 | Relationship: sheet_music <> person/band |

### Key Fields on All Entities

- `externalLinks` — JSON string `Array<{url: string, type: string}>`, flexible external link storage
- `tags` — string array, controlled vocabulary from tag dictionary
- `updatedAt` / `updatedBy` — audit trail

### External Link Sources

| Type | Used For | Coverage |
|------|----------|----------|
| wikipedia | All entity types | Movies 100%, Bands 100%, People 63%, Recordings 73%, Sheets 59% |
| imdb | Movies, People (actors/directors) | Movies 100%, People 47% |
| nkp | Books (Czech National Library) | 100% |
| openlibrary | Books (international) | 20% |
| musicbrainz | Recordings, Sheet Music | Recordings 90%, Sheets 85% |
| supermusic | Recordings, Sheet Music | Recordings 97%, Sheets 100% |

Total: 908/1,067 items have at least one external link (85%).

## S3 Buckets (all managed by Amplify stack)

| Bucket | Type | Contents |
|--------|------|----------|
| `...-hylmediastoragebucketefb-*` | User content | `library/` (307 books), `sheet-music/` (112 PDFs) |
| `...-amplifydataamplifycodege-*` | Amplify internal | CodeGen artifacts |
| `...-modelintrospectionschema-*` | Amplify internal | GraphQL schema introspection |

All 3 buckets are created and managed by the Amplify CloudFormation stack. Do not delete them manually.

## DynamoDB GSIs

| GSI | Partition Key | Sort Key | Purpose |
|-----|---------------|----------|---------|
| byType | entityType | name | List entities by type |
| byCastMovie | movieId | role | Find cast members for a movie |
| byPersonFilm | personId | movieName | Find movies for a person |
| byRecording | recordingId | performerName | Find performers for a recording |
| byPerformer | performerId | recordingName | Find recordings for a performer |
| byLanguage | language | name | Filter by language |

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
