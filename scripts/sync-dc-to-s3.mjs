/**
 * Phase 19 — reconcile S3 sidecars from the DynamoDB DC store.
 *
 * Phase 18.3 enrichment wrote dc_abstract / dc_subject / _tags directly to DynamoDB; the S3
 * metadata sidecars (the source-of-truth in the DH metadata-repository model) still carry the
 * pre-enrichment values. This script makes S3 match DDB so a future CLI `update-metadata` re-sync
 * is safe and the sidecars match the conformant example with real content.
 *
 * Reconcile = rebuild each sidecar's `Attributes` map preserving the canonical DH key ORDER from
 * the existing sidecar, taking VALUES from the live DDB record; DDB-only keys are appended. Writes
 * back to the same S3 key only when content actually changed (idempotent).
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 \
 *     node scripts/sync-dc-to-s3.mjs [--limit N] [--apply]
 *   (dry-run by default — reports how many sidecars would change. --apply writes to S3.)
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const TABLE = 'hyl-media-metadata-repository';
const REGION = process.env.AWS_REGION || 'eu-central-1';
const APPLY = process.argv.includes('--apply');
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const LIMIT = arg('--limit') ? parseInt(arg('--limit'), 10) : Infinity;

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

// Sidecar key mirrors the DH layout: metadata/<category>/<uuid>/<file>.metadata.json
const sidecarKey = (a) => `metadata/${a.s3_key}.metadata.json`;

// Rebuild Attributes: canonical sidecar key order, values from DDB; append DDB-only keys.
function reconcileAttributes(sidecarAttrs, ddbAttrs) {
  const out = {};
  for (const k of Object.keys(sidecarAttrs)) out[k] = (k in ddbAttrs) ? ddbAttrs[k] : sidecarAttrs[k];
  for (const k of Object.keys(ddbAttrs)) if (!(k in out)) out[k] = ddbAttrs[k];
  return out;
}

(async () => {
  console.log(`Sync DC → S3 sidecars — ${APPLY ? 'APPLY' : 'DRY-RUN'}${LIMIT !== Infinity ? ` limit=${LIMIT}` : ''}`);
  const all = await scanAll();
  console.log(`scanned ${all.length} DDB records`);

  let done = 0, changed = 0, written = 0, missing = 0, errors = 0;
  for (const it of all) {
    if (done >= LIMIT) break; done++;
    const a = it.Attributes || {};
    const bucket = a.s3_bucket;
    const key = sidecarKey(a);
    try {
      const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const sidecar = JSON.parse(await r.Body.transformToString());
      const before = JSON.stringify(sidecar.Attributes);
      sidecar.Attributes = reconcileAttributes(sidecar.Attributes || {}, a);
      const after = JSON.stringify(sidecar.Attributes);
      if (before === after) continue; // already in sync
      changed++;
      if (changed <= 5) console.log(`  CHANGED ${a._entity_kind}/${a._legacy_id}: dc_abstract ${(JSON.parse(before).dc_abstract || '').length}→${(a.dc_abstract || '').length} chars`);
      if (APPLY) {
        await s3.send(new PutObjectCommand({
          Bucket: bucket, Key: key,
          Body: JSON.stringify(sidecar, null, 2),
          ContentType: 'application/json',
        }));
        written++;
      }
    } catch (err) {
      if (err.name === 'NoSuchKey') { missing++; if (missing <= 5) console.log(`  MISSING sidecar: ${key}`); }
      else { errors++; console.log(`  ERROR ${key}: ${err.message?.slice(0, 80)}`); }
    }
  }
  console.log(`\nprocessed ${done}, changed ${changed}, ${APPLY ? `written ${written}` : 'dry-run (no writes)'}, missing ${missing}, errors ${errors}`);
})();
