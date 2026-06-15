/**
 * Phase 20 — re-type + repartition agent entities (person/band/collaboration).
 *
 * These were materialized as JSON descriptors in datasets/ with dc_type=Dataset / ContentType=DATASET,
 * which is wrong for an agent. This moves each to the agents/ partition and re-types it:
 *   _category datasets→agents, s3_key + dc_source_uri + sidecar key rewritten,
 *   dc_type → Agent (dcterms:Agent), ContentType → PERSON|BAND|COLLABORATION.
 * Records, abstracts, links, tags, relationships are all preserved (same PK/SK, same uuid).
 * Cross-reference URIs in resources still resolve (the frontend keys on the uuid, not the category).
 *
 * Idempotent: a record whose s3_key already starts with agents/ is skipped.
 *
 * Usage: AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 \
 *          node scripts/repartition-agents.mjs [--limit N] [--apply]
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { dcSourceUri } from './lib/dc-paths.mjs';

const TABLE = 'hyl-media-metadata-repository';
const REGION = process.env.AWS_REGION || 'eu-central-1';
const APPLY = process.argv.includes('--apply');
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const LIMIT = arg('--limit') ? parseInt(arg('--limit'), 10) : Infinity;

const AGENT_KINDS = new Set(['person', 'band', 'collaboration']);
const CONTENT_TYPE = { person: 'PERSON', band: 'BAND', collaboration: 'COLLABORATION' };

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });
const enc = (key) => key.split('/').map(encodeURIComponent).join('/');

async function scanAll() {
  const items = []; let ExclusiveStartKey;
  do {
    const r = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    items.push(...(r.Items || [])); ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

(async () => {
  console.log(`Repartition agents → agents/ — ${APPLY ? 'APPLY' : 'DRY-RUN'}${LIMIT !== Infinity ? ` limit=${LIMIT}` : ''}`);
  const all = await scanAll();
  const todo = all.filter((it) => {
    const a = it.Attributes || {};
    return AGENT_KINDS.has(a._entity_kind) && String(a.s3_key || '').startsWith('datasets/');
  });
  const already = all.filter((it) => AGENT_KINDS.has((it.Attributes || {})._entity_kind) && String((it.Attributes || {}).s3_key || '').startsWith('agents/')).length;
  console.log(`agents to migrate: ${todo.length} (already in agents/: ${already}; ${all.length} total records)`);

  let done = 0, moved = 0, errors = 0;
  const bucket = (todo[0]?.Attributes?.s3_bucket);
  for (const it of todo) {
    if (done >= LIMIT) break; done++;
    const a = it.Attributes;
    const kind = a._entity_kind;
    const oldContentKey = a.s3_key;                                   // datasets/<uuid>/<slug>.json
    const newContentKey = 'agents/' + oldContentKey.slice('datasets/'.length);
    const oldSidecarKey = `metadata/${oldContentKey}.metadata.json`;
    const newSidecarKey = `metadata/${newContentKey}.metadata.json`;
    const newUri = dcSourceUri(newContentKey, a.s3_bucket, REGION);
    const ct = CONTENT_TYPE[kind];
    const now = new Date().toISOString();
    if (done <= 6 || !APPLY) console.log(`  [${kind}] ${a.dc_title}\n    ${oldContentKey}\n  → ${newContentKey}  dc_type=Agent ContentType=${ct}`);
    if (!APPLY) { moved++; continue; }
    try {
      // 1. read + mutate sidecar
      const r = await s3.send(new GetObjectCommand({ Bucket: a.s3_bucket, Key: oldSidecarKey }));
      const sc = JSON.parse(await r.Body.transformToString());
      sc.ContentType = ct;
      sc.Attributes._category = 'agents';
      sc.Attributes.s3_key = newContentKey;
      sc.Attributes.dc_source_uri = newUri;
      sc.Attributes.dc_type = 'Agent';
      sc.Attributes._last_updated_at = now;
      // 2. copy the descriptor content to agents/
      await s3.send(new CopyObjectCommand({ Bucket: a.s3_bucket, CopySource: `${a.s3_bucket}/${enc(oldContentKey)}`, Key: newContentKey, ContentType: 'application/json', MetadataDirective: 'COPY' }));
      // 3. write the new sidecar
      await s3.send(new PutObjectCommand({ Bucket: a.s3_bucket, Key: newSidecarKey, Body: JSON.stringify(sc, null, 2), ContentType: 'application/json' }));
      // 4. update DDB in place (same PK/SK)
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: it.PK, SK: it.SK },
        UpdateExpression: 'SET s3_key = :sk, ContentType = :ct, Attributes.s3_key = :ck, Attributes.dc_source_uri = :uri, Attributes.#cat = :cat, Attributes.dc_type = :dt, Attributes.#lu = :now',
        ExpressionAttributeNames: { '#cat': '_category', '#lu': '_last_updated_at' },
        ExpressionAttributeValues: { ':sk': newSidecarKey, ':ct': ct, ':ck': newContentKey, ':uri': newUri, ':cat': 'agents', ':dt': 'Agent', ':now': now },
      }));
      // 5. delete the old objects
      await s3.send(new DeleteObjectCommand({ Bucket: a.s3_bucket, Key: oldContentKey }));
      await s3.send(new DeleteObjectCommand({ Bucket: a.s3_bucket, Key: oldSidecarKey }));
      moved++;
    } catch (err) {
      errors++;
      console.log(`  ERROR ${a._legacy_id}: ${err.message?.slice(0, 100)}`);
    }
  }
  console.log(`\nprocessed ${done}, ${APPLY ? `moved ${moved}` : `would move ${moved} (dry-run)`}, errors ${errors}`);
})();
