/**
 * Read-only dry-run audit for the Dublin Core migration (Phase 15.7).
 *
 * Scans the real KnowledgeGraphItem table (ScanCommand only — NO writes), runs the
 * builder (15.4) + resolver (15.5) across every core entity, writes the would-be sidecars
 * and JSON descriptors to a LOCAL dir (default ./.dc-audit/), and reports:
 *   - record counts per dc_type and per _category
 *   - content-key / (PK,SK) collisions that would overwrite on ingest
 *   - SK values shared across distinct PKs (informational)
 *   - source fields NOT consumed by the mapping (so nothing is silently dropped)
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/audit-dc-migration.mjs [--out DIR]
 *
 * NO S3 / DynamoDB writes. Pure read + local file emission.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { entityToDc, entityContentKey, defaultUriFor } from './lib/entity-to-dc.mjs';
import { dcSourceUri } from './lib/dc-paths.mjs';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';  // DEAD: this table was DELETED in Phase 17.6e — this script can no longer run.
const REGION = process.env.AWS_REGION || 'eu-central-1';
const OUT = (() => { const i = process.argv.indexOf('--out'); return i >= 0 ? process.argv[i + 1] : '.dc-audit'; })();

const CORE_TYPES = new Set(['movie', 'person', 'band', 'recording', 'book', 'sheet_music', 'collaboration']);
const REL_TYPES = new Set(['recording_performer', 'recording_movie', 'sheet_music_performer', 'movie_cast']);
// 'tag' = legacy/erroneous items (entityType 'tag' holding stray movie/recording names); excluded.
const CONSUMED_CORE = new Set([
  'id', 'entityType', 'name', 'language', 'givenName', 'familyName', 'roles',
  'author', 'artistName', 'format', 's3Key', 'tags', 'externalLinks', 'createdAt', 'updatedAt',
]);

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function scanAll() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const r = await client.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    items.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function tally(map, key) { map.set(key, (map.get(key) || 0) + 1); }

(async () => {
  console.log(`Scanning ${TABLE} (read-only)…`);
  const all = await scanAll();
  const dist = new Map();
  for (const i of all) tally(dist, i.entityType);
  console.log('  full entityType distribution:', Object.fromEntries([...dist].sort((a, b) => b[1] - a[1])));
  const core = all.filter((i) => CORE_TYPES.has(i.entityType));
  const rels = all.filter((i) => REL_TYPES.has(i.entityType));
  const other = all.filter((i) => !CORE_TYPES.has(i.entityType) && !REL_TYPES.has(i.entityType));
  console.log(`  total=${all.length} core=${core.length} rels=${rels.length} excluded=${other.length}`);
  if (other.length) console.log(`  EXCLUDED entityTypes (not migrated): ${[...new Set(other.map((o) => o.entityType))].join(', ')}`);

  // id → dc_source_uri map (so reverse links to documents resolve to the real PDF key).
  // Keyed by bare id too, since cross-refs don't always carry the target's entityType.
  const uriMap = new Map();
  const skipped = [];
  for (const e of core) {
    try {
      const uri = dcSourceUri(entityContentKey(e));
      uriMap.set(`${e.entityType}:${e.id}`, uri);
      uriMap.set(e.id, uri);
    } catch (err) {
      skipped.push({ id: e.id, entityType: e.entityType, reason: err.message });
    }
  }
  const skippedIds = new Set(skipped.map((s) => s.id));
  const uriFor = (id, type, name) => uriMap.get(`${type}:${id}`) || uriMap.get(id) || defaultUriFor(id, type, name);

  // Index rels by every entity id they reference.
  const relsByEntity = new Map();
  const addRel = (id, xr) => { if (!id) return; if (!relsByEntity.has(id)) relsByEntity.set(id, []); relsByEntity.get(id).push(xr); };
  for (const xr of rels) { addRel(xr.recordingId, xr); addRel(xr.performerId, xr); addRel(xr.movieId, xr); addRel(xr.sheetMusicId, xr); addRel(xr.personId, xr); }

  rmSync(OUT, { recursive: true, force: true });
  const byType = new Map(); const byCat = new Map();
  const contentKeys = new Map(); const skByPk = new Map(); const skAll = new Map();
  const unmapped = new Map();
  let descriptors = 0, sidecars = 0;

  for (const e of core) {
    for (const k of Object.keys(e)) if (!CONSUMED_CORE.has(k) && k !== '__typename') tally(unmapped, k);
    if (skippedIds.has(e.id)) continue; // already flagged (e.g. document w/o s3Key)
    const xrefs = relsByEntity.get(e.id) || [];
    let out;
    try { out = entityToDc(e, xrefs, { uriFor }); }
    catch (err) { skipped.push({ id: e.id, entityType: e.entityType, reason: err.message }); continue; }
    const A = out.sidecar.Attributes;
    tally(byType, A.dc_type); tally(byCat, A._category);
    tally(contentKeys, out.contentKey);
    const pk = out.sidecar.id;
    skByPk.set(`${pk}|${out.sidecar.SK}`, (skByPk.get(`${pk}|${out.sidecar.SK}`) || 0) + 1);
    if (!skAll.has(out.sidecar.SK)) skAll.set(out.sidecar.SK, new Set());
    skAll.get(out.sidecar.SK).add(pk);

    // Emit sidecar + descriptor locally (no S3).
    const sPath = `${OUT}/${out.sidecarKey}`; mkdirSync(dirname(sPath), { recursive: true });
    writeFileSync(sPath, JSON.stringify({ PK: pk, ...out.sidecar }, null, 2)); sidecars++;
    if (out.descriptor) { const cPath = `${OUT}/${out.contentKey}`; mkdirSync(dirname(cPath), { recursive: true }); writeFileSync(cPath, JSON.stringify(out.descriptor, null, 2)); descriptors++; }
  }

  const contentCollisions = [...contentKeys].filter(([, n]) => n > 1);
  const pkSkCollisions = [...skByPk].filter(([, n]) => n > 1);
  const skSharedAcrossPk = [...skAll].filter(([, set]) => set.size > 1);

  const report = {
    scanned: all.length, core: core.length, rels: rels.length,
    sidecars_emitted: sidecars, descriptors_emitted: descriptors,
    by_dc_type: Object.fromEntries(byType), by_category: Object.fromEntries(byCat),
    content_key_collisions: contentCollisions.length,
    pk_sk_collisions: pkSkCollisions.length,
    sk_shared_across_distinct_pk: skSharedAcrossPk.length,
    skipped_count: skipped.length,
    skipped: skipped.slice(0, 50),
    excluded_types: Object.fromEntries([...new Set(other.map((o) => o.entityType))].map((t) => [t, other.filter((o) => o.entityType === t).length])),
    unmapped_source_fields: Object.fromEntries([...unmapped].sort((a, b) => b[1] - a[1])),
    out_dir: OUT,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/_audit-report.json`, JSON.stringify(report, null, 2));

  console.log('\n=== DC MIGRATION AUDIT ===');
  console.log(`records: ${sidecars} sidecars, ${descriptors} descriptors`);
  console.log('by dc_type:', report.by_dc_type);
  console.log('by _category:', report.by_category);
  console.log(`content-key collisions (would overwrite): ${report.content_key_collisions}`);
  console.log(`(PK,SK) collisions: ${report.pk_sk_collisions}`);
  console.log(`SK shared across distinct PKs (informational, allowed by DH): ${report.sk_shared_across_distinct_pk}`);
  if (skSharedAcrossPk.length) console.log('  e.g.', skSharedAcrossPk.slice(0, 5).map(([sk, set]) => `${sk} ×${set.size}`).join(' | '));
  console.log(`skipped entities (cannot migrate): ${report.skipped_count}`);
  if (skipped.length) console.log('  e.g.', skipped.slice(0, 5).map((s) => `${s.entityType}:${s.id} (${s.reason})`).join(' | '));
  console.log('excluded (non-catalog) types:', report.excluded_types);
  console.log('unmapped source fields (intentionally dropped → ok if provenance):', report.unmapped_source_fields);
  console.log(`\nreport: ${OUT}/_audit-report.json   sidecars under: ${OUT}/metadata/`);

  const hardFail = report.content_key_collisions > 0 || report.pk_sk_collisions > 0;
  console.log(hardFail ? '\nAUDIT: HARD COLLISIONS FOUND' : '\nAUDIT: OK (no overwriting collisions)');
  process.exit(hardFail ? 1 : 0);
})();
