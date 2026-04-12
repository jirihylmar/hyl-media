# Phase 14: Knowledge Graph Enrichment — Movies ↔ Recordings via LLM Knowledge

## Objective
Use Claude's knowledge to identify which recordings appeared in which movies (and vice versa), create missing entities, link them via `recording_movie` cross-refs, and tag new entities as `recommended`.

## Tasks

### Task 14.1: Audit DynamoDB
- **Size**: small
- **Verify**: Audit JSON lists all proposed new entities + links
- **Deliverable**: Audit report (console output or JSON)
- Scan all existing movies and recordings from DynamoDB
- Use LLM knowledge to identify:
  - Recordings that appeared in movies but have no `recording_movie` link
  - Movies that should exist (famous soundtracks) but don't
  - Recordings that should exist (iconic movie songs) but don't

### Task 14.2: Build enrichment script
- **Size**: medium
- **Verify**: `--dry-run` shows planned creates without writing
- **Deliverable**: `scripts/enrich-movie-recordings.mjs`
- Follow pattern of `enrich-recordings.mjs` (audit → create → link)
- Create missing movie entities with metadata (language, external links)
- Create missing recording entities
- Create `recording_movie` cross-refs
- Auto-tag new entities with `recommended`
- Support `--audit-only` and `--dry-run` flags

### Task 14.3: Add recommended tag to tag dictionary
- **Size**: small
- **Verify**: Tag dictionary includes curation category with recommended tag
- **Deliverable**: Updated `src/lib/tagDictionary.ts`
- Add `curation` category with `recommended`, `favorite`, `hidden-gem` tags

### Task 14.4: Run enrichment
- **Size**: small
- **Verify**: New entities + cross-refs visible in Dossier
- **Depends on**: 14.1, 14.2, 14.3
- Execute script against real DynamoDB via MCP tool

### Task 14.5: Verify + fix
- **Size**: small
- **Verify**: Bidirectional links work end-to-end
- **Depends on**: 14.4
- Spot-check 5+ movies and 5+ recordings in live app
- Fix any issues found
