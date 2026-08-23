# HYL Media

Personal media knowledge graph — movies, music, books, sheet music. DynamoDB single-table design with Amplify Gen 2 frontend. 80s FBI terminal aesthetic.

## Live App

**URL**: https://main.d2r70lavusnzlx.amplifyapp.com

**Test Account**:
- Email: `jiri.hylmar@gmail.com`
- Password: `HylMedia123!`

## Architecture

![HYL Media Architecture](docs/architecture/hyl_media_architecture.png)

See [Architecture Documentation](docs/architecture/README.md) for details.

## Stack

- **Frontend**: React + TypeScript + Vite + Amplify UI
- **Backend**: Amplify Gen 2 (AppSync GraphQL + DynamoDB + Cognito + S3)
- **Hosting**: Amplify Hosting (auto-deploy from GitHub `main`)
- **Region**: eu-central-1
- **Account**: 299025166536

## Data

Counts measured live against `hyl-media-metadata-repository` (2026-08-23).

| Entity Type | Count | Description |
|-------------|-------|-------------|
| People | 484 | Actors, directors, authors, artists, musicians |
| Books | 307 | PDF library with S3 storage |
| Recordings | 172 | Songs/tracks with performer links |
| Sheet Music | 112 | Chord sheet PDFs with S3 storage |
| Movies | 100 | Films with cast, soundtrack links |
| Bands | 59 | Music groups |
| Collaborations | 8 | Music collaborations |

**1,242 records total**, all conformant Dublin Core sidecars. 824 are *virtual*
(metadata-only, no S3 content object); the 418 with real PDF bytes are the books and sheet music.
External-link coverage was last surveyed in Phase 8 (85% of 1,067 items then) and has **not**
been re-measured since the Dublin Core migration.

## Features

- **Dossier hub** — single-page overview with tabs for all entity types, stats, tag coverage
- **Inline editing** — click any field to edit (name, language, tags, external links)
- **Relationship navigation** — movies link to cast, recordings to performers, books to authors
- **Operator agent panel** — a Claude tool-use agent creates and edits catalog entries from
  natural language, with a propose → approve → execute gate on every write
- **Global search** — full-text across the catalog
- **Uploads** — add book / sheet music PDFs (entity creation goes through the agent panel;
  the standalone create form was retired in Phase 17.6b)
- **External links** — flexible `{url, type}` system, 10+ source types
- **Tag system** — controlled vocabulary with genre, role, instrument categories
- **Breadcrumb navigation** — `DOSSIER > Movies > [name]` on every page
- **80s FBI terminal theme** — dark background, green monospace, CRT scanlines

## Navigation

```
/              Dossier (main hub)
/movies        Movie list + create
/movies/:id    Movie detail + edit
/persons       People list + create
/bands         Band list + create
/recordings    Recording list + create
/collaborations Collaboration list
/library       Book list + upload
/sheet-music   Sheet music list + upload
/dossier       Alias for / (backward compat)
```

All pages have breadcrumb navigation back to the Dossier.

## Development

```bash
# Install
npm install

# Generate Amplify outputs (requires AWS profile JiHy__vsb__299)
AWS_REGION=eu-central-1 npx ampx generate outputs \
  --app-id d2r70lavusnzlx --branch main --profile JiHy__vsb__299

# Run locally
npm run dev

# Build
npm run build
```

## Project Status

**145 of 148 tasks complete across 24 phases** (1 superseded, 2 pending in Phase 18 — both
realized by Phase 21's agent tools and awaiting a bookkeeping disposition). See
[progress.json](progress.json) for full history.

The catalog runs entirely on the Dublin Core metadata-repository; the legacy `KnowledgeGraphItem`
table was deleted in Phase 17.6e.
