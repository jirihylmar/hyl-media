# Phase 17: Frontend Cutover to the DC metadata-repository

## Objective
Point the React app at `hyl-media-metadata-repository` (the DC store) instead of the
`KnowledgeGraphItem` table. The DC table is CLI-created (not an Amplify model), so expose it via
Amplify Gen 2 **custom AppSync resolvers**, then refactor the read path to render from DC records.
Additive until parity is confirmed; decommission the old path last.

## Key challenge
The frontend uses the Amplify Data client against the `KnowledgeGraphItem` AppSync API. The DC
table has no Amplify model. Bridge with custom `a.query` resolvers over an external DynamoDB data
source (mirrors Digital Horizon's planned "Path 3" Amplify mutation/query layer).

## Tasks
- **17.1** Custom AppSync resolvers (list/get/search) over the DC table + deploy.
- **17.2** `src/lib/dcClient.ts` + DC→view-model mappers (tags from `_tags`/`dc_subject`, links from
  `_external_links`, relationships from `dc_*` URIs → `_legacy_id` lookup).
- **17.3** Read-path cutover — list + detail pages render from DC records.
- **17.4** Dossier + GlobalSearch on the DC store.
- **17.5** Parity verification in the live app (Playwright, logged in; confirm PDF download from
  `documents/<uuid>/`).
- **17.6** Decommission old path (gated on 17.5 parity) — export old table to S3 backup first; keep
  recoverable; document `library/`/`sheet-music/` retirement.

## Notes
- Relationship rendering: resolve `dc_creator`/`dc_contributor`/`dc_relation`/`dc_has_part`/
  `dc_is_part_of`/`_performer_uris`/`_cast_uris` (S3 URIs) back to entities via `_legacy_id`.
- Do not delete anything until prod parity (incl. PDF download) is confirmed.
