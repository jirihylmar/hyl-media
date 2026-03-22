---
phase: 4
name: Library & Sheet Music Frontend
status: pending
prerequisites: [phase_3]
output:
  - Book browsing with download
  - Sheet music browsing with PDF viewer
  - Cross-links to knowledge graph entities
---

# Phase 4: Library & Sheet Music Frontend

---

## Task 4.1: Book List and Detail Views

**Goal**: Browse and download books.

**Steps**:
1. `/library` — list all books from byType, filterable by author/language/format
2. `/library/:id` — detail page with download link (S3 presigned URL via Amplify Storage)

**Verification**:
- [ ] Book list shows 307 items
- [ ] Filtering works
- [ ] Download link opens/downloads the file

---

## Task 4.2: Sheet Music List and Detail Views

**Goal**: Browse and view sheet music PDFs.

**Steps**:
1. `/sheet-music` — list all sheet music from byType, filterable by artist
2. `/sheet-music/:id` — detail page with embedded PDF viewer or download link
3. Link to related knowledge graph entities (band/person) where cross-references exist

**Verification**:
- [ ] Sheet music list shows 112 items
- [ ] PDF viewer/download works
- [ ] Cross-links to artists navigate to knowledge graph detail pages

---

## Phase Completion Checklist
- [ ] All 4 library/sheet-music routes functional
- [ ] S3 file access works
- [ ] Cross-links to knowledge graph work
- [ ] Git committed
