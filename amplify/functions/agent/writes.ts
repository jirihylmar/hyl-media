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
 * 21.4 lands the plan schema + the proposal/approval protocol. The executor is
 * filled in incrementally:
 *   21.5 create_resource — conformant emit → S3 sidecar + DDB
 *   21.6 find_or_create_agent + link_relationship — agents/ + dc_type=Agent
 *   21.7 enrich + set_external_links + reconcile (sync-dc-to-s3) + audit
 * Until those land, the executor validates the plan and reports what it WOULD
 * do (executed:false) rather than silently claiming success.
 */
import type { ToolDeps } from './tools';
import { canWrite, type ToolDefinition } from './assistant';

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

export function commitPlanTool(_deps: ToolDeps): ToolDefinition {
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
      // Executor lands in 21.5–21.7. Until then, do not claim success.
      return {
        content: JSON.stringify({
          executed: false,
          note: 'Plan validated and approved; the batch executor (create/link/enrich/reconcile) is implemented in Phase 21.5–21.7.',
          plan: describePlan(plan),
        }),
        summary: `approved (executor pending): ${describePlan(plan)}`,
      };
    },
  };
}
