---
phase: 2
name: Data Import
status: pending
prerequisites: [phase_1]
output:
  - 905 knowledge graph items in DynamoDB
  - 307 books uploaded to S3 with metadata in DynamoDB
  - 112 sheet music files uploaded to S3 with metadata in DynamoDB
  - Cross-references created
---

# Phase 2: Data Import

## Context Recovery
1. `IMPLEMENTATION_PLAN.md` - Section 3 (data schema)
2. `input/dynamo_implementation/WORKER_INSTRUCTIONS.md` - Entity types, upload script
3. `input/dynamo_implementation/data/all_items.json` - 905 items to import

---

## Task 2.1: Create Knowledge Graph Import Script

**Goal**: Script to batch-write 905 items from `all_items.json` into DynamoDB via Amplify.

**Steps**:
1. Create `scripts/import-knowledge-graph.ts`
2. Read `input/dynamo_implementation/data/all_items.json`
3. BatchWrite in chunks of 25 (DynamoDB limit)
4. Use Amplify client or direct DynamoDB SDK

**Verification**:
- [ ] Script exists and compiles
- [ ] Dry-run mode available (count items without writing)

---

## Task 2.2: Run Knowledge Graph Import

**Goal**: Import all 905 items and verify counts.

**Steps**:
1. Run import script against deployed DynamoDB table
2. Verify counts: 94 movies, 231 persons, 33 bands, 3 artists, 8 collaborations, 5 tags, 94 recordings, 327 movie_cast, 110 recording_performers

**Verification**:
- [ ] Total item count = 905
- [ ] Each entity type count matches expected

---

## Task 2.3: Create Book Metadata Extraction Script

**Goal**: Parse book filenames into metadata and create DynamoDB entries.

**Steps**:
1. Create `scripts/import-books.ts`
2. Scan `input/library/` for all files
3. Parse filename pattern `{Title} by {Author}.{ext}` → extract title, author, format, language
4. Generate DynamoDB items with entity_type `book`, s3_key pointing to S3 path
5. Upload files to S3 `library/` prefix

**Verification**:
- [ ] Script parses all 307 filenames
- [ ] Handles edge cases (missing author, non-standard naming)

---

## Task 2.4: Run Book Import (S3 + DynamoDB)

**Goal**: Upload 307 files to S3 and create metadata entries.

**Steps**:
1. Upload all files to S3 `library/` prefix
2. Write metadata entries to DynamoDB
3. Verify file count in S3 matches expected

**Verification**:
- [ ] 307 files in S3 `library/` prefix
- [ ] 307 `book` entries in DynamoDB
- [ ] Sample download works

---

## Task 2.5: Create Sheet Music Import Script

**Goal**: Parse sheet music filenames and create DynamoDB entries with cross-references.

**Steps**:
1. Create `scripts/import-sheet-music.ts`
2. Scan `input/music-read/` for all files
3. Parse filename pattern `{Artist} - {Song}.pdf` → extract artist_name, song title
4. Generate DynamoDB items with entity_type `sheet_music`, s3_key
5. Match artists against existing knowledge graph entities (bands, persons) → create `sheet_music_performer` relationship entries

**Verification**:
- [ ] Script parses all 112 filenames
- [ ] Cross-references identified for overlapping artists

---

## Task 2.6: Run Sheet Music Import (S3 + DynamoDB)

**Goal**: Upload 112 files to S3 and create metadata + cross-references.

**Steps**:
1. Upload files to S3 `sheet-music/` prefix
2. Write metadata entries to DynamoDB
3. Write cross-reference entries for matched artists

**Verification**:
- [ ] 112 files in S3 `sheet-music/` prefix
- [ ] 112 `sheet_music` entries in DynamoDB
- [ ] Cross-references exist for known artists (U2, Rolling Stones, etc.)

---

## Phase Completion Checklist
- [ ] DynamoDB has 905 + 307 + 112 + cross-ref items
- [ ] S3 has 307 + 112 files
- [ ] All counts verified
- [ ] Git committed
