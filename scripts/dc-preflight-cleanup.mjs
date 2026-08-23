/**
 * Phase 16.1 — pre-flight data cleanup before the DC migration.
 *
 * Resolves the data issues the 15.7 audit found (besides the file-less book, which the
 * entity-to-dc resolver now handles as a descriptor):
 *   1. Remove redundant legacy link attributes (youtubeUrl/wikiUrl/spotifyUrl/imdbUrl) — folding
 *      each into `externalLinks` first if (and only if) it is not already present.
 *   2. Delete junk `tag` entityType items (stray movie/recording names mis-typed as tags).
 *
 * MUTATES the production KnowledgeGraphItem table. Dry-run by default; pass --apply to write.
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/dc-preflight-cleanup.mjs [--apply]
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';  // DEAD: this table was DELETED in Phase 17.6e — this script can no longer run.
const REGION = process.env.AWS_REGION || 'eu-central-1';
const APPLY = process.argv.includes('--apply');
const LEGACY = { youtubeUrl: 'youtube', wikiUrl: 'wikipedia', spotifyUrl: 'spotify', imdbUrl: 'imdb' };

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function scanAll(params) {
  const items = []; let ExclusiveStartKey;
  do {
    const r = await client.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey, ...params }));
    items.push(...(r.Items || [])); ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

(async () => {
  console.log(`Pre-flight cleanup — ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}\n`);

  // 1. Legacy link fields.
  const legacyItems = await scanAll({
    FilterExpression: 'attribute_exists(youtubeUrl) OR attribute_exists(wikiUrl) OR attribute_exists(spotifyUrl) OR attribute_exists(imdbUrl)',
  });
  console.log(`[1] items with legacy link fields: ${legacyItems.length}`);
  let folded = 0, removedAttrs = 0;
  for (const it of legacyItems) {
    let links = [];
    try { links = JSON.parse(it.externalLinks || '[]'); if (!Array.isArray(links)) links = []; } catch { links = []; }
    const urls = new Set(links.map((l) => l.url));
    const toRemove = [];
    for (const [field, type] of Object.entries(LEGACY)) {
      if (it[field]) {
        toRemove.push(field);
        if (!urls.has(it[field])) { links.push({ url: it[field], type }); urls.add(it[field]); folded++; }
      }
    }
    removedAttrs += toRemove.length;
    const removeClause = `REMOVE ${toRemove.join(', ')}`;
    console.log(`    ${it.entityType}:${it.id} (${it.name}) — remove [${toRemove.join(', ')}], links now ${links.length}`);
    if (APPLY) {
      await client.send(new UpdateCommand({
        TableName: TABLE,
        Key: { id: it.id, entityType: it.entityType },
        UpdateExpression: `SET externalLinks = :el ${removeClause}`,
        ExpressionAttributeValues: { ':el': JSON.stringify(links) },
      }));
    }
  }
  console.log(`    → ${removedAttrs} legacy attrs ${APPLY ? 'removed' : 'would be removed'}, ${folded} URLs folded into externalLinks\n`);

  // 2. Junk `tag` items.
  const tagItems = await scanAll({
    FilterExpression: 'entityType = :t', ExpressionAttributeValues: { ':t': 'tag' },
  });
  console.log(`[2] junk 'tag' items: ${tagItems.length}`);
  for (const it of tagItems) {
    console.log(`    delete tag:${it.id} (${it.name})`);
    if (APPLY) await client.send(new DeleteCommand({ TableName: TABLE, Key: { id: it.id, entityType: it.entityType } }));
  }
  console.log(`    → ${tagItems.length} tag items ${APPLY ? 'deleted' : 'would be deleted'}\n`);

  console.log(APPLY ? 'APPLIED. Re-run `npm run audit:dc` to confirm 0 skipped / 0 legacy / 0 tag.'
                    : 'DRY-RUN complete. Re-run with --apply to write.');
})();
