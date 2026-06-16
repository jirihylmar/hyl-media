/**
 * Maintenance verify (external links + tags): prove the agent's write path
 * persists external_links and genre→_tags to BOTH stores when the plan carries
 * them — confirming the fix's diagnosis that only the prompt/schema (which tell
 * the model to carry them) needed changing, not the persist path.
 *
 * Drives the REAL commit_plan handler (writes.ts executePlan) against the live
 * table + S3 with NO Anthropic client (enrich no-ops), on a throwaway movie, then
 * reads back DDB + the S3 sidecar and asserts, then DELETES the test rows/objects.
 *
 * Run: AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 npx tsx scripts/verify-agent-links-tags.mts
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

import { buildRegistry } from '../amplify/functions/agent/tools.ts';
import { buildRecord, BUCKET } from '../amplify/functions/agent/dc-emit.ts';
import type { OperatorContext } from '../amplify/functions/agent/assistant.ts';

const TABLE = 'hyl-media-metadata-repository';
const region = process.env.AWS_REGION || 'eu-central-1';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const s3 = new S3Client({ region });
const operator: OperatorContext = { sub: 'verify-operator', groups: [] };

// No anthropic → research_entity not registered + enrichResource no-ops (isolates the link/tag path).
const registry = buildRegistry({ ddb, table: TABLE, s3 });
const commit = registry.lookup('commit_plan')!;

const TITLE = 'ZZ Maintenance Test Movie';
const YEAR = '2099';
const plan = {
  intent: 'verify links + tags',
  resource: {
    kind: 'movie', title: TITLE, year: YEAR, language: 'en',
    genre: ['Drama', 'Thriller'],
    abstract: 'A throwaway record used to verify external links + tags persistence.',
    external_links: [
      { type: 'imdb', url: 'https://www.imdb.com/title/tt9999999/' },
      { type: 'wikipedia', url: 'https://en.wikipedia.org/wiki/ZZ_Maintenance_Test_Movie' },
    ],
  },
  agents: [],
};

const id = buildRecord({ kind: 'movie', title: TITLE, year: YEAR }, '1970-01-01T00:00:00.000Z').id;
let ok = true;
const fail = (m: string) => { ok = false; console.error('  ✗', m); };

try {
  const res = await commit.handler(plan as any, operator);
  console.log('commit_plan →', res.summary);
  if (res.isError) fail(`handler error: ${res.content}`);

  // DDB read-back
  const r: any = await ddb.send(new QueryCommand({
    TableName: TABLE, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': id },
  }));
  const row = r.Items?.[0];
  if (!row) fail(`no DDB row for ${id}`);
  const a = row?.Attributes ?? {};
  const ddbLinks = (a._external_links || []).map((l: any) => l.type).sort();
  const ddbTags = (a._tags || []).slice().sort();
  console.log('  DDB _external_links:', JSON.stringify(a._external_links));
  console.log('  DDB _tags          :', JSON.stringify(a._tags));
  if (JSON.stringify(ddbLinks) !== JSON.stringify(['imdb', 'wikipedia'])) fail('DDB _external_links missing imdb+wikipedia');
  if (JSON.stringify(ddbTags) !== JSON.stringify(['drama', 'thriller'])) fail('DDB _tags not genre-derived (drama,thriller)');

  // S3 sidecar read-back (the authoritative store)
  const key = row?.s3_key;
  const obj: any = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const sidecar = JSON.parse(await obj.Body.transformToString());
  const sLinks = (sidecar.Attributes._external_links || []).map((l: any) => l.type).sort();
  const sTags = (sidecar.Attributes._tags || []).slice().sort();
  console.log('  S3  _external_links:', JSON.stringify(sidecar.Attributes._external_links));
  console.log('  S3  _tags          :', JSON.stringify(sidecar.Attributes._tags));
  if (JSON.stringify(sLinks) !== JSON.stringify(['imdb', 'wikipedia'])) fail('S3 sidecar _external_links missing imdb+wikipedia');
  if (JSON.stringify(sTags) !== JSON.stringify(['drama', 'thriller'])) fail('S3 sidecar _tags not genre-derived');

  // Cleanup — delete every row at this PK + the sidecar object.
  for (const it of r.Items ?? []) {
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: it.PK, SK: it.SK } }));
    if (it.s3_key) await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: it.s3_key }));
  }
  console.log('  cleaned up test rows/objects');
} catch (err: any) {
  fail(`exception: ${err?.message || String(err)}`);
}

console.log(ok ? '\n✓ PASS — external links + genre→tags persisted to BOTH DDB and S3 sidecar' : '\n✗ FAIL');
process.exit(ok ? 0 : 1);
