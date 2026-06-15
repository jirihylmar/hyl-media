/**
 * Phase 18 — Claude-driven Dublin Core enrichment.
 * Fills empty dc_abstract (and refines dc_subject) on hyl-media-metadata-repository records,
 * sourcing the Anthropic API key from AWS Secrets Manager (never hardcoded).
 *
 * 18.1 engine + 18.2 _explicit_fields pinning + 18.3 batch write-back.
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 \
 *     node scripts/enrich-dc.mjs [--kind movie] [--limit N] [--apply]
 *   (dry-run by default; prints proposed abstracts. --apply writes to the table.)
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import Anthropic from '@anthropic-ai/sdk';

const TABLE = 'hyl-media-metadata-repository';
const SECRET_ID = 'hyl-media/anthropic-api-key';
const REGION = process.env.AWS_REGION || 'eu-central-1';
const MODEL = 'claude-opus-4-8';
const APPLY = process.argv.includes('--apply');
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const KIND = arg('--kind');
const LIMIT = arg('--limit') ? parseInt(arg('--limit'), 10) : Infinity;

// dc_abstract is refreshable unless the operator pinned it (DH REFRESHABLE_DC_FIELDS / _explicit_fields).
const PIN_FIELD = 'dc_abstract';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function getApiKey() {
  const sm = new SecretsManagerClient({ region: REGION });
  const r = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
  const v = JSON.parse(r.SecretString);
  if (!v.ANTHROPIC_API_KEY) throw new Error('secret missing ANTHROPIC_API_KEY');
  return v.ANTHROPIC_API_KEY;
}

async function scanAll() {
  const items = []; let ExclusiveStartKey;
  do {
    const r = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    items.push(...(r.Items || [])); ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

const SCHEMA = {
  type: 'object',
  properties: {
    abstract: { type: 'string', description: '1-2 sentence factual description, 200-400 chars, in the SAME LANGUAGE as language_code' },
    subjects: { type: 'array', items: { type: 'string' }, description: '3-6 content topics (no format/role words)' },
  },
  required: ['abstract', 'subjects'],
  additionalProperties: false,
};

function buildUserPrompt(a) {
  const facts = {
    title: a.dc_title,
    kind: a._entity_kind,
    language_code: a.language_code,
    creators: a.dc_creator || [],
    contributors: a.dc_contributor || [],
    current_subjects: a.dc_subject || [],
    tags: a._tags || [],
  };
  return `Write Dublin Core metadata for this catalog item using your knowledge of it. `
    + `Return an abstract in the SAME language as language_code ("cs" = Czech, "en" = English) and refined subjects.\n\n`
    + JSON.stringify(facts, null, 2);
}

(async () => {
  console.log(`Enrich DC — ${APPLY ? 'APPLY' : 'DRY-RUN'}${KIND ? ` kind=${KIND}` : ''}${LIMIT !== Infinity ? ` limit=${LIMIT}` : ''} model=${MODEL}`);
  const apiKey = await getApiKey();
  const anthropic = new Anthropic({ apiKey });

  const all = await scanAll();
  const todo = all.filter((it) => {
    const a = it.Attributes || {};
    if (KIND && a._entity_kind !== KIND) return false;
    if ((a._explicit_fields || []).includes(PIN_FIELD)) return false; // 18.2: respect operator pin
    return !a.dc_abstract || a.dc_abstract.trim() === '';
  });
  console.log(`candidates with empty dc_abstract: ${todo.length} (of ${all.length} total)`);

  let done = 0, written = 0, failed = 0, inTok = 0, outTok = 0;
  for (const it of todo) {
    if (done >= LIMIT) break; done++;
    const a = it.Attributes;
    try {
      const resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 500,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        system: 'You write concise, factual Dublin Core abstracts and subject keywords for a personal media catalog (movies, music recordings, books, sheet music, performers). Use only widely-known facts; if unsure, keep the abstract general and accurate. Never invent specifics.',
        messages: [{ role: 'user', content: buildUserPrompt(a) }],
      });
      inTok += resp.usage.input_tokens; outTok += resp.usage.output_tokens;
      if (resp.stop_reason === 'refusal') { console.log(`  REFUSAL ${a._legacy_id}`); failed++; continue; }
      const text = resp.content.find((b) => b.type === 'text')?.text || '{}';
      const out = JSON.parse(text);
      const abstract = String(out.abstract || '').trim();
      const subjects = Array.isArray(out.subjects) ? out.subjects.filter((s) => typeof s === 'string') : [];
      if (!abstract) { failed++; continue; }
      if (done <= 5 || !APPLY) console.log(`  [${a._entity_kind}] ${a.dc_title}\n    → ${abstract}`);

      if (APPLY) {
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: it.PK, SK: it.SK },
          UpdateExpression: 'SET Attributes.dc_abstract = :ab, Attributes.dc_subject = :su, Attributes.#lu = :now',
          ExpressionAttributeNames: { '#lu': '_last_updated_at' },
          ExpressionAttributeValues: { ':ab': abstract, ':su': subjects.length ? subjects : (a.dc_subject || []), ':now': new Date().toISOString() },
        }));
        written++;
      }
    } catch (err) {
      failed++;
      console.log(`  ERROR ${a._legacy_id}: ${err.message?.slice(0, 100)}`);
    }
  }
  const cost = (inTok / 1e6) * 5 + (outTok / 1e6) * 25;
  console.log(`\nprocessed ${done}, ${APPLY ? `written ${written}` : 'dry-run'}, failed ${failed}`);
  console.log(`tokens: ${inTok} in / ${outTok} out  ≈ $${cost.toFixed(4)} (Opus 4.8)`);
})();
