/**
 * Write path for the hyl-media operator agent (Phase 21.4+).
 *
 * Per the locked Phase 21 decision — "Plan → approve batch → execute" — all
 * mutations are encapsulated in ONE mutating tool, `commit_plan`. The agent
 * researches (research_entity), resolves which agents already exist (find_agent),
 * and assembles a single structured plan, then calls commit_plan(plan). The loop
 * (loop.ts) treats it as mutating: it STOPS without executing and returns
 * `awaiting_approval` carrying the plan, so the operator approves ONCE. On
 * approval the loop invokes this handler, which executes the whole batch and
 * returns a summary step-log — not per-write confirmation.
 *
 * Executor status:
 *   21.5 create_resource — conformant emit → S3 sidecar + DDB           [done]
 *   21.6 find_or_create_agent + link_relationship — agents/ + dc_type=Agent,
 *        dc_creator/dc_contributor/_cast_uris + reverse dc_relation edges  [done]
 *   21.7 enrich + set_external_links + reconcile (sync-dc-to-s3) + audit  [pending]
 * New agents are created WITH their reverse filmography edge inline (both stores
 * conformant); existing agents (reused) get a read-modify-write that appends the
 * new relation to dc_relation in DDB + the S3 sidecar.
 */
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DeleteCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import type { ToolDeps } from './tools';
import { canWrite, type ToolDefinition } from './assistant';
import { buildRecord, convertToAscii, derivedId, kindSpec, type EmitInput } from './dc-emit';

/** Roles that map to dc_creator (vs dc_contributor). */
const CREATOR_ROLES = new Set(['director', 'writer', 'author', 'composer', 'creator', 'screenwriter', 'screenplay', 'director+writer']);
function isCreatorRole(role: string): boolean {
  const r = (role || '').toLowerCase();
  return [...CREATOR_ROLES].some((cr) => r.includes(cr));
}

/** Split a person name into given/family for the agent _given_name/_family_name. */
function splitName(name: string): { given: string; family: string } {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length <= 1) return { given: name, family: '' };
  return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] };
}

/** A person/band/collaboration the plan touches (created if `existing_id` empty). */
export interface PlanAgent {
  name: string;
  kind: string; // person | band | collaboration
  role: string; // director | actor | author | performer | composer | …
  existing_id?: string; // from find_agent; '' ⇒ create a new agent
}

/** The primary record the plan creates. */
export interface PlanResource {
  kind: string; // movie | recording | book | sheet_music | person | band | collaboration
  title: string;
  year?: string;
  language?: string;
  genre?: string[];
  abstract?: string;
  external_links?: { type: string; url: string }[];
}

export interface CatalogPlan {
  intent?: string;
  resource: PlanResource;
  agents: PlanAgent[];
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', description: 'One line describing the operation, e.g. "create movie Easy Virtue (2008)".' },
    resource: {
      type: 'object',
      description: 'The primary record to create.',
      properties: {
        kind: { type: 'string', description: 'movie | recording | book | sheet_music | person | band | collaboration' },
        title: { type: 'string' },
        year: { type: 'string' },
        language: { type: 'string', description: 'en, cs, … (best guess).' },
        genre: { type: 'array', items: { type: 'string' } },
        abstract: { type: 'string', description: '1-3 sentence Dublin Core abstract.' },
        external_links: {
          type: 'array',
          items: { type: 'object', properties: { type: { type: 'string' }, url: { type: 'string' } }, required: ['type', 'url'] },
        },
      },
      required: ['kind', 'title'],
    },
    agents: {
      type: 'array',
      description:
        'Every person/band/collaboration involved. For each, set existing_id to the id from ' +
        'find_agent when it already exists (so it is reused, not duplicated), or leave it empty to ' +
        'create a new agent. role maps to the relationship (director/author → creator; actor/' +
        'performer → contributor).',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', description: 'person | band | collaboration' },
          role: { type: 'string' },
          existing_id: { type: 'string' },
        },
        required: ['name', 'role'],
      },
    },
  },
  required: ['resource', 'agents'],
};

/** Validate + normalize the plan input Claude produced. */
function parsePlan(input: Record<string, unknown>): CatalogPlan {
  const resource = (input.resource ?? {}) as PlanResource;
  const agents = Array.isArray(input.agents) ? (input.agents as PlanAgent[]) : [];
  if (!resource || typeof resource.title !== 'string' || !resource.title.trim()) {
    throw new Error('plan.resource.title is required');
  }
  if (!resource.kind) throw new Error('plan.resource.kind is required');
  return { intent: typeof input.intent === 'string' ? input.intent : undefined, resource, agents };
}

/** Short human description of the plan (for the proposal summary + step log). */
function describePlan(plan: CatalogPlan): string {
  const r = plan.resource;
  const toCreate = plan.agents.filter((a) => !a.existing_id);
  const toReuse = plan.agents.filter((a) => a.existing_id);
  return (
    `${plan.intent || `create ${r.kind} "${r.title}"${r.year ? ` (${r.year})` : ''}`}: ` +
    `1 ${r.kind}, ${toCreate.length} new agent${toCreate.length === 1 ? '' : 's'}, ` +
    `${toReuse.length} reused, ${(r.external_links || []).length} link${(r.external_links || []).length === 1 ? '' : 's'}`
  );
}

/** Map a plan resource to the emit input (21.5 — no agent links yet; those land in 21.6). */
function resourceToEmitInput(r: PlanResource): EmitInput {
  const genre = Array.isArray(r.genre) ? r.genre : [];
  return {
    kind: r.kind,
    title: r.title,
    year: r.year,
    language: r.language,
    abstract: r.abstract,
    subjects: genre,
    tags: genre.map((g) => g.toLowerCase()),
    externalLinks: Array.isArray(r.external_links) ? r.external_links : [],
  };
}

interface Written {
  id: string;
  contentKey: string;
  sidecarKey: string;
  dcSourceUri: string;
}

/** All rows for a PK (normally ≤1; used to detect/clean up stale-SK duplicates). */
async function queryAllByPK(deps: ToolDeps, id: string): Promise<any[]> {
  const r: any = await deps.ddb.send(new QueryCommand({
    TableName: deps.table, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': id },
  }));
  return r.Items ?? [];
}

/**
 * Write a conformant record as a true upsert-by-PK: S3 content + sidecar + DDB.
 * The table key is composite (PK, SK) and SK = #<language>#<slug>, so the
 * deterministic PK alone is NOT enough for idempotency — a re-create under a
 * different language would land at a new SK and DUPLICATE the row. So: reuse an
 * existing row's language (stable SK) when the caller didn't pin one, and delete
 * any leftover rows at this PK with a different SK. The S3 sidecar/content are
 * keyed by PK (shared), so only the stale DDB row is removed.
 */
async function createResource(deps: ToolDeps, input: EmitInput): Promise<Written> {
  if (!deps.s3) throw new Error('S3 client not configured');
  const id = derivedId(kindSpec(input.kind).entityKind, input.title.trim(), input.year || '');
  const existing = await queryAllByPK(deps, id);
  if (existing.length && !input.language) {
    input = { ...input, language: existing[0].Attributes?.language_code };
  }
  const now = new Date().toISOString();
  const rec = buildRecord(input, now);
  // S3 is the source of truth; write content + sidecar, then mirror to DDB.
  await deps.s3.send(new PutObjectCommand({
    Bucket: rec.ddbItem.s3_bucket, Key: rec.contentKey,
    Body: JSON.stringify(rec.descriptor, null, 2), ContentType: 'application/json',
  }));
  await deps.s3.send(new PutObjectCommand({
    Bucket: rec.ddbItem.s3_bucket, Key: rec.sidecarKey,
    Body: JSON.stringify(rec.sidecar, null, 2), ContentType: 'application/json',
  }));
  await deps.ddb.send(new PutCommand({ TableName: deps.table, Item: rec.ddbItem }));
  for (const it of existing) {
    if (it.SK !== rec.ddbItem.SK) {
      await deps.ddb.send(new DeleteCommand({ TableName: deps.table, Key: { PK: it.PK, SK: it.SK } }));
    }
  }
  return { id: rec.id, contentKey: rec.contentKey, sidecarKey: rec.sidecarKey, dcSourceUri: rec.sidecar.Attributes.dc_source_uri };
}

/** Authoritative link types → "public" enrichment (world knowledge allowed). */
const AUTHORITATIVE = new Set(['wikipedia', 'imdb', 'musicbrainz', 'discogs', 'openlibrary', 'goodreads', 'databazeknih']);

const RESEARCH_TEXT = (content: any[]): string =>
  (content || []).filter((b) => b?.type === 'text').map((b) => b.text).join('\n').trim();

/** Read one DC record by PK (the hash key; one row per PK). */
async function getById(deps: ToolDeps, id: string): Promise<any | null> {
  const r: any = await deps.ddb.send(new QueryCommand({
    TableName: deps.table,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': id },
    Limit: 1,
  }));
  return r.Items?.[0] ?? null;
}

/**
 * Append a relation URI to an EXISTING record's dc_relation, in BOTH stores
 * (DDB + S3 sidecar) so neither drifts. Idempotent: skips if already present.
 */
async function appendRelation(deps: ToolDeps, id: string, relationUri: string): Promise<void> {
  if (!deps.s3) throw new Error('S3 client not configured');
  const row = await getById(deps, id);
  if (!row) throw new Error(`appendRelation: record not found ${id}`);
  const existing: string[] = Array.isArray(row.Attributes?.dc_relation) ? row.Attributes.dc_relation : [];
  if (existing.includes(relationUri)) return;
  const next = [...existing, relationUri];
  const now = new Date().toISOString();
  await deps.ddb.send(new UpdateCommand({
    TableName: deps.table,
    Key: { PK: row.PK, SK: row.SK },
    UpdateExpression: 'SET Attributes.dc_relation = :r, Attributes.#lu = :now',
    ExpressionAttributeNames: { '#lu': '_last_updated_at' },
    ExpressionAttributeValues: { ':r': next, ':now': now },
  }));
  // Mirror into the S3 sidecar (read-modify-write preserves key order + enrichment).
  const sidecarKey: string = row.s3_key;
  const bucket: string = row.s3_bucket;
  const obj: any = await deps.s3.send(new GetObjectCommand({ Bucket: bucket, Key: sidecarKey }));
  const sidecar = JSON.parse(await obj.Body.transformToString());
  sidecar.Attributes.dc_relation = next;
  sidecar.Attributes._last_updated_at = now;
  await deps.s3.send(new PutObjectCommand({
    Bucket: bucket, Key: sidecarKey, Body: JSON.stringify(sidecar, null, 2), ContentType: 'application/json',
  }));
}

/**
 * Patch a set of Attributes fields on an existing record in BOTH stores
 * (DDB UpdateCommand + S3 sidecar read-modify-write), always bumping
 * _last_updated_at. Used by enrich + set_external_links (21.7) and the edit
 * tools (21.9). Skips silently if the patch is empty.
 */
async function patchAttributes(
  deps: ToolDeps,
  id: string,
  patch: Record<string, unknown>,
  topLevel: Record<string, unknown> = {},
): Promise<void> {
  if (!deps.s3) throw new Error('S3 client not configured');
  const keys = Object.keys(patch);
  const topKeys = Object.keys(topLevel);
  if (!keys.length && !topKeys.length) return;
  const row = await getById(deps, id);
  if (!row) throw new Error(`patchAttributes: record not found ${id}`);
  const now = new Date().toISOString();

  const names: Record<string, string> = { '#lu': '_last_updated_at' };
  const values: Record<string, unknown> = { ':now': now };
  const sets: string[] = ['Attributes.#lu = :now'];
  keys.forEach((k, i) => {
    names[`#k${i}`] = k;
    values[`:v${i}`] = patch[k];
    sets.push(`Attributes.#k${i} = :v${i}`);
  });
  topKeys.forEach((k, i) => {
    names[`#t${i}`] = k;
    values[`:t${i}`] = topLevel[k];
    sets.push(`#t${i} = :t${i}`);
  });
  await deps.ddb.send(new UpdateCommand({
    TableName: deps.table, Key: { PK: row.PK, SK: row.SK },
    UpdateExpression: 'SET ' + sets.join(', '),
    ExpressionAttributeNames: names, ExpressionAttributeValues: values,
  }));

  const obj: any = await deps.s3.send(new GetObjectCommand({ Bucket: row.s3_bucket, Key: row.s3_key }));
  const sidecar = JSON.parse(await obj.Body.transformToString());
  for (const k of keys) sidecar.Attributes[k] = patch[k];
  for (const k of topKeys) sidecar[k] = topLevel[k];
  sidecar.Attributes._last_updated_at = now;
  await deps.s3.send(new PutObjectCommand({
    Bucket: row.s3_bucket, Key: row.s3_key, Body: JSON.stringify(sidecar, null, 2), ContentType: 'application/json',
  }));
}

/** Merge external links (by type) into _external_links on a record (both stores). */
async function setExternalLinks(deps: ToolDeps, id: string, links: { type: string; url: string }[]): Promise<number> {
  const row = await getById(deps, id);
  if (!row) throw new Error(`setExternalLinks: record not found ${id}`);
  const existing: { type: string; url: string }[] = Array.isArray(row.Attributes?._external_links) ? row.Attributes._external_links : [];
  const byType = new Map(existing.map((l) => [l.type, l]));
  for (const l of links) if (l?.type && l?.url) byType.set(l.type, { type: l.type, url: l.url });
  const merged = [...byType.values()];
  await patchAttributes(deps, id, { _external_links: merged });
  return merged.length;
}

/**
 * Enrich a record's dc_abstract + dc_subject via Claude (wraps the enrich-dc
 * engine: public/private branching off resolved authoritative links; respects
 * operator pins in _explicit_fields). Writes to both stores. No-op without an
 * Anthropic client. Returns what changed.
 */
async function enrichResource(deps: ToolDeps, id: string): Promise<{ abstract?: string; subjects?: string[] }> {
  if (!deps.anthropic) return {};
  const row = await getById(deps, id);
  if (!row) return {};
  const a = row.Attributes || {};
  const pinned = new Set<string>(Array.isArray(a._explicit_fields) ? a._explicit_fields : []);
  const linkTypes: string[] = Array.isArray(a._external_links) ? a._external_links.map((l: any) => l?.type) : [];
  const visibility = linkTypes.some((t) => AUTHORITATIVE.has(t)) ? 'public' : 'private';

  const facts = {
    kind: a._entity_kind, title: a.dc_title, language: a.language_code,
    creators: a.dc_creator, contributors: a.dc_contributor,
    current_subjects: a.dc_subject, links: linkTypes,
  };
  const system = visibility === 'public'
    ? 'Write a concise Dublin Core abstract (1-2 sentences, ~200-400 chars) and 3-6 topical subject keywords for this catalogued resource. It has authoritative public sources, so you may use well-established world knowledge. Subjects are TOPICS (themes, genre-as-topic), not roles or formats. Never invent specifics you are unsure of.'
    : 'Write a concise Dublin Core abstract (1-2 sentences) and 3-6 topical subjects using ONLY the supplied fields — this resource has no authoritative public source, so do NOT add world knowledge or invent facts.';
  const SCHEMA = {
    type: 'object', additionalProperties: false,
    properties: { abstract: { type: 'string' }, subjects: { type: 'array', items: { type: 'string' } } },
    required: ['abstract', 'subjects'],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp: any = await deps.anthropic.messages.create({
    model: deps.model || 'claude-opus-4-8', max_tokens: 500,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system, messages: [{ role: 'user', content: JSON.stringify(facts) }],
  } as any);
  const data = JSON.parse(RESEARCH_TEXT(resp.content) || '{}');

  const patch: Record<string, unknown> = {};
  const out: { abstract?: string; subjects?: string[] } = {};
  if (!pinned.has('dc_abstract') && typeof data.abstract === 'string' && data.abstract.trim()) {
    patch.dc_abstract = data.abstract.trim(); out.abstract = data.abstract.trim();
  }
  if (!pinned.has('dc_subject') && Array.isArray(data.subjects) && data.subjects.length) {
    patch.dc_subject = data.subjects; out.subjects = data.subjects;
  }
  await patchAttributes(deps, id, patch);
  return out;
}

/**
 * Execute the approved plan as a batch (21.5 resource + 21.6 agents/links).
 *  1. Resolve the movie's URI + each agent's URI (existing → read; new → derive).
 *  2. Create the resource WITH dc_creator/dc_contributor/_cast_uris.
 *  3. Create new agents WITH their reverse dc_relation → resource (inline edge).
 *  4. Append the reverse edge to existing (reused) agents in both stores.
 * Enrichment + external-link writes + a final reconcile/audit land in 21.7.
 */
async function executePlan(deps: ToolDeps, plan: CatalogPlan): Promise<{ summary: string; detail: any }> {
  // 1. Derive the movie identity/URI without writing yet.
  const resourceInput = resourceToEmitInput(plan.resource);
  const movieProbe = buildRecord(resourceInput, '1970-01-01T00:00:00.000Z');
  const movieUri = movieProbe.sidecar.Attributes.dc_source_uri;

  // Resolve each agent → { name, role, uri, isNew, input? }
  const resolved = await Promise.all(plan.agents.map(async (a) => {
    const kind = ['person', 'band', 'collaboration'].includes((a.kind || '').toLowerCase()) ? a.kind.toLowerCase() : 'person';
    if (a.existing_id) {
      const row = await getById(deps, a.existing_id);
      const uri = row?.Attributes?.dc_source_uri;
      return { name: a.name, role: a.role, kind, uri, isNew: false, existing_id: a.existing_id, found: !!row };
    }
    const probe = buildRecord({ kind, title: a.name }, '1970-01-01T00:00:00.000Z');
    return { name: a.name, role: a.role, kind, uri: probe.sidecar.Attributes.dc_source_uri, isNew: true, found: true };
  }));

  // 2. Movie edges from resolved agents.
  const creators = resolved.filter((a) => isCreatorRole(a.role)).map((a) => a.name);
  const contributors = resolved.filter((a) => !isCreatorRole(a.role)).map((a) => a.name);
  const castUris = resolved.filter((a) => a.uri).map((a) => a.uri as string);
  const movie = await createResource(deps, { ...resourceInput, creators, contributors, castUris });

  // 3 + 4. Create new agents with the reverse edge; append to existing ones.
  let createdCount = 0;
  let linkedCount = 0;
  for (const a of resolved) {
    if (a.isNew) {
      const nm = a.kind === 'person' ? splitName(a.name) : { given: '', family: '' };
      await createResource(deps, {
        kind: a.kind, title: a.name, language: 'en',
        roles: [a.role], givenName: nm.given, familyName: nm.family,
        tags: [a.role.toLowerCase()], relations: [movie.dcSourceUri],
      });
      createdCount++;
    } else if (a.found) {
      await appendRelation(deps, a.existing_id as string, movie.dcSourceUri);
      linkedCount++;
    }
  }

  // 5. Enrich the new resource (refine abstract + topical subjects; honors pins)
  //    and ensure external links are merged. Both write to DDB + S3 sidecar, so
  //    the stores stay reconciled — no separate sync pass needed.
  const enr = await enrichResource(deps, movie.id);
  if (Array.isArray(plan.resource.external_links) && plan.resource.external_links.length) {
    await setExternalLinks(deps, movie.id, plan.resource.external_links);
  }

  const summary = `created ${plan.resource.kind} "${plan.resource.title}" (${movie.id}); ` +
    `${createdCount} new agent${createdCount === 1 ? '' : 's'} created + linked, ${linkedCount} existing linked` +
    `${enr.subjects ? `; enriched (${enr.subjects.length} subjects)` : ''}`;
  return {
    summary,
    detail: {
      resource_id: movie.id, sidecar: movie.sidecarKey,
      agents_created: createdCount, agents_linked: linkedCount, cast_uris: castUris.length,
      enriched: !!enr.subjects, abstract_set: !!enr.abstract,
    },
  };
}

// --- Edit tools (Phase 21.9 — realizes the superseded 18.4 + 18.5) ---
// Each is an individual mutating tool: editing an existing record goes through
// its own propose→approve gate (distinct from the create batch in commit_plan).

const EDITABLE = new Set(['dc_abstract', 'dc_title', 'dc_subject', 'language_code', '_tags', 'dc_creator', 'dc_contributor']);

/** update_metadata(id, fields) — SET explicit values and PIN them in _explicit_fields. */
function updateMetadataTool(deps: ToolDeps): ToolDefinition {
  return {
    name: 'update_metadata',
    description:
      'Set explicit field values on an existing catalog record (by id) and PIN them so future ' +
      'regeneration never overwrites them. Use when the operator dictates a specific value (e.g. ' +
      '"set the Easy Virtue abstract to …"). Editable fields: dc_abstract, dc_title, dc_subject ' +
      '(array), language_code, _tags (array), dc_creator (array), dc_contributor (array).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Record id (PK/UUID).' },
        fields: { type: 'object', description: 'Field→value map of the editable fields to set.' },
      },
      required: ['id', 'fields'],
    },
    mutating: true,
    handler: async (input, operator) => {
      if (!canWrite(operator)) return { content: 'Not permitted.', isError: true };
      const id = typeof input.id === 'string' ? input.id : '';
      const fields = input.fields && typeof input.fields === 'object' ? (input.fields as Record<string, unknown>) : {};
      if (!id) return { content: 'Provide a record id.', isError: true };
      const row = await getById(deps, id);
      if (!row) return { content: `Not found: ${id}`, summary: `no record ${id}`, isError: true };
      const attrPatch: Record<string, unknown> = {};
      const topLevel: Record<string, unknown> = {};
      const setKeys: string[] = [];
      for (const [k, v] of Object.entries(fields)) {
        if (!EDITABLE.has(k)) continue;
        attrPatch[k] = v;
        setKeys.push(k);
        if (k === 'dc_title' && typeof v === 'string') {
          const folded = convertToAscii(v);
          attrPatch._document_title = folded;
          topLevel.Title = folded;
        }
      }
      if (!setKeys.length) {
        return { content: `No editable fields in patch (allowed: ${[...EDITABLE].join(', ')}).`, summary: 'nothing to update', isError: true };
      }
      const pinned = new Set<string>(Array.isArray(row.Attributes?._explicit_fields) ? row.Attributes._explicit_fields : []);
      setKeys.forEach((k) => pinned.add(k));
      attrPatch._explicit_fields = [...pinned].sort();
      await patchAttributes(deps, id, attrPatch, topLevel);
      return { content: JSON.stringify({ id, updated: setKeys, pinned: [...pinned].sort() }), summary: `set + pinned ${setKeys.join(', ')} on ${id.slice(0, 8)}` };
    },
  };
}

/** regenerate(id) — re-derive abstract + subjects, preserving operator pins. */
function regenerateTool(deps: ToolDeps): ToolDefinition {
  return {
    name: 'regenerate',
    description:
      'Re-derive a record\'s abstract and subjects from enrichment, PRESERVING any operator-pinned ' +
      'fields (_explicit_fields). Use to refresh auto-generated metadata after edits or when facts changed.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    mutating: true,
    handler: async (input, operator) => {
      if (!canWrite(operator)) return { content: 'Not permitted.', isError: true };
      const id = typeof input.id === 'string' ? input.id : '';
      if (!id) return { content: 'Provide a record id.', isError: true };
      const out = await enrichResource(deps, id);
      const changed = [out.abstract ? 'abstract' : '', out.subjects ? 'subjects' : ''].filter(Boolean);
      return {
        content: JSON.stringify({ id, regenerated: changed }),
        summary: changed.length ? `regenerated ${changed.join(' + ')} on ${id.slice(0, 8)}` : `${id.slice(0, 8)}: all fields pinned — no change`,
      };
    },
  };
}

/** approve(id) — mark a record operator-approved. */
function approveTool(deps: ToolDeps): ToolDefinition {
  return {
    name: 'approve',
    description: 'Mark a catalog record as operator-approved (sets _approval_status=approved, with who/when).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    mutating: true,
    handler: async (input, operator) => {
      if (!canWrite(operator)) return { content: 'Not permitted.', isError: true };
      const id = typeof input.id === 'string' ? input.id : '';
      if (!id) return { content: 'Provide a record id.', isError: true };
      const row = await getById(deps, id);
      if (!row) return { content: `Not found: ${id}`, isError: true };
      const now = new Date().toISOString();
      await patchAttributes(deps, id, { _approval_status: 'approved', _approved_by: operator.sub, _approved_at: now });
      return { content: JSON.stringify({ id, _approval_status: 'approved' }), summary: `approved ${id.slice(0, 8)}` };
    },
  };
}

/** The Phase 21.9 edit tools (each individually approval-gated). */
export function editTools(deps: ToolDeps): ToolDefinition[] {
  return [updateMetadataTool(deps), regenerateTool(deps), approveTool(deps)];
}

export function commitPlanTool(deps: ToolDeps): ToolDefinition {
  return {
    name: 'commit_plan',
    description:
      'Propose the FULL plan to add a resource to the catalog in one shot: the resource itself plus ' +
      'every agent to create or reuse (with roles) and the external links. Call this exactly once, ' +
      'after you have researched the entity and resolved existing agents with find_agent. The ' +
      'platform pauses and shows the operator your plan for a SINGLE approval; on approval it ' +
      'executes the whole batch (create the conformant record, create/link agents, enrich, set ' +
      'links, reconcile S3) and returns a summary. Do not call any other write step — this one ' +
      'commits everything.',
    inputSchema: PLAN_SCHEMA,
    mutating: true,
    handler: async (input, operator) => {
      if (!canWrite(operator)) {
        return { content: 'Not permitted: the operator is not authorized to modify the catalog.', isError: true };
      }
      let plan: CatalogPlan;
      try {
        plan = parsePlan(input);
      } catch (err: any) {
        return { content: `Invalid plan: ${err?.message || String(err)}`, summary: 'invalid plan', isError: true };
      }
      try {
        const { summary, detail } = await executePlan(deps, plan);
        return { content: JSON.stringify({ executed: true, ...detail }), summary };
      } catch (err: any) {
        return { content: `Plan execution failed: ${err?.message || String(err)}`, summary: 'execution error', isError: true };
      }
    },
  };
}
