/**
 * API over the hyl-media-metadata-repository (Dublin Core) table. Backs custom AppSync
 * queries/mutations:
 *   - getMetadata(pk) / getMetadataByLegacyId(legacyId) → one DC record (or null)   [Phase 17.1]
 *   - listMetadataByType(dcType) → all records of a DCMI type                        [Phase 17.1]
 *   - searchMetadata(q)          → name/dc_subject/_tags match (diacritics-insensitive) [17.1]
 *   - updateMetadata(pk, patch)  → operator edit of allowlisted DC fields            [Phase 18.4]
 *   - createDocumentMetadata(input) → create a file-backed document record (S3 sidecar +
 *                                     metadata-repo row) for an uploaded book/sheet PDF [17.6c]
 *
 * Each returns AWSJSON (a.json()) — the raw DC record(s); the frontend maps to view models.
 * The function dispatches on the AppSync field name (with an argument-presence fallback).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const TABLE = process.env.METADATA_TABLE as string;
// The Amplify storage bucket (holds documents/ + metadata/ sidecars). Matches the constant used by
// the migration scripts + the agent's dc-emit (kept in sync; Phase 17.6c document upload).
const BUCKET = process.env.METADATA_BUCKET || 'amplify-d2r70lavusnzlx-ma-hylmediastoragebucketefb-p0iq0m7stthq';
const REGION = process.env.AWS_REGION || 'eu-central-1';
const RESOURCE_ACCOUNT = 'hylm';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const norm = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ASCII-fold mirroring the migration's convertToAscii (Czech map + NFD strip ≥128).
const ASCII_MAP: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ý: 'y', č: 'c', ď: 'd', ě: 'e', ň: 'n',
  ř: 'r', š: 's', ť: 't', ž: 'z', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ý: 'Y',
  Č: 'C', Ď: 'D', Ě: 'E', Ň: 'N', Ř: 'R', Š: 'S', Ť: 'T', Ž: 'Z',
};
const asciiFold = (s: string) =>
  Array.from((s || '').replace(/[áéíóúýčďěňřšťžÁÉÍÓÚÝČĎĚŇŘŠŤŽ]/g, (c) => ASCII_MAP[c] ?? c).normalize('NFD'))
    .filter((c) => c.charCodeAt(0) < 128).join('');

// Operator-editable DC fields (mirrors the lifecycle allowlist; relationships are not edited here).
const UPDATABLE = new Set(['dc_title', 'language_code', '_tags', '_external_links']);

async function scanAll(params: Record<string, unknown> = {}): Promise<any[]> {
  const items: any[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r: any = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey, ...params }));
    items.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function getMetadata(pk: string) {
  if (!pk) return null;
  // PK is the hash key; SK is required for GetItem. Query by PK instead (one row per PK here).
  const items = await scanAll({
    FilterExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': pk },
  });
  return items[0] ?? null;
}

async function getByLegacyId(legacyId: string) {
  if (!legacyId) return null;
  // `_legacy_id` is underscore-prefixed → must alias via ExpressionAttributeNames.
  const items = await scanAll({
    FilterExpression: 'Attributes.#lid = :lid',
    ExpressionAttributeNames: { '#lid': '_legacy_id' },
    ExpressionAttributeValues: { ':lid': legacyId },
  });
  return items[0] ?? null;
}

async function updateMetadata(pk: string, patch: unknown) {
  if (!pk || patch == null) throw new Error('updateMetadata requires pk and patch');
  const obj = (typeof patch === 'string' ? JSON.parse(patch) : patch) as Record<string, unknown>;
  const row: any = await getMetadata(pk);
  if (!row) throw new Error(`updateMetadata: not found ${pk}`);

  const sets: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  let i = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (!UPDATABLE.has(k)) continue;
    const an = `#a${i}`, av = `:v${i}`; i++;
    sets.push(`Attributes.${an} = ${av}`);
    names[an] = k; values[av] = v;
  }
  // Renaming dc_title also refreshes the ASCII-folded Title / _document_title (SK/PK stay stable).
  if (typeof obj.dc_title === 'string') {
    const folded = asciiFold(obj.dc_title);
    sets.push('Title = :title', 'Attributes.#dt = :title');
    names['#dt'] = '_document_title'; values[':title'] = folded;
  }
  sets.push('Attributes.#lu = :now');
  names['#lu'] = '_last_updated_at'; values[':now'] = new Date().toISOString();
  if (sets.length === 1) throw new Error('updateMetadata: no updatable fields in patch');

  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { PK: row.PK, SK: row.SK },
    UpdateExpression: 'SET ' + sets.join(', '),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
  return await getMetadata(pk);
}

// --- Phase 17.6c — DC-native document upload (file-backed book/sheet_music) ------------------
// sort_key slug: ASCII-fold → lowercase → spaces/dots to '-' → strip non-alphanumeric-hyphen.
// Mirrors build-dc-sidecar.mjs sortKeySlug so uploaded docs are byte-consistent with the migration.
function sortKeySlug(title: string): string {
  if (!title) return '';
  return asciiFold(title).toLowerCase()
    .replace(/[\s.]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}
function sizeEstimate(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 10 * 1024 * 1024) return 'small file';
  if (bytes <= 100 * 1024 * 1024) return 'medium file';
  return 'big file';
}
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  pdf: 'PDF', txt: 'TEXT', md: 'MARKDOWN', doc: 'WORD', docx: 'WORD', epub: 'EPUB', xps: 'XPS',
};

interface DocInput {
  kind: 'book' | 'sheet_music';
  id: string;          // uuid (the documents/<uuid>/ partition + PK + _legacy_id)
  filename: string;    // basename under documents/<uuid>/
  title: string;
  creator?: string;    // author (book) / artist (sheet_music) → dc_creator + dc_rights_holder
  language?: string;
  fileType?: string;   // ext, e.g. 'pdf'
  sizeBytes?: number;
}

/** Build the conformant file-backed DC record (sidecar + DDB ingest item) for an uploaded document. */
function buildDocumentRecord(input: DocInput, now: string) {
  const id = input.id;
  const title = (input.title || '').trim();
  const language = input.language || 'auto';
  const ext = (input.fileType || input.filename.split('.').pop() || 'pdf').toLowerCase();
  const contentType = CONTENT_TYPE_BY_EXT[ext] || ext.toUpperCase();
  const slug = sortKeySlug(title) || id;
  const sk = `#${language}#${slug}`;
  const asciiTitle = asciiFold(title);
  const contentKey = `documents/${id}/${input.filename}`;
  const sidecarKey = `metadata/${contentKey}.metadata.json`;
  const dcSourceUri = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${contentKey}`;
  const creator = (input.creator || '').trim();

  // Canonical DH 28 Attributes in order, then hyl-media extensions (mirrors entity-to-dc.mjs).
  const attributes: Record<string, unknown> = {
    _authors: creator ? [creator] : ['hyl-media'],
    _category: 'documents',
    _created_at: now,
    _document_title: asciiTitle,
    _explicit_fields: [],
    _file_type: ext,
    _last_updated_at: now,
    s3_bucket: BUCKET,
    s3_key: contentKey,
    dc_source_uri: dcSourceUri,
    sort_key: sk,
    language_code: language,
    additional_languages: [],
    size_estimate: sizeEstimate(input.sizeBytes),
    daytime_estimate: '',
    dc_title: title,
    dc_type: 'Text',
    dc_abstract: '',
    dc_subject: [],
    dc_rights_holder: creator || null,
    dc_license: 'copyright',
    dc_accrual_method: 'creation',
    dc_source: null,
    dc_relation: null,
    dc_has_format: null,
    dc_is_format_of: null,
    dc_has_part: null,
    dc_is_part_of: null,
    // hyl-media extensions
    _entity_kind: input.kind,
    _legacy_id: id,
    _tags: [],
    _external_links: [],
    dc_creator: creator ? [creator] : null,
    dc_contributor: null,
  };
  const sidecar = { id, SK: sk, DocumentId: id, Title: asciiTitle, ContentType: contentType, Attributes: attributes };
  const sidecarJson = JSON.stringify(sidecar, null, 2);
  const ddbItem = {
    PK: id, ...sidecar,
    resource_account: RESOURCE_ACCOUNT,
    s3_key: sidecarKey,           // top-level s3_key = the sidecar key (CLI ingest shape)
    s3_bucket: BUCKET,
    s3_size: Buffer.byteLength(sidecarJson, 'utf8'),
    s3_last_modified: now,
    last_synced: now,
  };
  return { sidecar, sidecarJson, ddbItem, sidecarKey, contentKey };
}

async function createDocumentMetadata(input: DocInput) {
  if (!input?.id || !input?.filename || !input?.title || !input?.kind) {
    throw new Error('createDocumentMetadata requires kind, id, filename, title');
  }
  const now = new Date().toISOString();
  const rec = buildDocumentRecord(input, now);
  // S3 sidecar is authoritative (CLAUDE.md) — write it, then mirror to DDB. The PDF itself is
  // uploaded directly by the browser (Amplify Storage) before this call.
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: rec.sidecarKey, Body: rec.sidecarJson, ContentType: 'application/json',
  }));
  await ddb.send(new PutCommand({ TableName: TABLE, Item: rec.ddbItem }));
  return rec.sidecar;
}

async function listMetadataByType(dcType: string, limit?: number) {
  if (!dcType) return [];
  const items = await scanAll({
    FilterExpression: 'Attributes.dc_type = :t',
    ExpressionAttributeValues: { ':t': dcType },
  });
  items.sort((a, b) => String(a.Title || '').localeCompare(String(b.Title || '')));
  return typeof limit === 'number' ? items.slice(0, limit) : items;
}

async function searchMetadata(q: string, limit?: number) {
  const nq = norm(q);
  if (nq.length < 2) return [];
  const all = await scanAll();
  const hits = all.filter((it) => {
    const a = it.Attributes || {};
    if (norm(a.dc_title || it.Title || '').includes(nq)) return true;
    const subj: string[] = Array.isArray(a.dc_subject) ? a.dc_subject : [];
    const tags: string[] = Array.isArray(a._tags) ? a._tags : [];
    const creators: string[] = Array.isArray(a.dc_creator) ? a.dc_creator : [];
    return [...subj, ...tags, ...creators].some((t) => norm(t).includes(nq));
  });
  hits.sort((a, b) => String(a.Title || '').localeCompare(String(b.Title || '')));
  return hits.slice(0, limit ?? 50);
}

export const handler = async (event: any) => {
  const field = event?.info?.fieldName ?? event?.fieldName ?? '';
  const args = event?.arguments ?? {};
  try {
    if (field === 'getMetadata' || (args.pk && !field)) return await getMetadata(args.pk);
    if (field === 'getMetadataByLegacyId' || (args.legacyId && !field)) return await getByLegacyId(args.legacyId);
    if (field === 'listMetadataByType' || (args.dcType && !field)) return await listMetadataByType(args.dcType, args.limit);
    if (field === 'searchMetadata' || (args.q && !field)) return await searchMetadata(args.q, args.limit);
    if (field === 'updateMetadata' || (args.pk && args.patch && !field)) return await updateMetadata(args.pk, args.patch);
    if (field === 'createDocumentMetadata' || (args.input && !field)) {
      const input = typeof args.input === 'string' ? JSON.parse(args.input) : args.input;
      return await createDocumentMetadata(input);
    }
    return { error: `unknown field '${field}'` };
  } catch (err: any) {
    console.error('metadata-api error', field, err);
    throw new Error(`metadata-api ${field} failed: ${err.message}`);
  }
};
