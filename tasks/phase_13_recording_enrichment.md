# Phase 13: Recording Enrichment from YouTube Playlist

## Objective
Parse YouTube playlist TSV (125+ entries), standardize recording entries, create missing bands/persons, and link recording_performer relations in DynamoDB.

## Source
- `input/youtube_playlist.tsv` — YouTube playlist export with Title + URL columns
- Titles encode artist/song in various formats (e.g., "Artist - Song", "Song • Artist", "Artist: Song")

## Tasks

### Task 13.1: Parse TSV into structured JSON
- **Size**: small
- **Verify**: Parsed JSON covers all non-private rows
- **Deliverable**: `scripts/parse-youtube-playlist.mjs` → `input/youtube_parsed.json`
- **Notes**: 
  - Skip `[Private video]` and entries without URLs
  - Parse title patterns: "Artist - Song", "Song • Artist", "Artist: Song (extra)"
  - Use LLM knowledge to resolve ambiguous cases (e.g., "Wicked Game" → Chris Isaak)
  - Extract: artist/band name, song name, featured artists, YouTube URL
  - Assign language codes (cs/sk/en) based on artist knowledge
  - Flag duplicates (same song, different versions)

### Task 13.2: Audit existing DynamoDB recordings
- **Size**: small
- **Verify**: Audit report with match/gap counts
- **Deliverable**: `scripts/audit-recordings.mjs` → console report
- **Notes**:
  - Query all existing recordings, bands, persons from DynamoDB
  - Match parsed entries against existing data (fuzzy, diacritics-insensitive)
  - Report: already exists, needs creation, needs linking

### Task 13.3: Create enrichment script
- **Size**: medium
- **Verify**: Script creates entities with correct relations
- **Deliverable**: `scripts/enrich-recordings.mjs`
- **Notes**:
  - Follow `create-missing-entities.mjs` pattern
  - Deterministic IDs (slugify + hash)
  - Create missing recordings, bands, persons
  - Create recording_performer cross-references
  - Add YouTube external links
  - Add genre tags where known
  - Batch writes (25 items)

### Task 13.4: Run enrichment + verify
- **Size**: small
- **Verify**: Spot-check 10 entries in Dossier
- **Notes**: Execute script, verify in app, check Data Management page counts
