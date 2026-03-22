# Session Notes

This file tracks session history for context continuity between Claude Code sessions.

---

### Session: 2026-03-22 — Task 0.1: Read Input Materials

**Context**:
- Phase: 0 - Planning & Setup
- Task: 0.1 - Read input materials and explore examples

**Input Materials Analysis**:

#### File: `input/idea.md`
| Attribute | Detail |
|-----------|--------|
| Type | Project brief / requirements sketch |
| Purpose | High-level project definition |

**Extracted Requirements & Decisions:**
1. **AWS Account**: 299
2. **Naming convention**: `hyl-media-{...}`
3. **Storage**: Single S3 bucket with resources, partitioned by type
4. **Database**: DynamoDB for links/metadata (not for storing resources themselves)
5. **Data sources to include**: DynamoDB knowledge graph (dynamo_implementation/), book library (library/), sheet music (music-read/)
6. **Architecture**: All resources stored in S3, links/metadata in DynamoDB
7. **Future scope**: Kindle library integration
8. **Frontend**: Modern standards, manageable and runnable by "cowork claude" (i.e., Claude Code should be able to maintain and run it)

**Key constraint**: Frontend must be AI-maintainable — favors well-structured, convention-over-configuration frameworks like Amplify Gen 2.

---

#### File: `input/dynamo_implementation/WORKER_INSTRUCTIONS.md`
| Attribute | Detail |
|-----------|--------|
| Type | Technical specification — complete DynamoDB schema + Amplify data model |
| Purpose | Ready-to-implement knowledge graph design |

**Extracted Requirements & Decisions:**

**Entity Types (6 + relationships):**
| Entity | Count | Key Fields |
|--------|-------|------------|
| movie | 94 | id, name, language (en/cs) |
| person | 231 | id, name, given_name, family_name, roles[], language |
| band | 33 | id, name, language |
| artist | 3 | id, name, language (P!nk, Amy Winehouse, Dario G) |
| collaboration | 8 | id, name, language (one-off pairings) |
| tag | 5 | id, name, language (non-performer labels — hide from nav) |
| recording | 94 | id, name, language |

**Relationship Types (3):**
| Relationship | Count | Links |
|-------------|-------|-------|
| movie_cast | 327 | movie → person (role: actor/director) |
| recording_performer | 96 | recording → performer (type: band/artist/person/collaboration/tag) |
| recording_movie | 14 | recording → movie (soundtracks) |

**Total items**: 905 (verified against data files)

**DynamoDB Table**: `knowledge_graph`
- PK: `id` (String) — globally unique slug_hash
- SK: `entity_type` (String)
- 6 GSIs: byType, byCastMovie, byPersonFilm, byRecording, byPerformer, byLanguage

**Frontend Spec (from WORKER_INSTRUCTIONS.md):**
- Stack: Amplify Gen 2 + React + TypeScript + Amplify UI
- 10 routes defined (list + detail pages for movies, persons, bands, artists, collaborations, recordings)
- Edit forms: inline edit for name/language, add/remove cast/performer
- Auth: `allow.authenticated()`
- Amplify data model provided as TypeScript code

**Upload Script**: Provided (BatchWrite, 25 items/batch, eu-central-1)

**Checklist from doc**: Create table → GSIs → upload → verify counts → init Amplify → data model → list views → detail views → edit forms → deploy

---

#### File: `input/dynamo_implementation/data/` (10 JSON files)
| Attribute | Detail |
|-----------|--------|
| Type | Data — ready-to-import JSON files |
| Purpose | Pre-built knowledge graph data for DynamoDB |

**Verified counts match WORKER_INSTRUCTIONS.md:**
- all_items.json: 905, movies: 94, persons: 231, bands: 33, artists: 3, collaborations: 8, tags: 5, recordings: 94, movie_cast: 327, recording_performers: 110

**Note**: recording_performers.json has 110 items but WORKER_INSTRUCTIONS says 96 performer links + 14 recording_movie links = 110 total. The file contains both `recording_performer` and `recording_movie` entity types.

---

#### File: `input/library/` (307 files)
| Attribute | Detail |
|-----------|--------|
| Type | Data — PDF/epub book collection |
| Purpose | Personal digital library to be stored in S3 and cataloged |

**Key observations:**
- 307 files (mix of PDF and epub, some .doc/.xps)
- Languages: English and Czech
- Topics: yoga, spirituality, medicine, electronics, programming, fiction, philosophy
- Naming pattern: `{Title} by {Author}.{ext}` (mostly consistent)
- Some files authored by the user (Jiří Hylmar)
- Metadata extraction needed: title, author, format, language from filename
- **Spec implication**: S3 storage with DynamoDB metadata catalog. Need a `book` entity type or similar.

---

#### File: `input/music-read/` (112 files)
| Attribute | Detail |
|-----------|--------|
| Type | Data — sheet music PDF collection |
| Purpose | Guitar/piano chord sheets and tabs to be stored in S3 and cataloged |

**Key observations:**
- 112 PDF files (some .doc)
- Pattern: `{Artist} - {Song Title}.pdf` (mostly consistent)
- Mix of English and Czech songs
- Artists include: Bob Dylan, David Bowie, Rolling Stones, U2, Nick Cave, Velvet Underground, Lou Reed, Czech artists (Katapult, Tři sestry, Nohavica, etc.)
- Holiday songs section (Koledy)
- **Overlap with knowledge graph**: Many artists here appear in the DynamoDB knowledge graph (U2, Rolling Stones, David Bowie, Lou Reed, Nick Cave, etc.)
- **Spec implication**: S3 storage with DynamoDB metadata. Need a `sheet_music` entity type. Could link to existing `person`/`band` entities in knowledge graph.

---

#### File: `input/environment.md`
| Attribute | Detail |
|-----------|--------|
| Type | Configuration (generated during /setup) |
| Purpose | Records environment decisions |

AWS Account 299, eu-central-1, playbook-aws-serverless-multirepo template. No new requirements.

---

### Playbook Example Analysis

**Template explored**: `playbook-aws-serverless-multirepo`

**Structure**: Multi-repo (orchestration + infrastructure + backend + frontend + testing)
**Stack**: CDK, Lambda, API GW, DynamoDB, S3, React

**Adaptation needed for hyl-media:**
- The input specifies **Amplify Gen 2** (not raw CDK + Lambda + API GW). Amplify Gen 2 bundles: hosting, auth (Cognito), data (AppSync/DynamoDB), storage (S3). This simplifies the multi-repo approach — Amplify Gen 2 is a mono-repo pattern.
- **Decision point for Task 0.2**: Multi-repo may be overkill. Amplify Gen 2 is inherently a single project with `amplify/` dir for backend definitions. May adapt to fewer repos or mono-repo.
- Data import is a one-time script, not an ongoing backend service.

**Key architectural tension**: WORKER_INSTRUCTIONS.md specifies Amplify Gen 2 (which manages its own infrastructure via Amplify backend). The playbook template assumes CDK + Lambda + API GW (manual infrastructure). These are different approaches. Need to decide in Task 0.2.

---

### Summary of All Requirements

| # | Requirement | Source |
|---|-------------|--------|
| R1 | AWS account 299, eu-central-1 | idea.md |
| R2 | Naming: hyl-media-{...} | idea.md |
| R3 | Single S3 bucket, partitioned | idea.md |
| R4 | DynamoDB for links/metadata | idea.md |
| R5 | Knowledge graph: 905 items, 6 entity types, 3 relationship types | dynamo_implementation |
| R6 | DynamoDB table `knowledge_graph` with 6 GSIs | dynamo_implementation |
| R7 | Amplify Gen 2 + React + TypeScript frontend | dynamo_implementation |
| R8 | 10 routes (list + detail for each entity) | dynamo_implementation |
| R9 | Inline edit forms with updated_at/updated_by | dynamo_implementation |
| R10 | Book library: 307 files → S3 + catalog | library/ |
| R11 | Sheet music: 112 files → S3 + catalog | music-read/ |
| R12 | Future Kindle integration | idea.md |
| R13 | Frontend manageable by Claude Code | idea.md |
| R14 | All resources in S3, links in DynamoDB | idea.md |

### Decisions Needed (Task 0.2)
1. **Amplify Gen 2 vs CDK+Lambda**: Input specifies Amplify Gen 2. This changes the playbook structure significantly.
2. **Mono-repo vs multi-repo**: Amplify Gen 2 naturally fits mono-repo. Multi-repo may add unnecessary complexity.
3. **New entity types**: `book` and `sheet_music` not in current DynamoDB schema — need to extend the knowledge graph or create separate catalog.
4. **S3 partitioning scheme**: Single bucket, but how to partition (by type? by entity?).

---

### Task 0.2: Template Selection

**Selected**: `playbook-aws-serverless-multirepo` (adapted)

**Rationale**:
- Best match for AWS serverless + DynamoDB + S3 + frontend project
- The MCP mono-repo template is for documentation/MCP instances — completely wrong use case
- However, the template needs significant adaptation:

**Adaptations required**:
1. **Amplify Gen 2 replaces CDK + Lambda + API GW**: The input specifies Amplify Gen 2, which bundles backend (AppSync/DynamoDB), auth (Cognito), storage (S3), and hosting. This is a fundamentally different architecture than raw CDK + Lambda. Amplify Gen 2 manages its own CloudFormation stacks.
2. **Reduced repo count**: Amplify Gen 2 is a mono-repo pattern (`amplify/` dir inside the React project). Instead of 5 repos (orchestration, infrastructure, backend, frontend, testing), we need 2: orchestration (this repo) + the Amplify app itself.
3. **Data import is a one-time script**, not an ongoing Lambda backend. The upload script from WORKER_INSTRUCTIONS.md can run locally or as a one-off.
4. **Extended data model**: Beyond the knowledge graph, need `book` and `sheet_music` entity types for the library and music-read collections, with S3 references.

**Template structure adaptation**:
```
hyl-media/                      # Orchestration repo (this)
├── app/                        # Amplify Gen 2 app (separate git repo)
│   ├── amplify/                # Amplify backend definitions
│   │   ├── data/               # DynamoDB schema (AppSync)
│   │   ├── auth/               # Cognito config
│   │   └── storage/            # S3 config
│   ├── src/                    # React frontend
│   └── scripts/                # Data import scripts
├── IMPLEMENTATION_PLAN.md
├── progress.json
├── session_notes.md
├── input/                      # Source materials (read-only)
└── tasks/
```

---

### Session: 2026-03-22 — Full Build (Phases 0-4)

**Context**: First session. Built entire project from scratch.

**Completed**:
- Phase 0 (9 tasks): Read inputs, selected template, drafted spec, got approval, generated all phase tasks
- Phase 1 (5 tasks): Amplify Gen 2 init, data model + 6 GSIs, auth, storage, deployed sandbox to eu-west-1
- Phase 2 (6 tasks): Imported 905 knowledge graph items, 307 books (S3+DynamoDB), 112 sheet music (S3+DynamoDB), 21 cross-references
- Phase 3 (5 tasks): Full knowledge graph frontend — movies, persons, bands, artists, collaborations, recordings with relationship navigation
- Phase 4 (2 tasks): Library + sheet music browsing with S3 download links

**Key Decisions**:
- AWS region ended up as eu-west-1 (user's CLI default), not eu-central-1
- AWS account is 182059100462 (not "299" from idea.md — that was shorthand)
- Mono-repo instead of multi-repo (Amplify Gen 2 is inherently mono)
- Had to fix broken CDKToolkit stack (UPDATE_ROLLBACK_FAILED) before first deploy
- Book import had duplicate ID issue — fixed with author+format in hash

**Artifacts**:
- DynamoDB table: KnowledgeGraphItem-zw7vswr6vjhwdfo2kvafx6433m-NONE
- S3 bucket: amplify-hylmediainit-hylm-hylmediastoragebucketefb-42igexn5weic
- AppSync: l7kwmc74tjemhapjsufanp46ga.appsync-api.eu-west-1.amazonaws.com
- Cognito: eu-west-1_liKTsuaaa
- Stack: amplify-hylmediainit-hylmarj-sandbox-3722643844

**Next Session**:
- User wants deployment pipeline before Phase 5 (edit forms)
- Phase 5 remaining: edit forms, cast/performer management, UI polish

---

<!-- Sessions are prepended above this line -->
