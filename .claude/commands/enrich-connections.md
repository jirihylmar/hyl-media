---
description: Check for new entities and add knowledge graph connections (project)
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
  - Write
  - mcp__aws-vsb-299__call_aws
---

# Enrich Connections

Scan DynamoDB for entities missing connections, use LLM knowledge to identify and create links.

Run this after adding new entries to the catalog.

---

## Steps

### 1. Verify AWS Access

```
mcp__aws-vsb-299__call_aws aws sts get-caller-identity
```

Must return account `299025166536`. STOP if wrong.

### 2. Scan Current State

Query DynamoDB table `KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE` using the `byType` GSI:

```
# Get all entity counts
mcp__aws-vsb-299__call_aws aws dynamodb query --table-name KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE --index-name byType --key-condition-expression 'entityType = :et' --expression-attribute-values '{":et": {"S": "movie"}}' --select COUNT

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

Use `mcp__aws-vsb-299__call_aws` with `aws dynamodb put-item` for creates and `aws dynamodb update-item` for tag updates. Batch up to 20 commands per MCP call.

### 6. Verify

Re-query counts and spot-check a few connections:

```
# Verify counts increased
mcp__aws-vsb-299__call_aws aws dynamodb query ... --select COUNT

# Spot-check specific links
mcp__aws-vsb-299__call_aws aws dynamodb get-item --table-name KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE --key '{"id": {"S": "[link-id]"}, "entityType": {"S": "recording_movie"}}'
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
