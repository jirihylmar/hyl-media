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
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.METADATA_TABLE as string;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const norm = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

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
    if (field === 'listMetadataByType' || (args.dcType && !field)) return await listMetadataByType(args.dcType, args.limit);
    if (field === 'searchMetadata' || (args.q && !field)) return await searchMetadata(args.q, args.limit);
    return { error: `unknown field '${field}'` };
  } catch (err: any) {
    console.error('metadata-api error', field, err);
    throw new Error(`metadata-api ${field} failed: ${err.message}`);
  }
};
