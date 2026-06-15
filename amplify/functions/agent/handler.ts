/**
 * agentChat(messages, surfaceContext?, approval?) — Phase 21.1.
 *
 * The hyl-media operator agent. Stateless multi-turn: the frontend owns the
 * conversation and sends the full `messages` history every call; the Lambda
 * runs the Anthropic Messages API in a tool-use loop (see loop.ts) with prompt
 * caching on the system prompt + tool definitions, and returns a per-turn
 * step-log.
 *
 * Two robustness pillars (mirrors the Digital Horizon assistant):
 *   1. Tools run under the OPERATOR's Cognito identity — event.identity
 *      (sub + groups) is threaded into every tool handler as OperatorContext.
 *   2. propose → approve → execute for ALL writes — non-mutating tools run
 *      inline; the FIRST mutating tool stops the loop and returns
 *      `awaiting_approval` WITHOUT executing. The approval round-trip
 *      (Phase 21.4) resumes after an explicit operator click.
 *
 * The Anthropic key comes ONLY from Secrets Manager (`hyl-media/anthropic-api-key`,
 * JSON `{ "ANTHROPIC_API_KEY": "..." }`) fetched at runtime and cached in module
 * scope — never an Amplify build-time secret, never logged. (Phase 21 guardrail.)
 *
 * 21.1 registers one read tool (`search_catalog`) to prove the loop end-to-end.
 */
import Anthropic from '@anthropic-ai/sdk';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

import { createToolRegistry, type OperatorContext } from './assistant';
import { runAssistantTurn, type ApprovalSignal, type AssistantTurnResult } from './loop';
import { buildRegistry } from './tools';

const TABLE = process.env.METADATA_TABLE as string;
const REGION = process.env.AWS_REGION || 'eu-central-1';
const SECRET_ID = process.env.ANTHROPIC_SECRET_ID || 'hyl-media/anthropic-api-key';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const sm = new SecretsManagerClient({ region: REGION });

// Cache the key + client across warm invocations; never log either.
let anthropicClient: Anthropic | null = null;
async function getAnthropic(): Promise<Anthropic> {
  if (anthropicClient) return anthropicClient;
  const r = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
  const v = JSON.parse(r.SecretString || '{}');
  if (!v.ANTHROPIC_API_KEY) throw new Error('secret missing ANTHROPIC_API_KEY');
  anthropicClient = new Anthropic({ apiKey: v.ANTHROPIC_API_KEY });
  return anthropicClient;
}

const SYSTEM_INSTRUCTIONS = `You are the operator agent for hyl-media — a personal media catalog of movies, recordings, books, sheet music, and the people/bands behind them. The catalog is stored as conformant Dublin Core records.

How you work:
- You are conversational and multi-turn. Ask a brief clarifying question only when the request is genuinely ambiguous; otherwise act.
- You have tools. Read tools (search_catalog, get_resource, find_agent) and research (research_entity) you may call freely to ground yourself.
- Any tool that CHANGES the catalog is gated: when you call it, the platform pauses and shows the operator your proposed plan for one explicit approval before anything runs. So just call the tool you intend — do not ask for permission in prose first; the approval step is automatic.
- Every tool runs under the operator's own permissions. If a tool reports it is not permitted, relay that plainly.

Workflow to add a resource (e.g. "add movie Easy Virtue"):
1. search_catalog to check it is not already present.
2. research_entity to gather facts. If it returns needs_disambiguation, ASK the operator which one (e.g. 2008 vs 1928) before proceeding — do not guess.
3. For every person/band the resource involves (director, cast, performers, author), call find_agent to see if it already exists; record the id when it does.
4. Assemble ONE commit_plan with the resource and every agent (existing_id set for reuse, empty to create), then call commit_plan exactly once. Do NOT make separate write calls — commit_plan commits the whole batch on a single approval.

Style:
- Default to brevity. Don't narrate routine steps. When you finish, one or two sentences on the outcome.
- Never invent catalog ids, titles, dates, cast, or links that aren't in the conversation, the tool results, or the provided context.`;

interface AgentChatEvent {
  arguments: {
    /** Full Anthropic message history (a.json()): MessageParam[]. */
    messages: unknown;
    /** Optional freeform grounding the frontend assembles for the surface. */
    surfaceContext?: string | null;
    /**
     * Operator's decision on a previously-proposed mutating tool (a.json()):
     * { toolUseId: string, decision: 'approve' | 'decline' }. Absent on a
     * normal conversational turn.
     */
    approval?: unknown;
  };
  identity?: {
    sub?: string;
    username?: string;
    groups?: string[] | null;
    claims?: { sub?: string; 'cognito:groups'?: string[] | string | null } | null;
  } | null;
}

/** Build OperatorContext from the AppSync Cognito identity. */
function toOperatorContext(identity: AgentChatEvent['identity']): OperatorContext {
  const sub = identity?.sub ?? identity?.claims?.sub ?? identity?.username ?? 'unknown';
  let groups: string[] = [];
  if (Array.isArray(identity?.groups)) {
    groups = identity!.groups as string[];
  } else {
    const claim = identity?.claims?.['cognito:groups'];
    if (Array.isArray(claim)) groups = claim;
    else if (typeof claim === 'string' && claim.length > 0) {
      groups = claim.split(',').map((g) => g.trim()).filter(Boolean);
    }
  }
  return { sub, groups };
}

/** AppSync delivers a.json() args as a parsed value OR a JSON string — normalize. */
function parseJsonArg(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  return raw;
}

/** Validate + narrow the optional approval arg; undefined for a normal turn. */
function parseApproval(raw: unknown): ApprovalSignal | undefined {
  const a = parseJsonArg(raw) as { toolUseId?: unknown; decision?: unknown } | null | undefined;
  if (!a || typeof a !== 'object') return undefined;
  if (typeof a.toolUseId !== 'string' || !a.toolUseId) return undefined;
  if (a.decision !== 'approve' && a.decision !== 'decline') return undefined;
  return { toolUseId: a.toolUseId, decision: a.decision };
}

export const handler = async (
  event: AgentChatEvent,
): Promise<AssistantTurnResult & { model: string }> => {
  const { surfaceContext } = event.arguments;
  const messages = parseJsonArg(event.arguments.messages);
  if (!Array.isArray(messages)) {
    throw new Error('agentChat: messages must be an array of Anthropic message params');
  }

  const operator = toOperatorContext(event.identity);

  // System blocks: stable instructions first (cached), then the volatile
  // surface context AFTER the cache breakpoint so it never invalidates the prefix.
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: SYSTEM_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
  ];
  if (surfaceContext && surfaceContext.trim()) {
    system.push({ type: 'text', text: `<surface_context>\n${surfaceContext}\n</surface_context>` });
  }

  const anthropic = await getAnthropic();
  const registry = TABLE ? buildRegistry({ ddb, table: TABLE, anthropic, model: MODEL, s3 }) : createToolRegistry();

  const result = await runAssistantTurn({
    client: anthropic,
    model: MODEL,
    system,
    registry,
    messages: messages as Anthropic.MessageParam[],
    operator,
    approval: parseApproval(event.arguments.approval),
    // The add-resource flow can read + research + resolve many cast agents
    // (one find_agent per name, parallel tool use disabled) before assembling
    // the plan, so allow more internal iterations than DH's conversational 8.
    maxIterations: 20,
  });

  return { ...result, model: MODEL };
};
