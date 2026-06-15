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
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// Public/private signal (Phase 18.3 operator guidance): an item is PUBLIC only if it has a
// *resolved* authoritative link. nkp + supermusic are auto-generated SEARCH urls (present on
// every book / every sheet) so they prove nothing; youtube is a playlist link (weak). Excluded.
const RESOLVED_AUTHORITATIVE = ['wikipedia', 'imdb', 'musicbrainz', 'discogs', 'openlibrary', 'goodreads', 'databazeknih'];
function classifyVisibility(a) {
  const types = (a._external_links || []).map((l) => String(l.type || '').toLowerCase());
  return types.some((t) => RESOLVED_AUTHORITATIVE.includes(t)) ? 'public' : 'private';
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

// Read embedded PDF document metadata (Title/Author/Subject/Keywords) from the artifact in S3.
// Only book/sheet_music records carry a real PDF (_file_type === 'pdf'). Returns null on any error
// (the user's own files are occasionally non-conformant PDFs — handled gracefully).
async function readPdfMetadata(a) {
  if (a._file_type !== 'pdf' || !a.s3_key || !a.s3_bucket) return null;
  const tmp = join(tmpdir(), `enrich_${process.pid}.pdf`);
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: a.s3_bucket, Key: a.s3_key }));
    writeFileSync(tmp, Buffer.from(await r.Body.transformToByteArray()));
    const info = execFileSync('pdfinfo', [tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const meta = {};
    for (const line of info.split('\n')) {
      const m = line.match(/^(Title|Author|Subject|Keywords|Pages):\s*(.+)$/);
      if (m && m[2].trim()) meta[m[1].toLowerCase()] = m[2].trim();
    }
    return Object.keys(meta).length ? meta : null;
  } catch {
    return null;
  } finally {
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

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

function buildUserPrompt(a, visibility, pdfMeta) {
  const facts = {
    title: a.dc_title,
    kind: a._entity_kind,
    language_code: a.language_code,
    creators: a.dc_creator || [],
    contributors: a.dc_contributor || [],
    current_subjects: a.dc_subject || [],
    tags: (a._tags || []).filter((t) => t !== 'public' && t !== 'private'),
    authoritative_links: (a._external_links || [])
      .filter((l) => RESOLVED_AUTHORITATIVE.includes(String(l.type || '').toLowerCase()))
      .map((l) => `${l.type}: ${l.url}`),
    embedded_document_metadata: pdfMeta || undefined,
  };
  const langLine = `Write the abstract in the SAME language as language_code ("cs" = Czech, "en" = English). `
    + `Return 3-6 content subjects (topics/themes only — no format or role words).`;
  if (visibility === 'public') {
    // Public = a resolved authoritative record exists → world knowledge is appropriate (as for movies).
    return `Write Dublin Core metadata for this PUBLICLY-documented catalog item using your knowledge of it. `
      + `${langLine}\n\n${JSON.stringify(facts, null, 2)}`;
  }
  // Private = personal / not publicly documented. Do NOT use outside knowledge or invent facts.
  return `This is a PRIVATE, personal catalog item that is NOT publicly documented (no authoritative `
    + `reference exists). Do NOT use outside knowledge, do NOT guess, and do NOT invent facts, dates, `
    + `plots, or biographical details. Write the abstract STRICTLY from the record fields and the `
    + `embedded document metadata provided below. If the available information is thin, write a short, `
    + `plain factual description (e.g. "A book titled X by Y." / "A guitar/chord sheet for the song X.") `
    + `rather than padding it. ${langLine}\n\n${JSON.stringify(facts, null, 2)}`;
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

  let done = 0, written = 0, failed = 0, inTok = 0, outTok = 0, nPublic = 0, nPrivate = 0, nPdf = 0;
  for (const it of todo) {
    if (done >= LIMIT) break; done++;
    const a = it.Attributes;
    try {
      const visibility = classifyVisibility(a);
      visibility === 'public' ? nPublic++ : nPrivate++;
      const pdfMeta = await readPdfMetadata(a); // null for non-PDF (movies/persons/recordings/bands)
      if (pdfMeta) nPdf++;
      const resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 500,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        system: 'You write concise, factual Dublin Core abstracts and subject keywords for a personal media catalog (movies, music recordings, books, sheet music, performers). For PUBLIC items use widely-known facts; if unsure keep it general and accurate. For PRIVATE items use ONLY the supplied record fields and embedded document metadata — never invent specifics. Never fabricate facts.',
        messages: [{ role: 'user', content: buildUserPrompt(a, visibility, pdfMeta) }],
      });
      inTok += resp.usage.input_tokens; outTok += resp.usage.output_tokens;
      if (resp.stop_reason === 'refusal') { console.log(`  REFUSAL ${a._legacy_id}`); failed++; continue; }
      const text = resp.content.find((b) => b.type === 'text')?.text || '{}';
      const out = JSON.parse(text);
      const abstract = String(out.abstract || '').trim();
      const subjects = Array.isArray(out.subjects) ? out.subjects.filter((s) => typeof s === 'string') : [];
      if (!abstract) { failed++; continue; }
      // Maintain the curation visibility tag (drop the opposite, add the classified one).
      const baseTags = (a._tags || []).filter((t) => t !== 'public' && t !== 'private');
      const tags = [...baseTags, visibility];
      if (done <= 8 || !APPLY) console.log(`  [${a._entity_kind}/${visibility}${pdfMeta ? '/pdf' : ''}] ${a.dc_title}\n    → ${abstract}`);

      if (APPLY) {
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: it.PK, SK: it.SK },
          UpdateExpression: 'SET Attributes.dc_abstract = :ab, Attributes.dc_subject = :su, Attributes.#tg = :tg, Attributes.#lu = :now',
          ExpressionAttributeNames: { '#lu': '_last_updated_at', '#tg': '_tags' },
          ExpressionAttributeValues: { ':ab': abstract, ':su': subjects.length ? subjects : (a.dc_subject || []), ':tg': tags, ':now': new Date().toISOString() },
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
  console.log(`visibility: ${nPublic} public / ${nPrivate} private; embedded PDF metadata used on ${nPdf}`);
  console.log(`tokens: ${inTok} in / ${outTok} out  ≈ $${cost.toFixed(4)} (Opus 4.8)`);
})();
