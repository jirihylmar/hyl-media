/** One-off: profile remaining DC kinds for Phase 18.3 enrichment design. Read-only. */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = 'hyl-media-metadata-repository';
const REGION = process.env.AWS_REGION || 'eu-central-1';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function scanAll() {
  const items = []; let ExclusiveStartKey;
  do {
    const r = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    items.push(...(r.Items || [])); ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

const AUTH = ['wikipedia', 'imdb', 'musicbrainz', 'nkp', 'discogs', 'openlibrary', 'goodreads'];
const linkTypes = (a) => (a._external_links || []).map((l) => l.type || l.t || '').filter(Boolean);

const all = await scanAll();
const byKind = {};
for (const it of all) {
  const a = it.Attributes || {};
  const k = a._entity_kind || '(none)';
  byKind[k] ||= { total: 0, emptyAbs: 0, withAuthLink: 0, linkTypes: {}, cats: {}, fileTypes: {}, samples: [] };
  const b = byKind[k];
  b.total++;
  if (!a.dc_abstract || String(a.dc_abstract).trim() === '') b.emptyAbs++;
  const lts = linkTypes(a);
  if (lts.some((t) => AUTH.includes(t.toLowerCase()))) b.withAuthLink++;
  for (const t of lts) b.linkTypes[t] = (b.linkTypes[t] || 0) + 1;
  b.cats[a._category || '?'] = (b.cats[a._category || '?'] || 0) + 1;
  b.fileTypes[a._file_type || '?'] = (b.fileTypes[a._file_type || '?'] || 0) + 1;
  if (b.samples.length < 2) b.samples.push({
    title: a.dc_title, lang: a.language_code, creator: a.dc_creator,
    s3_key: a.s3_key, source_uri: a.dc_source_uri, cat: a._category, ft: a._file_type,
    links: a._external_links, tags: a._tags, legacy: a._legacy_id,
  });
}
for (const [k, b] of Object.entries(byKind).sort()) {
  console.log(`\n=== ${k}: ${b.total} total, ${b.emptyAbs} empty-abstract, ${b.withAuthLink} with authoritative link`);
  console.log(`  categories: ${JSON.stringify(b.cats)}  fileTypes: ${JSON.stringify(b.fileTypes)}`);
  console.log(`  linkTypes: ${JSON.stringify(b.linkTypes)}`);
  for (const s of b.samples) console.log(`  sample: ${JSON.stringify(s)}`);
}
