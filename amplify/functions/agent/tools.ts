/**
 * Concrete tool set for the hyl-media operator agent (Phase 21.1).
 *
 * 21.1 proves the loop with a single READ tool, `search_catalog`, over the
 * hyl-media-metadata-repository (DC) table — the same diacritics-insensitive
 * scan the metadata-api Lambda uses. Read tools run inline in the loop;
 * write/research tools (21.2–21.7) register here later and set `mutating: true`
 * where they change state.
 *
 * Tools are built via a `ToolDeps` factory so later tasks can inject the S3
 * client, secret, and write helpers without rewiring the handler.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { S3Client } from '@aws-sdk/client-s3';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

import { canRead, createToolRegistry, type ToolDefinition, type ToolRegistry } from './assistant';
import { researchEntityTool } from './research';
import { commitPlanTool, editTools } from './writes';

export interface ToolDeps {
  ddb: DynamoDBDocumentClient;
  /** hyl-media-metadata-repository */
  table: string;
  /** Anthropic client — required for the research_entity (web-search) tool. */
  anthropic?: Anthropic;
  /** Model id for sub-agent research/extraction calls. */
  model?: string;
  /** S3 client — required for the write path (commit_plan executor). */
  s3?: S3Client;
}

/** Diacritics-insensitive normalize (mirrors metadata-api `norm`). */
const norm = (s: string): string =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function scanAll(deps: ToolDeps, params: Record<string, unknown> = {}): Promise<any[]> {
  const items: any[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r: any = await deps.ddb.send(
      new ScanCommand({ TableName: deps.table, ExclusiveStartKey, ...params }),
    );
    items.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

/** Compact view of a DC record for the agent (id, title, type, kind, links). */
function toHit(it: any) {
  const a = it.Attributes || {};
  const links = Array.isArray(a._external_links)
    ? a._external_links.map((l: any) => l?.type).filter(Boolean)
    : [];
  return {
    id: it.PK ?? it.id,
    title: a.dc_title ?? it.Title ?? '',
    dc_type: a.dc_type ?? null,
    entity_kind: a._entity_kind ?? null,
    language: a.language_code ?? null,
    subjects: Array.isArray(a.dc_subject) ? a.dc_subject : [],
    link_types: links,
  };
}

/** Fuller view of one DC record — adds abstract + relationship edges. */
function toFullView(it: any) {
  const a = it.Attributes || {};
  return {
    ...toHit(it),
    content_type: it.ContentType ?? null,
    abstract: a.dc_abstract ?? '',
    creators: Array.isArray(a.dc_creator) ? a.dc_creator : a.dc_creator ?? null,
    contributors: Array.isArray(a.dc_contributor) ? a.dc_contributor : a.dc_contributor ?? null,
    given_name: a._given_name ?? null,
    family_name: a._family_name ?? null,
    roles: Array.isArray(a._roles) ? a._roles : [],
    tags: Array.isArray(a._tags) ? a._tags : [],
    external_links: Array.isArray(a._external_links) ? a._external_links : [],
    cast_uris: Array.isArray(a._cast_uris) ? a._cast_uris : [],
    performer_uris: Array.isArray(a._performer_uris) ? a._performer_uris : [],
    is_part_of: a.dc_is_part_of ?? null,
    has_part: a.dc_has_part ?? null,
    relation: a.dc_relation ?? null,
  };
}

/** Fetch one record by PK (hash key). PK has one row here, so Query-by-PK via scan filter. */
async function getResourceById(deps: ToolDeps, id: string): Promise<any | null> {
  if (!id) return null;
  const items = await scanAll(deps, {
    FilterExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': id },
  });
  return items[0] ?? null;
}

/** Is this record an agent (person / band / collaboration)? */
function isAgentRecord(it: any): boolean {
  const a = it.Attributes || {};
  return a.dc_type === 'Agent' || ['person', 'band', 'collaboration'].includes(a._entity_kind);
}

/** search_catalog(query, limit?) — diacritics-insensitive title/subject/tag/creator search. */
function searchCatalogTool(deps: ToolDeps): ToolDefinition {
  return {
    name: 'search_catalog',
    description:
      'Search the existing hyl-media catalog (movies, recordings, books, sheet music, and agents) ' +
      'by name, subject, tag, or creator. Diacritics-insensitive. Use this to check whether a ' +
      'resource already exists before proposing to create it, and to find candidates by topic. ' +
      'Returns up to `limit` matching records with id, title, dc_type, entity_kind, language, ' +
      'subjects, and the external-link source types present.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text (name, subject, tag, or creator). Min 2 chars.' },
        limit: { type: 'integer', description: 'Max results to return (default 20).' },
      },
      required: ['query'],
    },
    mutating: false,
    handler: async (input, operator) => {
      if (!canRead(operator)) {
        return { content: 'Not permitted: the operator is not authorized to read the catalog.', isError: true };
      }
      const query = typeof input.query === 'string' ? input.query : '';
      const limit = typeof input.limit === 'number' && input.limit > 0 ? Math.min(input.limit, 50) : 20;
      const nq = norm(query);
      if (nq.length < 2) {
        return { content: 'Provide a query of at least 2 characters.', summary: 'query too short', isError: true };
      }
      const all = await scanAll(deps);
      const hits = all.filter((it) => {
        const a = it.Attributes || {};
        if (norm(a.dc_title || it.Title || '').includes(nq)) return true;
        const subj: string[] = Array.isArray(a.dc_subject) ? a.dc_subject : [];
        const tags: string[] = Array.isArray(a._tags) ? a._tags : [];
        const creators: string[] = Array.isArray(a.dc_creator) ? a.dc_creator : [];
        return [...subj, ...tags, ...creators].some((t) => norm(t).includes(nq));
      });
      hits.sort((x, y) => String(x.Title || '').localeCompare(String(y.Title || '')));
      const view = hits.slice(0, limit).map(toHit);
      return {
        content: JSON.stringify({ query, total: hits.length, returned: view.length, results: view }),
        summary: `searched catalog for "${query}" → ${hits.length} match${hits.length === 1 ? '' : 'es'}`,
      };
    },
  };
}

/** get_resource(id) — fetch one DC record in full (abstract, links, relationships). */
function getResourceTool(deps: ToolDeps): ToolDefinition {
  return {
    name: 'get_resource',
    description:
      'Fetch one catalog record in full by its id (the PK/UUID returned by search_catalog or ' +
      'find_agent). Returns title, dc_type, entity_kind, abstract, subjects, tags, external links, ' +
      'and relationship edges (creators, contributors, cast/performer uris, is_part_of/has_part). ' +
      'Use this to inspect a candidate before editing or linking to it.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The record id (PK/UUID).' } },
      required: ['id'],
    },
    mutating: false,
    handler: async (input, operator) => {
      if (!canRead(operator)) {
        return { content: 'Not permitted: the operator is not authorized to read the catalog.', isError: true };
      }
      const id = typeof input.id === 'string' ? input.id : '';
      if (!id) return { content: 'Provide a record id.', summary: 'missing id', isError: true };
      const row = await getResourceById(deps, id);
      if (!row) return { content: JSON.stringify({ id, found: false }), summary: `no record for id ${id}`, isError: true };
      const view = toFullView(row);
      return { content: JSON.stringify({ found: true, resource: view }), summary: `loaded "${view.title}" (${view.entity_kind ?? view.dc_type})` };
    },
  };
}

/** find_agent(name, limit?) — fuzzy-resolve an EXISTING person/band/collaboration agent. */
function findAgentTool(deps: ToolDeps): ToolDefinition {
  return {
    name: 'find_agent',
    description:
      'Find an existing agent (person, band, or collaboration) by name. Diacritics-insensitive, ' +
      'fuzzy (substring either direction). Use this BEFORE proposing to create a person/band so you ' +
      'reuse the existing agent instead of making a duplicate — e.g. resolve a movie\'s cast to ' +
      'catalog agents. Returns ranked candidates with id, title, entity_kind, roles, and link types. ' +
      'An empty result means no such agent exists yet.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The agent name to resolve (e.g. "Colin Firth"). Min 2 chars.' },
        limit: { type: 'integer', description: 'Max candidates to return (default 10).' },
      },
      required: ['name'],
    },
    mutating: false,
    handler: async (input, operator) => {
      if (!canRead(operator)) {
        return { content: 'Not permitted: the operator is not authorized to read the catalog.', isError: true };
      }
      const name = typeof input.name === 'string' ? input.name : '';
      const limit = typeof input.limit === 'number' && input.limit > 0 ? Math.min(input.limit, 25) : 10;
      const nq = norm(name);
      if (nq.length < 2) {
        return { content: 'Provide a name of at least 2 characters.', summary: 'name too short', isError: true };
      }
      const agents = (await scanAll(deps)).filter(isAgentRecord);
      const scored = agents
        .map((it) => {
          const nt = norm((it.Attributes?.dc_title as string) || it.Title || '');
          let score = 0;
          if (nt === nq) score = 3;
          else if (nt.includes(nq)) score = 2;
          else if (nq.includes(nt) && nt.length >= 2) score = 1;
          return { it, score };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score || String(a.it.Title || '').localeCompare(String(b.it.Title || '')));
      const view = scored.slice(0, limit).map((s) => {
        const a = s.it.Attributes || {};
        return {
          id: s.it.PK ?? s.it.id,
          title: a.dc_title ?? s.it.Title ?? '',
          entity_kind: a._entity_kind ?? null,
          roles: Array.isArray(a._roles) ? a._roles : [],
          link_types: Array.isArray(a._external_links) ? a._external_links.map((l: any) => l?.type).filter(Boolean) : [],
        };
      });
      return {
        content: JSON.stringify({ name, total: scored.length, returned: view.length, candidates: view }),
        summary: `find_agent "${name}" → ${scored.length} candidate${scored.length === 1 ? '' : 's'}`,
      };
    },
  };
}

/** Build the registry of all tools available this phase. */
export function buildRegistry(deps: ToolDeps): ToolRegistry {
  const registry = createToolRegistry();
  registry.register(searchCatalogTool(deps));
  registry.register(getResourceTool(deps));
  registry.register(findAgentTool(deps));
  // research_entity needs the Anthropic client (server-side web search); only
  // register it when one is wired (the handler always provides it in prod).
  if (deps.anthropic) registry.register(researchEntityTool(deps.anthropic, deps.model));
  registry.register(commitPlanTool(deps));
  for (const t of editTools(deps)) registry.register(t);
  return registry;
}
