---
phase: 3
name: Knowledge Graph Frontend
status: pending
prerequisites: [phase_2]
output:
  - List views for all entity types
  - Detail views with relationship navigation
  - Language and role filtering
---

# Phase 3: Knowledge Graph Frontend

## Context Recovery
1. `IMPLEMENTATION_PLAN.md` - Section 3 (frontend routes)
2. `input/dynamo_implementation/WORKER_INSTRUCTIONS.md` - Pages and queries

---

## Task 3.1: App Layout and Navigation

**Goal**: Create app shell with routing and navigation.

**Steps**:
1. Set up React Router with all routes from spec
2. Create navigation component (sidebar or top nav)
3. Add Amplify Authenticator wrapper
4. Group nav: Movies, Music (persons/bands/artists/collaborations/recordings), Library, Sheet Music

**Verification**:
- [ ] All routes defined
- [ ] Navigation renders
- [ ] Auth gate works (login required)

---

## Task 3.2: Movie List and Detail Views

**Goal**: Browse and view movies with cast.

**Steps**:
1. `/movies` — list all movies from byType GSI, sortable, filterable by language
2. `/movies/:id` — detail page showing cast (byCastMovie), director, soundtrack recordings (recording_movie)
3. Links from cast → person detail, from soundtrack → recording detail

**Verification**:
- [ ] Movie list shows 94 movies
- [ ] Movie detail shows cast and director
- [ ] Links navigate correctly

---

## Task 3.3: Person List and Detail Views

**Goal**: Browse and view persons with filmography.

**Steps**:
1. `/persons` — list all people from byType, filterable by role (actor/director/musician)
2. `/persons/:id` — detail page showing filmography (byPersonFilm), recordings if musician

**Verification**:
- [ ] Person list shows 231 persons
- [ ] Role filter works
- [ ] Filmography links to movies

---

## Task 3.4: Music Entity Views (Bands, Artists, Collaborations)

**Goal**: Browse bands, solo artists, and collaborations.

**Steps**:
1. `/bands` — list 33 bands
2. `/bands/:id` — detail + discography (byPerformer)
3. `/artists` — list 3 solo artists
4. `/collaborations` — list 8 collaborations

**Verification**:
- [ ] Correct counts for each entity type
- [ ] Discography links to recordings

---

## Task 3.5: Recording List and Detail Views

**Goal**: Browse recordings with performer and movie links.

**Steps**:
1. `/recordings` — list all 94 recordings
2. `/recordings/:id` — detail showing performers (byRecording) and linked movies

**Verification**:
- [ ] Recording list shows 94 items
- [ ] Performer and movie links work

---

## Phase Completion Checklist
- [ ] All 10 knowledge graph routes functional
- [ ] Tags hidden from main nav (visible in admin or not at all)
- [ ] All relationship navigation works
- [ ] Git committed
