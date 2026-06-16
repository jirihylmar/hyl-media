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
import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import type { ToolDeps } from './tools';
import { canWrite, type ToolDefinition } from './assistant';
import { buildRecord, type EmitInput } from './dc-emit';

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

/** Write a conformant record: S3 content descriptor + S3 sidecar + DDB item. */
async function createResource(deps: ToolDeps, input: EmitInput): Promise<Written> {
  if (!deps.s3) throw new Error('S3 client not configured');
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
  return { id: rec.id, contentKey: rec.contentKey, sidecarKey: rec.sidecarKey, dcSourceUri: rec.sidecar.Attributes.dc_source_uri };
}

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

  const summary = `created ${plan.resource.kind} "${plan.resource.title}" (${movie.id}); ` +
    `${createdCount} new agent${createdCount === 1 ? '' : 's'} created + linked, ${linkedCount} existing linked`;
  return {
    summary,
    detail: { resource_id: movie.id, sidecar: movie.sidecarKey, agents_created: createdCount, agents_linked: linkedCount, cast_uris: castUris.length },
  };
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
