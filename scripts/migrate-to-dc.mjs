/**
 * Phase 16.2/16.4 — emit the DC migration to S3.
 *
 * For every core entity (read from the live KnowledgeGraphItem table):
 *   - PUT the conformant Dublin Core sidecar JSON to
 *       <bucket>/metadata/<category>/<uuid>/<file>.metadata.json
 *     (the producer-guide envelope: id/SK/DocumentId/Title/ContentType/Attributes — NO top-level
 *      PK; the sync CLI derives PK from id).
 *   - If the artifact is a JSON descriptor (non-file entity, or a file-less book/sheet_music):
 *       PUT the descriptor JSON to <bucket>/datasets/<uuid>/<slug>.json
 *   - If the artifact is a real PDF (book/sheet_music with s3Key):
 *       COPY the PDF from its current key (library//sheet-music/) to <bucket>/documents/<uuid>/<file>.
 *
 * ADDITIVE: writes only to new prefixes (metadata/, datasets/, documents/). The existing library/
 * + sheet-music/ objects and the KnowledgeGraphItem table are untouched.
 *
 * Dry-run by default. Flags: --apply (write), --limit N (cap entities), --resource hylm (label).
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/migrate-to-dc.mjs [--apply] [--limit N]
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { entityToDc, entityContentKey, defaultUriFor, resolveArtifact } from './lib/entity-to-dc.mjs';
import { BUCKET, dcSourceUri } from './lib/dc-paths.mjs';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';
const REGION = process.env.AWS_REGION || 'eu-central-1';
const APPLY = process.argv.includes('--apply');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? parseInt(process.argv[i + 1], 10) : Infinity; })();
const CORE_TYPES = new Set(['movie', 'person', 'band', 'recording', 'book', 'sheet_music', 'collaboration']);
const REL_TYPES = new Set(['recording_performer', 'recording_movie', 'sheet_music_performer', 'movie_cast']);

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

// CopySource = bucket + key, each path segment URL-encoded (keys contain spaces, +, diacritics).
function copySource(key) {
  return `${BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function putJson(key, obj) {
  if (!APPLY) return;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: JSON.stringify(obj, null, 2), ContentType: 'application/json' }));
}

(async () => {
  console.log(`DC migration emit — ${APPLY ? 'APPLY (writing to S3)' : 'DRY-RUN'}${LIMIT !== Infinity ? ` --limit ${LIMIT}` : ''}\n`);
  const all = await scanAll();
  const core = all.filter((i) => CORE_TYPES.has(i.entityType));
  const rels = all.filter((i) => REL_TYPES.has(i.entityType));

  // id → dc_source_uri map (resolves reverse links to documents/datasets correctly).
  const uriMap = new Map();
  for (const e of core) { const u = dcSourceUri(entityContentKey(e)); uriMap.set(`${e.entityType}:${e.id}`, u); uriMap.set(e.id, u); }
  const uriFor = (id, type, name) => uriMap.get(`${type}:${id}`) || uriMap.get(id) || defaultUriFor(id, type, name);

  const relsByEntity = new Map();
  const addRel = (id, xr) => { if (!id) return; (relsByEntity.get(id) || relsByEntity.set(id, []).get(id)).push(xr); };
  for (const xr of rels) { addRel(xr.recordingId, xr); addRel(xr.performerId, xr); addRel(xr.movieId, xr); addRel(xr.sheetMusicId, xr); }

  let sidecars = 0, descriptors = 0, pdfCopies = 0, pdfErrors = 0, n = 0;
  for (const e of core) {
    if (n >= LIMIT) break; n++;
    const out = entityToDc(e, relsByEntity.get(e.id) || [], { uriFor });
    // Sidecar (no top-level PK — CLI derives it from id).
    await putJson(out.sidecarKey, out.sidecar);
    sidecars++;
    if (out.descriptor) {
      await putJson(out.contentKey, out.descriptor);
      descriptors++;
    } else {
      // Real PDF: copy from current key → documents/<uuid>/<file>.
      const art = resolveArtifact(e);
      const srcKey = e.s3Key; // existing library/… or sheet-music/… key
      try {
        if (APPLY) await s3.send(new CopyObjectCommand({ Bucket: BUCKET, CopySource: copySource(srcKey), Key: out.contentKey }));
        pdfCopies++;
        if (n <= 10) console.log(`    PDF copy: ${srcKey}  →  ${out.contentKey}`);
      } catch (err) { pdfErrors++; console.log(`    PDF COPY FAIL ${e.id}: ${err.name} ${err.message.slice(0, 80)}`); }
    }
    if (n <= 10) console.log(`    sidecar: ${out.sidecarKey}`);
  }

  console.log(`\nemitted (${APPLY ? 'written' : 'planned'}): ${sidecars} sidecars, ${descriptors} descriptors, ${pdfCopies} PDF copies${pdfErrors ? `, ${pdfErrors} PDF errors` : ''}`);
  console.log(APPLY ? 'DONE.' : 'DRY-RUN complete. Re-run with --apply to write.');
  process.exit(pdfErrors ? 1 : 0);
})();
