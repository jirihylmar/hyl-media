/**
 * Phase 17.6 precondition — full export/backup of the legacy KnowledgeGraphItem table.
 *
 * Scans every item and writes a single timestamped JSON snapshot to BOTH:
 *   - local:  ./backups/knowledge-graph-item-<stamp>.json   (immediate inspection; gitignored)
 *   - S3:     s3://<bucket>/backups/knowledge-graph-item-<stamp>.json  (durable, recoverable)
 *
 * Non-destructive. Required before any decommission of the legacy table (CLAUDE.md: never delete
 * without a verified backup). Re-runnable; each run is a new timestamped snapshot.
 *
 * Usage: AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 \
 *          node scripts/backup-legacy-kg-table.mjs [--stamp <iso>]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';  // DEAD: this table was DELETED in Phase 17.6e — this script can no longer run.
const BUCKET = 'amplify-d2r70lavusnzlx-ma-hylmediastoragebucketefb-p0iq0m7stthq';
const REGION = process.env.AWS_REGION || 'eu-central-1';
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
// Date.now is fine in a plain script (not a workflow); allow an explicit --stamp for determinism.
const STAMP = (arg('--stamp') || new Date().toISOString()).replace(/[:.]/g, '-');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

async function scanAll() {
  const items = []; let ExclusiveStartKey;
  do {
    const r = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    items.push(...(r.Items || [])); ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

(async () => {
  console.log(`Backing up ${TABLE} …`);
  const items = await scanAll();
  // tally by entityType for a quick integrity read
  const byType = {};
  for (const it of items) byType[it.entityType] = (byType[it.entityType] || 0) + 1;
  const snapshot = {
    table: TABLE, region: REGION, exported_at: new Date().toISOString(),
    item_count: items.length, by_entity_type: byType, items,
  };
  const body = JSON.stringify(snapshot, null, 2);
  const fname = `knowledge-graph-item-${STAMP}.json`;
  const s3Key = `backups/${fname}`;

  mkdirSync('backups', { recursive: true });
  writeFileSync(`backups/${fname}`, body);
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, Body: body, ContentType: 'application/json' }));

  console.log(`exported ${items.length} items`);
  console.log('by entity_type:', JSON.stringify(byType, null, 2));
  console.log(`local: backups/${fname}`);
  console.log(`s3:    s3://${BUCKET}/${s3Key}`);
})();
