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
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

import { canRead, createToolRegistry, type ToolDefinition, type ToolRegistry } from './assistant';

export interface ToolDeps {
  ddb: DynamoDBDocumentClient;
  /** hyl-media-metadata-repository */
  table: string;
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

/** Build the registry of all tools available this phase. */
export function buildRegistry(deps: ToolDeps): ToolRegistry {
  const registry = createToolRegistry();
  registry.register(searchCatalogTool(deps));
  return registry;
}
