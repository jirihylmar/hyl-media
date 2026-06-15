/**
 * Phase 20 cleanup — rewrite cross-reference URIs that point at agent entities from the old
 * datasets/<uuid>/ partition to agents/<uuid>/ (agents moved in repartition-agents.mjs).
 *
 * Only URIs whose uuid belongs to an AGENT record are rewritten, so a movie/recording's own
 * datasets/<own-uuid>/ source URI is never touched. Updates DDB Attributes in place; run
 * sync-dc-to-s3.mjs --apply afterwards to propagate to the S3 sidecars.
 *
 * Usage: AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/rewrite-agent-xrefs.mjs [--apply]
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = 'hyl-media-metadata-repository';
const REGION = process.env.AWS_REGION || 'eu-central-1';
const APPLY = process.argv.includes('--apply');
const AGENT_KINDS = new Set(['person', 'band', 'collaboration']);
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function scanAll() {
  const items = []; let ExclusiveStartKey;
  do {
    const r = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    items.push(...(r.Items || [])); ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

(async () => {
  console.log(`Rewrite agent cross-ref URIs datasets/→agents/ — ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  const all = await scanAll();
  const agentUuids = new Set(all.filter((it) => AGENT_KINDS.has((it.Attributes || {})._entity_kind)).map((it) => it.id));
  console.log(`agent uuids: ${agentUuids.size}; scanning ${all.length} records for cross-refs`);

  // Replace /datasets/<agent-uuid>/ → /agents/<agent-uuid>/ inside any string.
  const rw = (s) => (typeof s === 'string'
    ? s.replace(/\/datasets\/([^/]+)\//g, (m, seg) => (agentUuids.has(seg) ? `/agents/${seg}/` : m))
    : s);
  const rwVal = (v) => {
    if (typeof v === 'string') return rw(v);
    if (Array.isArray(v)) return v.map((e) => (typeof e === 'string' ? rw(e) : e));
    return v;
  };

  let changed = 0, written = 0;
  const fieldHits = {};
  for (const it of all) {
    const a = it.Attributes || {};
    const next = {}; let dirty = false;
    for (const [k, v] of Object.entries(a)) {
      const nv = rwVal(v);
      next[k] = nv;
      if (JSON.stringify(nv) !== JSON.stringify(v)) { dirty = true; fieldHits[k] = (fieldHits[k] || 0) + 1; }
    }
    if (!dirty) continue;
    changed++;
    if (changed <= 6) console.log(`  ${a._entity_kind}/${a._legacy_id}: ${Object.keys(a).filter((k) => JSON.stringify(rwVal(a[k])) !== JSON.stringify(a[k])).join(', ')}`);
    if (APPLY) {
      next._last_updated_at = new Date().toISOString();
      await ddb.send(new UpdateCommand({
        TableName: TABLE, Key: { PK: it.PK, SK: it.SK },
        UpdateExpression: 'SET Attributes = :a',
        ExpressionAttributeValues: { ':a': next },
      }));
      written++;
    }
  }
  console.log(`\nrecords with agent cross-refs: ${changed}, ${APPLY ? `written ${written}` : 'dry-run'}`);
  console.log(`fields rewritten: ${JSON.stringify(fieldHits)}`);
})();
