# DC Migration Report

**Date:** 2026-06-14 · **Table:** `hyl-media-metadata-repository` · **Resource account:** `hylm`

## Result
- **1194** metadata records synced (CLI: 1194 writes, 0 failures).
- S3: 1194 sidecars (`metadata/`), 776 descriptors (`datasets/`), 418 PDF copies (`documents/`).

## By dc_type
- Dataset: 509
- MovingImage: 94
- Text: 419
- Sound: 172

## By _category
- datasets: 776
- documents: 418

## By _entity_kind
- person: 442
- movie: 94
- book: 307
- band: 59
- recording: 172
- sheet_music: 112
- collaboration: 8

## Verification
- Total == 1194, per-dc_type counts match the 15.7 audit.
- Conformant shape confirmed: PK==id, sort_key==SK, first 28 Attributes == DH template order.
- 7 spot-checks across all dc_types (movie cast, recording soundtrack, book PDF,
  file-less book, sheet music, person agent) — relationships resolved into DC terms.

## Notes / left for Phase 17
- Source `KnowledgeGraphItem` table and `library/` + `sheet-music/` S3 prefixes left intact
  (frontend cutover is Phase 17). Migration is additive + reversible.
- Spot-check status: ALL PASS.
