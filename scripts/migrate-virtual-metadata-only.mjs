/**
 * Phase 22.4 — migrate virtual (file-less) resources to the metadata-only model.
 *
 * Movies, recordings, and agents (person/band/collaboration) — plus the file-less book/sheet_music
 * edge case — were emitted (Phase 15–20) as a fabricated JSON CONTENT DESCRIPTOR object in
 * datasets/ or agents/ PLUS a DC sidecar. The descriptor held nothing the sidecar didn't already
 * carry. Phase 22 (operator-approved) drops it: a virtual resource is METADATA-ONLY.
 *
 * Per virtual row this script:
 *   1. rewrites the S3 sidecar: s3_key=null, dc_source_uri=null, _file_type=null, _virtual=true,
 *      ContentType → honest entity kind (MOVIE/RECORDING/BOOK/SHEET_MUSIC; agents already
 *      PERSON/BAND/COLLABORATION), removes the legacy _file_missing marker, bumps _last_updated_at;
 *   2. mirrors the same into DDB (UpdateCommand SET … REMOVE _file_missing);
 *   3. DELETES the content descriptor object at the old content key.
 *
 * What is NOT touched: file-backed documents (real PDFs) — _category=documents with a real s3_key.
 * Cross-link URIs in OTHER rows (_cast_uris / _performer_uris / dc_relation) keep their old
 * `…/<category>/<uuid>/<slug>.json` string form — consumers uuid-parse them (never fetch), so the
 * graph stays intact even though each row's own dc_source_uri is now null.
 *
 * S3 sidecar is authoritative (CLAUDE.md); both stores written together. Idempotent: a row already
 * carrying _virtual=true is skipped, and the descriptor delete no-ops if the object is already gone.
 *
 * Usage: AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 \
 *          node scripts/migrate-virtual-metadata-only.mjs [--limit N] [--apply]
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const TABLE = 'hyl-media-metadata-repository';
const REGION = process.env.AWS_REGION || 'eu-central-1';
const APPLY = process.argv.includes('--apply');
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const LIMIT = arg('--limit') ? parseInt(arg('--limit'), 10) : Infinity;

// Virtual rows live in the datasets/ or agents/ partitions. ContentType becomes the honest kind.
const VIRTUAL_CATEGORIES = new Set(['datasets', 'agents']);
const VIRTUAL_CONTENT_TYPE = {
  movie: 'MOVIE', recording: 'RECORDING', person: 'PERSON', band: 'BAND',
  collaboration: 'COLLABORATION', book: 'BOOK', sheet_music: 'SHEET_MUSIC',
};

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

const isVirtualTarget = (it) => {
  const a = it.Attributes || {};
  return VIRTUAL_CATEGORIES.has(a._category) && a._virtual !== true;
};

(async () => {
  console.log(`Migrate virtual → metadata-only — ${APPLY ? 'APPLY' : 'DRY-RUN'}${LIMIT !== Infinity ? ` limit=${LIMIT}` : ''}`);
  const all = await scanAll();
  const todo = all.filter(isVirtualTarget);
  const already = all.filter((it) => (it.Attributes || {})._virtual === true).length;
  const fileBacked = all.filter((it) => {
    const a = it.Attributes || {};
    return a._category === 'documents' && a._virtual !== true;
  }).length;
  console.log(`virtual rows to migrate: ${todo.length} (already metadata-only: ${already}; file-backed documents left alone: ${fileBacked}; ${all.length} total)`);

  let done = 0, migrated = 0, descriptorsDeleted = 0, errors = 0;
  for (const it of todo) {
    if (done >= LIMIT) break; done++;
    const a = it.Attributes;
    const kind = a._entity_kind;
    const ct = VIRTUAL_CONTENT_TYPE[kind] || it.ContentType;
    const oldContentKey = a.s3_key;                          // <category>/<uuid>/<slug>.json (descriptor)
    const sidecarKey = it.s3_key;                            // metadata/<...>.metadata.json (top-level)
    const bucket = a.s3_bucket || it.s3_bucket;
    const now = new Date().toISOString();
    if (done <= 6 || !APPLY) {
      console.log(`  [${kind}] ${a.dc_title}\n    ContentType ${it.ContentType} → ${ct}; drop descriptor ${oldContentKey || '(none)'}`);
    }
    if (!APPLY) { migrated++; continue; }
    try {
      // 1. read + mutate the sidecar (preserves canonical key order; only values change).
      const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: sidecarKey }));
      const sc = JSON.parse(await r.Body.transformToString());
      sc.ContentType = ct;
      sc.Attributes.s3_key = null;
      sc.Attributes.dc_source_uri = null;
      sc.Attributes._file_type = null;
      sc.Attributes._virtual = true;
      delete sc.Attributes._file_missing;
      sc.Attributes._last_updated_at = now;
      // 2. write the sidecar back (same key; S3 is authoritative).
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: sidecarKey, Body: JSON.stringify(sc, null, 2), ContentType: 'application/json' }));
      // 3. mirror into DDB (same PK/SK).
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: it.PK, SK: it.SK },
        UpdateExpression: 'SET ContentType = :ct, Attributes.s3_key = :null, Attributes.dc_source_uri = :null, Attributes.#ft = :null, Attributes.#v = :true, Attributes.#lu = :now REMOVE Attributes.#fm',
        ExpressionAttributeNames: { '#ft': '_file_type', '#v': '_virtual', '#lu': '_last_updated_at', '#fm': '_file_missing' },
        ExpressionAttributeValues: { ':ct': ct, ':null': null, ':true': true, ':now': now },
      }));
      migrated++;
      // 4. delete the content descriptor object (idempotent — no error if already gone).
      if (oldContentKey) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldContentKey }));
        descriptorsDeleted++;
      }
    } catch (err) {
      errors++;
      console.log(`  ERROR ${a._legacy_id}: ${err.message?.slice(0, 120)}`);
    }
  }
  console.log(`\nprocessed ${done}, ${APPLY ? `migrated ${migrated}, descriptors deleted ${descriptorsDeleted}` : `would migrate ${migrated} (dry-run)`}, errors ${errors}`);
})();
