---
description: "[BLOCKED - do not run] Relationship linking between existing catalog records. Built on the deleted KnowledgeGraphItem cross-ref-row model; needs a relation-field writer before it can be rewritten. See the banner in the file. (project)"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
  - Write
  - mcp__aws-mcp__aws___call_aws
  - mcp__aws-mcp__aws___run_script
---

# Enrich Connections

> ## ⛔ BLOCKED — this command cannot be run as written
>
> It targets the DynamoDB table `KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE`, **deleted in
> Phase 17.6e**, through a `byType` GSI that no longer exists — and it writes standalone
> cross-reference **row** items with `{slug}_{md5_4chars}` ids, a data model the Dublin Core store
> does not have. Steps 2, 5 and 6 below are kept only as a record of the job. **Do not execute them.**
>
> **Fixing the table name and tool name would make this WORSE, not better** — the commands would
> then run and write off-spec records that `scripts/audit-dc-conformance.mjs` rejects. A command
> that fails loudly is safer than one that corrupts the store quietly.
>
> ### How a relationship actually works now
>
> In the Dublin Core store a relationship is a **URI field inside both records' `Attributes`**, not
> a row. Five fields carry every edge (`src/lib/dcMap.ts:123-127`):
> `dc_relation` (string[]), `dc_has_part` (string[]), `dc_is_part_of` (string),
> `_cast_uris` (string[], hyl-media extension), `_performer_uris` (string[], hyl-media extension).
> Edge values are `https://<bucket>.s3.eu-central-1.amazonaws.com/<category>/<uuid>/<file>`;
> consumers take path segment `[1]` as the target primary key (`pkFromUri`, `dcMap.ts:80-92`) and
> never fetch the object. Ids are sha1 → UUIDv5-shaped (`derivedArtifactId`,
> `scripts/lib/build-dc-sidecar.mjs:75-78`; `derivedId`, `amplify/functions/agent/dc-emit.ts:46-49`).
> Every edge is **two-sided** — a writer that sets only one side leaves the reverse panel empty.
>
> ### Prerequisite before this can be rewritten: nothing can write a relation field
>
> Neither the agent's `update_metadata` (`amplify/functions/agent/writes.ts:451`) nor the
> metadata-api `updateMetadata` (`amplify/functions/metadata-api/handler.ts:41`) accepts any
> relation field, and `/managed-resource` has no relationship step. The reference implementation to
> build on is `appendRelation` (`amplify/functions/agent/writes.ts:241-262`), which read-modify-writes
> `dc_relation` into **both** DynamoDB and the S3 sidecar, honouring the source-of-truth rule.
>
> ### The gap this would close (measured, full 1242-record scan)
>
> - **310** creator/contributor names sit on records whose matching agent record **already exists**,
>   with no URI edge between them — 306 books, 3 sheet music, 1 movie.
> - **45** further creator names have no agent record at all (37 sheet music, 4 recordings, 4 movies).
> - **243 of 243 books** carry zero relationship edges of any kind.
>
> Example: *Saving Private Ryan* lists Tom Sizemore in `dc_contributor`, the agent record
> `a9be60e6-3c4a-56d4-19a1-32d3c87996cb` exists, and its uuid is absent from the movie's
> `_cast_uris` — so he is missing from the cast links and the film is missing from his filmography.
>
> ### Scope when rewritten
>
> Keep the **detect + link existing records** half. **Retire** the create-missing-entities half:
> the operator agent's `commit_plan` → `executePlan` (`writes.ts:385-445`) already owns creation,
> including minting missing agents with their reverse `dc_relation` inline.

---

*Historical content below — the original job description, retained as the only written record of
what this command was for. It reflects the pre-Phase-17.6 data model throughout.*

Scan DynamoDB for entities missing connections, use LLM knowledge to identify and create links.

Run this after adding new entries to the catalog.

---

## Steps

### 1. Verify AWS Access

```
mcp__aws-mcp__aws___call_aws  cli_command="aws sts get-caller-identity"  aws_profile="vsb-299"
```

Must return account `299025166536`. STOP if wrong.

### 2. Scan Current State

> ⛔ **DEAD — do not run.** Dead tool name (`mcp__aws-api__call_aws`) and dead table (deleted Phase 17.6e). Retained as a record only.

Query DynamoDB table `KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE` using the `byType` GSI:

```
# Get all entity counts
mcp__aws-api__call_aws aws dynamodb query --table-name KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE --index-name byType --key-condition-expression 'entityType = :et' --expression-attribute-values '{":et": {"S": "movie"}}' --select COUNT --profile vsb-299

# Repeat for: recording, band, person, recording_movie, recording_performer, movie_cast
```

Scan full items for movies, recordings, bands, persons — extract id, name, tags, externalLinks.

### 3. Identify Missing Connections Using LLM Knowledge

For each entity, use your knowledge to check:

**Movies:**
- Does this movie have a famous soundtrack? If so, do the recording entities exist? Are `recording_movie` links present?
- Does this movie have known cast members? Are `movie_cast` links present for key actors/directors?

**Recordings:**
- Is this recording associated with a movie soundtrack? If so, does the movie entity exist? Is the `recording_movie` link present?
- Does this recording have known performers? Are `recording_performer` links present?

**Bands/Persons:**
- Are there recordings by this band/person that exist in the DB but lack `recording_performer` links?
- Are there movies featuring this person that exist but lack `movie_cast` links?

### 4. Present Findings

```
## Connection Audit

### New Entities to Create
| Type | Name | Reason |
|------|------|--------|
| recording | [name] | Famous soundtrack for [movie] |
| movie | [name] | Featured recording [recording] |

### New Links to Create
| Recording | Movie | Notes |
|-----------|-------|-------|
| [song] | [film] | [why this connection] |

### New Performer Links
| Recording | Performer | Type |
|-----------|-----------|------|
| [song] | [artist] | band/person |

### Summary
- New entities: N
- New recording_movie links: N
- New recording_performer links: N
- New movie_cast links: N
```

**Wait for user approval before writing anything.**

### 5. Execute Enrichment

After user approves:

1. **Create missing entities** — use consistent ID format: `{slug}_{md5_4chars}`
   - New recordings: tag with genre + `soundtrack` + `recommended`
   - New movies: tag with `entertainment` + `soundtrack` + `recommended`
   - New bands/persons: tag with genre + `recommended`

2. **Create cross-reference items** — follow existing ID patterns:
   - `recording_movie`: `{recordingId}___soundtrack___{movieId}`
   - `recording_performer`: `{recordingId}___performer___{performerId}`
   - `movie_cast`: `{movieId}___{role}___{personId}`

3. **Tag existing entities** — add `soundtrack` tag to movies that gain recording links

> ⛔ **DEAD — do not run.** Dead tool name (`mcp__aws-api__call_aws`) and dead table (deleted Phase 17.6e). Retained as a record only.

Use `mcp__aws-api__call_aws` (--profile vsb-299) with `aws dynamodb put-item` for creates and `aws dynamodb update-item` for tag updates. Batch up to 20 commands per MCP call.

### 6. Verify

> ⛔ **DEAD — do not run.** Dead tool name (`mcp__aws-api__call_aws`) and dead table (deleted Phase 17.6e). Retained as a record only.

Re-query counts and spot-check a few connections:

```
# Verify counts increased
mcp__aws-api__call_aws aws dynamodb query ... --select COUNT --profile vsb-299

# Spot-check specific links
mcp__aws-api__call_aws aws dynamodb get-item --table-name KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE --key '{"id": {"S": "[link-id]"}, "entityType": {"S": "recording_movie"}}' --profile vsb-299
```

### 7. Report

```
## Enrichment Complete

| Metric | Before | After |
|--------|--------|-------|
| Recordings | X | Y |
| recording_movie links | X | Y |
| recording_performer links | X | Y |
| Movies tagged 'soundtrack' | X | Y |

New entities created: [list]
New links created: [list]
```

---

## Rules

- **Always use LLM knowledge** — you know which songs are in which movies, who performs what, etc.
- **Always ask before writing** — present the audit, get approval, then execute.
- **Tag new entities as `recommended`** — all auto-created entities get this tag.
- **Idempotent** — check if link/entity already exists before creating. Use normalized name matching.
- **Use MCP tool only** — never raw `aws` CLI.
- **Follow existing ID patterns** — `makeId(name)` = slug + md5 4-char hash.
- **Denormalize names** — cross-ref items store both IDs and human-readable names.

---

## ID Generation Reference

```javascript
// Same as scripts/enrich-movie-recordings.mjs
function makeId(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const hash = crypto.createHash('md5').update(name).digest('hex').slice(0, 4);
  return `${slug}_${hash}`;
}
```

To compute in bash:
```bash
NAME="My Heart Will Go On"
SLUG=$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/^-\|-$//g' | sed 's/-\+/-/g')
HASH=$(echo -n "$NAME" | md5sum | cut -c1-4)
echo "${SLUG}_${HASH}"
```
