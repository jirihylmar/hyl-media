/**
 * Read API over the hyl-media-metadata-repository (Dublin Core) table.
 * Backs three custom AppSync queries (Phase 17.1):
 *   - getMetadata(pk)            → one DC record (or null)
 *   - listMetadataByType(dcType) → all records of a DCMI type (MovingImage/Sound/Text/Dataset)
 *   - searchMetadata(q)          → records whose name/dc_subject/_tags match q (diacritics-insensitive)
 *
 * Each returns AWSJSON (a.json()) — the raw DC record(s); the frontend maps to view models.
 * The function dispatches on the AppSync field name (with an argument-presence fallback).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.METADATA_TABLE as string;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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
    return { error: `unknown field '${field}'` };
  } catch (err: any) {
    console.error('metadata-api error', field, err);
    throw new Error(`metadata-api ${field} failed: ${err.message}`);
  }
};
