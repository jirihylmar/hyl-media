/**
 * research_entity — the one genuinely new capability for hyl-media's agent
 * (Phase 21.3). DH derives metadata from uploaded transcripts; hyl-media
 * creates catalog entries from a NAME, so the agent must research the web.
 *
 * Two sub-agent calls inside the tool handler:
 *   1. Research: Claude with the Anthropic server-side web_search tool
 *      (`web_search_20260209`), driven through the server-side search loop
 *      (re-send on `pause_turn`) to gather authoritative facts.
 *   2. Extraction: a second, tool-less call constrained to a JSON schema
 *      (`output_config.format`, same shape enrich-dc.mjs uses) that distils the
 *      research prose into a structured record — OR flags disambiguation when
 *      the name maps to several distinct works/people and none was pinned.
 *
 * Non-mutating: the agent researches freely, then proposes a create plan (21.4).
 * The SDK (0.104.1) doesn't yet type the 2026 web_search tool version or
 * `output_config`, so those two params are passed through a localized cast; the
 * runtime shapes are the documented tool name and the enrich-dc output_config.
 */
import type Anthropic from '@anthropic-ai/sdk';

import { canRead, type ToolDefinition } from './assistant';

const DEFAULT_MODEL = 'claude-opus-4-8';

/** JSON-schema for the structured extraction (no nullable types — '' = unknown). */
const RESEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    needs_disambiguation: { type: 'boolean' },
    disambiguation: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string', description: 'Distinguishing label, e.g. "Easy Virtue (2008 film)".' },
          note: { type: 'string', description: 'One line: year, director/author, why it differs.' },
        },
        required: ['label', 'note'],
      },
    },
    entity: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', description: 'movie | recording | book | sheet_music | person | band | collaboration' },
        title: { type: 'string' },
        year: { type: 'string', description: 'Release/publication year, or "" if unknown.' },
        language: { type: 'string', description: 'Primary language (en, cs, …) or "".' },
        genre: { type: 'array', items: { type: 'string' } },
        creators: {
          type: 'array',
          description: 'Primary makers: director(s)/author(s)/lead performer(s).',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { name: { type: 'string' }, role: { type: 'string' } },
            required: ['name', 'role'],
          },
        },
        contributors: {
          type: 'array',
          description: 'Secondary: cast/actors, supporting performers.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { name: { type: 'string' }, role: { type: 'string' } },
            required: ['name', 'role'],
          },
        },
        links: {
          type: 'array',
          description: 'Authoritative URLs (wikipedia/imdb/musicbrainz/discogs/openlibrary/goodreads).',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { type: { type: 'string' }, url: { type: 'string' } },
            required: ['type', 'url'],
          },
        },
        summary: { type: 'string', description: '1-3 sentence factual abstract.' },
      },
      required: ['kind', 'title', 'year', 'language', 'genre', 'creators', 'contributors', 'links', 'summary'],
    },
  },
  required: ['needs_disambiguation', 'disambiguation', 'entity'],
} as const;

const textOf = (content: any[]): string =>
  (content || []).filter((b) => b?.type === 'text').map((b) => b.text).join('\n').trim();

/** Run the web-search research call through the server-side pause_turn loop. */
async function research(
  anthropic: Anthropic,
  model: string,
  kind: string,
  title: string,
  hint: string,
): Promise<string> {
  const system =
    'You are a meticulous research assistant for a media catalog. Use web search to find ' +
    'authoritative facts about the requested work or person. Prefer Wikipedia, IMDb, MusicBrainz, ' +
    'Discogs, Open Library, and Goodreads. If the name refers to MULTIPLE distinct works or people ' +
    '(e.g. a film and its remake in different years, or two people with the same name), enumerate ' +
    'each distinct candidate with its year and a distinguishing detail rather than guessing. When a ' +
    'specific one is indicated, report its full facts: year, language, genre, director/author/primary ' +
    'creators, principal cast/performers, and authoritative source URLs.';
  const ask =
    `Research this ${kind || 'entity'}: "${title}"${hint ? ` (${hint})` : ''}. ` +
    'Report concise factual findings and list any same-name alternatives you find.';

  const tools = [{ type: 'web_search_20260209', name: 'web_search' }];
  const messages: any[] = [{ role: 'user', content: ask }];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resp: any = await anthropic.messages.create({ model, max_tokens: 2000, system, tools, messages } as any);
  let guard = 0;
  while (resp.stop_reason === 'pause_turn' && guard++ < 5) {
    messages.push({ role: 'assistant', content: resp.content });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resp = await anthropic.messages.create({ model, max_tokens: 2000, system, tools, messages } as any);
  }
  return textOf(resp.content);
}

/** Distil research prose into the structured record (or a disambiguation list). */
async function extract(
  anthropic: Anthropic,
  model: string,
  kind: string,
  title: string,
  hint: string,
  prose: string,
): Promise<any> {
  const system =
    'Extract a single structured record from the research notes. Set needs_disambiguation=true and ' +
    'fill `disambiguation` ONLY when the notes describe multiple distinct same-name entities AND the ' +
    'request did not pin one (no year/disambiguator). Otherwise set needs_disambiguation=false and ' +
    'fill `entity` with the chosen one. Never invent facts not present in the notes; use "" / [] for ' +
    'anything the notes do not establish.';
  const user =
    `Request: kind=${kind || '(unspecified)'}, title="${title}"${hint ? `, disambiguator=${hint}` : ''}.\n\n` +
    `Research notes:\n${prose || '(no findings)'}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp: any = await anthropic.messages.create({
    model,
    max_tokens: 1500,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: RESEARCH_SCHEMA } },
    system,
    messages: [{ role: 'user', content: user }],
  } as any);
  return JSON.parse(textOf(resp.content) || '{}');
}

export function researchEntityTool(anthropic: Anthropic, model = DEFAULT_MODEL): ToolDefinition {
  return {
    name: 'research_entity',
    description:
      'Research a work or person on the web (Anthropic web search) and return structured facts for ' +
      'cataloguing: kind, title, year, language, genre, creators (director/author), contributors ' +
      '(cast/performers), authoritative links, and a summary. If the name maps to several distinct ' +
      'works/people and you did not pass a `year`/`disambiguator`, it returns ' +
      '`needs_disambiguation:true` with the candidates — ask the operator which one before creating. ' +
      'Use this for anything not already in the catalog before proposing to create it.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Name of the work or person to research.' },
        kind: { type: 'string', description: 'movie | recording | book | sheet_music | person | band | collaboration (best guess).' },
        year: { type: 'string', description: 'Optional year to disambiguate (e.g. "2008").' },
        disambiguator: { type: 'string', description: 'Optional free-text to pin the right one (e.g. "Stephan Elliott remake").' },
      },
      required: ['title'],
    },
    mutating: false,
    handler: async (input, operator) => {
      if (!canRead(operator)) {
        return { content: 'Not permitted: the operator is not authorized.', isError: true };
      }
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      const kind = typeof input.kind === 'string' ? input.kind.trim() : '';
      const year = typeof input.year === 'string' ? input.year.trim() : '';
      const disambiguator = typeof input.disambiguator === 'string' ? input.disambiguator.trim() : '';
      if (title.length < 2) {
        return { content: 'Provide a title of at least 2 characters.', summary: 'title too short', isError: true };
      }
      const hint = [year, disambiguator].filter(Boolean).join('; ');
      try {
        const prose = await research(anthropic, model, kind, title, hint);
        const data = await extract(anthropic, model, kind, title, hint, prose);
        const summary = data.needs_disambiguation
          ? `research "${title}" → ${(data.disambiguation || []).length} candidates (disambiguate)`
          : `researched "${title}"${data.entity?.year ? ` (${data.entity.year})` : ''} → ${(data.entity?.creators || []).length} creators, ${(data.entity?.contributors || []).length} contributors, ${(data.entity?.links || []).length} links`;
        return { content: JSON.stringify(data), summary };
      } catch (err: any) {
        return { content: `research_entity failed: ${err?.message || String(err)}`, summary: 'research error', isError: true };
      }
    },
  };
}
