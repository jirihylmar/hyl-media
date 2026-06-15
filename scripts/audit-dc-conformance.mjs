/**
 * Phase 19 — FULL structural conformance audit of hyl-media DC records against the Digital Horizon
 * conformant-sidecar example (docs/metadata-repository-producers.md + _shared/metadata.ts).
 *
 * Checks the WHOLE structure and the exact rules — not just dc_* terms:
 *   top-level keys, DocumentId===id, SK===sort_key, SK shape (#<lang>#<slug>), Title/ContentType
 *   non-empty, the canonical 28 Attributes keys present IN ORDER (sidecar only — DDB maps are
 *   unordered), dc_type in the DCMI set, _category set, dc_source_uri derivation, field types,
 *   and that DDB mirrors the sidecar's key fields.
 *
 * Reads each S3 sidecar (for key order) and cross-checks the live DDB record.
 *
 * Usage: AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/audit-dc-conformance.mjs [--limit N]
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const TABLE = 'hyl-media-metadata-repository';
const REGION = process.env.AWS_REGION || 'eu-central-1';
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const LIMIT = arg('--limit') ? parseInt(arg('--limit'), 10) : Infinity;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

// The canonical 28 Attributes keys, in the exact order buildDublinCoreSidecar() emits them (DH ref).
const CANONICAL_28 = [
  '_authors', '_category', '_created_at', '_document_title', '_explicit_fields', '_file_type', '_last_updated_at',
  's3_bucket', 's3_key', 'dc_source_uri', 'sort_key',
  'language_code', 'additional_languages', 'size_estimate', 'daytime_estimate',
  'dc_title', 'dc_type', 'dc_abstract', 'dc_subject', 'dc_rights_holder', 'dc_license', 'dc_accrual_method',
  'dc_source', 'dc_relation', 'dc_has_format', 'dc_is_format_of', 'dc_has_part', 'dc_is_part_of',
];
const DCMI_TYPES = new Set(['Text', 'Sound', 'Dataset', 'MovingImage', 'Image', 'InteractiveResource', 'Service']);
const CATEGORIES = new Set(['audio', 'datasets', 'documents']);
const TOP_KEYS = ['id', 'SK', 'DocumentId', 'Title', 'ContentType', 'Attributes'];

async function scanAll() {
  const items = []; let ExclusiveStartKey;
  do {
    const r = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    items.push(...(r.Items || [])); ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

const viol = {}; // rule -> count
const examples = {}; // rule -> first few offending legacy_ids
function fail(rule, id) {
  viol[rule] = (viol[rule] || 0) + 1;
  (examples[rule] ||= []); if (examples[rule].length < 4) examples[rule].push(id);
}

(async () => {
  const all = await scanAll();
  console.log(`auditing ${Math.min(all.length, LIMIT)} of ${all.length} records against the DH example rules\n`);
  let n = 0, sidecarMissing = 0;
  for (const it of all) {
    if (n >= LIMIT) break; n++;
    const a = it.Attributes || {};
    const id = a._legacy_id || it.id;
    const key = `metadata/${a.s3_key}.metadata.json`;
    let sc;
    try {
      const r = await s3.send(new GetObjectCommand({ Bucket: a.s3_bucket, Key: key }));
      sc = JSON.parse(await r.Body.transformToString());
    } catch (e) { sidecarMissing++; fail('sidecar:missing-or-unreadable', id); continue; }

    const sa = sc.Attributes || {};
    // --- top-level structure ---
    for (const k of TOP_KEYS) if (!(k in sc)) fail(`top:missing:${k}`, id);
    if (sc.DocumentId !== sc.id) fail('top:DocumentId!==id', id);
    if (sc.SK !== sa.sort_key) fail('top:SK!==Attributes.sort_key', id);
    if (!sc.Title) fail('top:Title-empty', id);
    if (!sc.ContentType) fail('top:ContentType-empty', id);
    if (sc.id !== it.id) fail('top:sidecar.id!==ddb.id', id);
    // --- SK shape: #<lang>#<slug> ---
    if (!/^#[a-z]{2,}#.+/.test(sc.SK || '')) fail('sk:shape', id);
    // --- canonical 28 present and in order (sidecar key order) ---
    const scKeys = Object.keys(sa);
    const first28 = scKeys.slice(0, 28);
    for (let i = 0; i < 28; i++) if (first28[i] !== CANONICAL_28[i]) { fail(`attrs:order@${i}:${CANONICAL_28[i]}`, id); break; }
    for (const k of CANONICAL_28) if (!(k in sa)) fail(`attrs:missing:${k}`, id);
    // --- value rules ---
    if (!DCMI_TYPES.has(sa.dc_type)) fail('val:dc_type-not-DCMI', id);
    if (!CATEGORIES.has(sa._category)) fail('val:_category-invalid', id);
    if (!sa.s3_key) fail('val:s3_key-empty', id);
    const expUri = `https://${sa.s3_bucket}.s3.${REGION}.amazonaws.com/${sa.s3_key}`;
    if (sa.dc_source_uri !== expUri) fail('val:dc_source_uri-derivation', id);
    if (!sa._file_type) fail('val:_file_type-empty', id);
    if (!sa._created_at) fail('val:_created_at-empty', id);
    if (!sa._last_updated_at) fail('val:_last_updated_at-empty', id);
    // --- types ---
    if (!Array.isArray(sa._explicit_fields)) fail('type:_explicit_fields-not-array', id);
    if (!Array.isArray(sa.dc_subject)) fail('type:dc_subject-not-array', id);
    if (!Array.isArray(sa.additional_languages)) fail('type:additional_languages-not-array', id);
    if (typeof sa.dc_abstract !== 'string') fail('type:dc_abstract-not-string', id);
    // --- DDB mirrors sidecar key fields (post-enrichment values live in DDB) ---
    if (it.SK !== sc.SK) fail('ddb:SK!==sidecar.SK', id);
    if (it.ContentType && sc.ContentType && it.ContentType !== sc.ContentType) fail('ddb:ContentType-mismatch', id);
  }

  console.log(`=== CONFORMANCE REPORT (${n} records, ${sidecarMissing} sidecars unreadable) ===`);
  const rules = Object.keys(viol).sort();
  if (!rules.length) { console.log('ALL PASS — every record conforms to the full DH example structure & rules.'); return; }
  for (const r of rules) console.log(`  ✗ ${r}: ${viol[r]}  e.g. ${(examples[r] || []).join(', ')}`);
  console.log(`\n${rules.length} distinct rule(s) violated.`);
})();
