# Phase 6: Enrichment, Tagging & New Content

## Objective
Enable "cowork claude" to enrich existing entries with external links, create new entities, upload assets, and tag resources using controlled vocabularies. Also merge the standalone `artist` entity type into `person`.

---

## Task 6.1: Schema Extension
- Add fields: `wikiUrl`, `imdbUrl`, `spotifyUrl`, `youtubeUrl`
- Add `tags` array field (string array, like `roles`)
- Deploy schema change via Amplify
- **Verify**: Fields exist in schema, deploy succeeds

## Task 6.2: Artist→Person Migration
- Write migration script to:
  - For each of the 3 `artist` items (P!nk, Amy Winehouse, Dario G): create/update matching `person` item with `roles: ['artist']`
  - Update all `recording_performer` items that reference these artists: change `performerType` from `artist` to `person`
  - Delete old `artist` entity items
- Run against production DynamoDB
- **Verify**: `listByType('artist')` returns 0 items, persons have artist role

## Task 6.3: Frontend Cleanup (Artist→Person)
- Remove `/artists` from nav and routes
- Remove ArtistList page
- Update BandDetail to not handle `artist` entityType
- Ensure persons with `roles: ['artist']` show in person list with visible role badge
- **Verify**: No artist route in nav, artist persons visible in person list

## Task 6.4: External Links on Detail Pages
- Add `ExternalLinks` component showing/editing wiki/imdb/spotify/youtube URLs
- Add to all detail pages (movie, person, band, recording)
- Links render as clickable icons/badges when populated
- Inline edit for "cowork" to populate
- **Verify**: Can set imdbUrl on a movie, persists on reload

## Task 6.5: Create New Entity Forms
- Add "New" button on list pages (movies, persons, bands, recordings)
- Form with required fields (name, entityType) + optional fields
- Auto-generate ID from slug (like import scripts do)
- **Verify**: Can create new movie, appears in list

## Task 6.6: Asset Upload
- Add upload button on Library and Sheet Music list pages
- Use Amplify Storage `uploadData()` to S3
- Create DynamoDB metadata entry on upload
- Support PDF, epub file types
- **Verify**: Upload PDF, appears in list with download link

## Task 6.7: Tag Dictionary + Tag Management
- Define controlled vocabularies:
  - **Music genre**: rock, pop, jazz, classical, electronic, folk, blues, country, punk, metal, reggae, soul, hip-hop, soundtrack
  - **Library type**: prose, poetry, beletry (fiction), non-fiction, textbook, reference, manual
  - **Content dimension**: spiritual, technical, creative, educational, entertainment
- Store as `tags` array on entities
- Tag picker component (multi-select from dictionary)
- Add to all detail pages
- Filter by tag on list pages
- **Verify**: Can assign "rock" tag to a recording, filter recordings by tag
