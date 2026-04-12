# Phase 15: Verify Knowledge Graph Features + Tag Recommended Items

Phase 14 wrote code but never ran it against real data or verified in a browser. This phase actually executes and verifies.

**Requires**: AWS access (MCP tool or local AWS profile `JiHy__vsb__299`)

## Tasks

### Task 15.1: Run tag-recommended script
- **Size**: small
- **Verify**: Search "recommended" in Dossier returns results
- **Deliverable**: ~60 items tagged "recommended" in DynamoDB
- **Command**: `AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/tag-recommended.mjs`
- **Dry run first**: Add `--dry-run` flag to preview

### Task 15.2: Verify SoundtrackManager on live app
- **Size**: small
- **Verify**: Movie detail shows added recording, recording detail shows "Featured in" movie
- **Steps**:
  1. Open a movie detail page (e.g. Pulp Fiction)
  2. Click + on Soundtrack section, search a recording, add it
  3. Navigate to that recording's detail page
  4. Confirm it shows the movie in "Featured in"
  5. Remove the test link

### Task 15.3: Verify tag search + filter on live app
- **Size**: small
- **Verify**: Search returns tagged items, clicking tag badge filters correctly
- **Steps**:
  1. Type "recommended" in Dossier search bar
  2. Confirm results appear grouped by entity type
  3. Go to Tags tab, click "recommended" badge
  4. Confirm filter panel shows all recommended items
  5. Click clear to dismiss filter

### Task 15.4: Create new entity via UI, confirm auto-tagged
- **Size**: small
- **Verify**: New entity appears with recommended tag badge
- **Steps**:
  1. Click + New on any entity tab
  2. Create a test entity
  3. Confirm detail page shows "recommended" tag
  4. Delete the test entity

### Task 15.5: Fix any issues found
- **Size**: small
- **Verify**: All features work end-to-end on deployed app
- **Notes**: Catch-all for bugs discovered during 15.2-15.4
