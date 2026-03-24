# Phase 8: Flexible External Links + Link Research

## Objective
Restructure external links from fixed schema fields (`wikiUrl`, `imdbUrl`, `spotifyUrl`, `youtubeUrl`) to a flexible `externalLinks` JSON array of `{url, type}` objects. Then research and populate missing Wikipedia and IMDB links for all entities.

---

## Task 8.1: Schema Change
- Remove `wikiUrl`, `imdbUrl`, `spotifyUrl`, `youtubeUrl` fields
- Add `externalLinks` string field (JSON-serialized `Array<{url: string, type: string}>`)
- Type values: `"wikipedia"`, `"imdb"`, `"spotify"`, `"youtube"`, extensible to any
- **Verify**: `amplify/data/resource.ts` has `externalLinks` field, old fields removed

## Task 8.2: Data Migration
- Write migration script to read all items with any of the 4 old URL fields
- Convert to `externalLinks` JSON array
- Write back, clear old fields
- **Verify**: Spot-check 10 items with links preserved in new format

## Task 8.3: Refactor ExternalLinks Component
- Read/write from `externalLinks` JSON string
- Parse/serialize `Array<{url: string, type: string}>`
- Known types get icons/colors (wikipedia, imdb, spotify, youtube)
- Support adding links with custom type
- **Verify**: Can add/edit/remove links of any type on movie detail

## Task 8.4: Update All Detail Pages
- Update MovieDetail, PersonDetail, BandDetail, RecordingDetail, LibraryDetail, SheetMusicDetail
- Pass `externalLinks` string prop instead of 4 separate URL props
- **Verify**: All 6 detail page types render links correctly

## Task 8.5: Deploy and Verify
- `npm run build` succeeds
- Push to main → Amplify auto-deploy
- Spot-check links on live site
- **Verify**: Build passes, links display correctly

## Task 8.6: Research + Add Wikipedia Links
- Query all movies, persons, bands without Wikipedia links
- Use web search to find correct Wikipedia URLs
- Bulk-update via script
- **Verify**: Wikipedia link count increases significantly

## Task 8.7: Research + Add IMDB Links
- Query all movies, persons (actors/directors) without IMDB links
- Use web search to find correct IMDB URLs
- Bulk-update via script
- **Verify**: IMDB link count increases significantly
