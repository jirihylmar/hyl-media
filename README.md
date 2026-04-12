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

| Entity Type | Count | Description |
|-------------|-------|-------------|
| Movies | 94 | Films with cast, soundtrack links |
| People | 416 | Actors, directors, authors, artists, musicians |
| Bands | 45 | Music groups |
| Collaborations | 8 | Music collaborations |
| Recordings | 94 | Songs/tracks with performer links |
| Books | 306 | PDF/epub library with S3 storage |
| Sheet Music | 112 | Chord sheet PDFs with S3 storage |

~1,600 total items. 85% have external links (Wikipedia, IMDB, NKP, MusicBrainz, etc.).

## Features

- **Dossier hub** — single-page overview with tabs for all entity types, stats, tag coverage
- **Inline editing** — click any field to edit (name, language, tags, external links)
- **Relationship navigation** — movies link to cast, recordings to performers, books to authors
- **Create forms** — add new entities or upload book/sheet music PDFs
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
/library       Book list + upload
/sheet-music   Sheet music list + upload
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

## Testing

Tests are **mandatory** before creating any pull request.

```bash
npm test            # Run all tests (must pass before PR)
npm run test:watch  # Watch mode during development
```

**Stack**: Vitest + React Testing Library + jsdom

| Test File | What it covers |
|-----------|---------------|
| `src/lib/tagDictionary.test.ts` | Tag dictionary, categories, recommended tag |
| `src/components/SoundtrackManager.test.tsx` | Bidirectional movie-recording linking |
| `src/components/TagManager.test.tsx` | Tag picker, toggle, remove |
| `src/components/CreateEntityForm.test.tsx` | Entity creation, auto-tagging with recommended |

## Project Status

All 63 tasks across 11 phases complete. See [progress.json](progress.json) for full history.
