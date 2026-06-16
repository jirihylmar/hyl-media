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
import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

import { createToolRegistry, type OperatorContext } from './assistant';
import { runAssistantTurn, type ApprovalSignal } from './loop';
import { buildRegistry } from './tools';
import { BUCKET } from './dc-emit';

const TABLE = process.env.METADATA_TABLE as string;
const REGION = process.env.AWS_REGION || 'eu-central-1';
const SECRET_ID = process.env.ANTHROPIC_SECRET_ID || 'hyl-media/anthropic-api-key';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
const SELF_FN = process.env.AWS_LAMBDA_FUNCTION_NAME as string;
const TURN_PREFIX = 'agent-turns/';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const sm = new SecretsManagerClient({ region: REGION });
const lambda = new LambdaClient({});

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

/** Run one full agent turn (the actual work — can take up to the Lambda timeout). */
async function runTurn(args: AgentChatEvent['arguments'], identity: AgentChatEvent['identity']) {
  const messages = parseJsonArg(args.messages);
  if (!Array.isArray(messages)) {
    throw new Error('agentChat: messages must be an array of Anthropic message params');
  }
  const operator = toOperatorContext(identity);

  // System blocks: stable instructions first (cached), then the volatile
  // surface context AFTER the cache breakpoint so it never invalidates the prefix.
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: SYSTEM_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
  ];
  if (args.surfaceContext && args.surfaceContext.trim()) {
    system.push({ type: 'text', text: `<surface_context>\n${args.surfaceContext}\n</surface_context>` });
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
    approval: parseApproval(args.approval),
    // The add-resource flow can read + research + resolve many cast agents
    // (one find_agent per name, parallel tool use disabled) before assembling
    // the plan, so allow more internal iterations than DH's conversational 8.
    maxIterations: 20,
  });
  return { ...result, model: MODEL };
}

/**
 * The async-execution envelope (Phase 21.8). A research-heavy turn runs ~90s,
 * far past AppSync's ~30s synchronous resolver limit. So agentChat does NOT run
 * the turn inline: it generates a turnId, fire-and-forget invokes THIS function
 * in worker mode (InvocationType: Event), and returns {status:'pending',turnId}
 * in <1s. The worker writes the result to s3://<bucket>/agent-turns/<turnId>.json;
 * the frontend polls getAgentTurn(turnId) until it is ready.
 */
const turnKey = (turnId: string) => `${TURN_PREFIX}${turnId}.json`;

async function writeTurn(turnId: string, body: Record<string, unknown>): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: turnKey(turnId), Body: JSON.stringify(body), ContentType: 'application/json',
  }));
}

// Opus 4.8 pricing ($/MTok): input 5, output 25, cache-read ~0.1×, cache-write 1.25×.
function costUsd(u: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }): number {
  return (u.inputTokens * 5 + u.outputTokens * 25 + u.cacheReadInputTokens * 0.5 + u.cacheCreationInputTokens * 6.25) / 1e6;
}

/** Worker mode: run the turn, log a per-run cost report, and persist the result. */
async function runWorker(event: WorkerEvent): Promise<void> {
  const operator = toOperatorContext(event.identity);
  const startedAt = Date.now();
  try {
    const turn = await runTurn(event.arguments, event.identity);
    // Per-run identity + token/cost report (Phase 21.10). Greppable JSON line.
    console.log(JSON.stringify({
      tag: 'agent-run', turnId: event.turnId, operator: operator.sub,
      status: turn.status, steps: turn.steps.length, model: turn.model,
      usage: turn.usage, cost_usd: Number(costUsd(turn.usage).toFixed(4)),
      ms: Date.now() - startedAt,
    }));
    await writeTurn(event.turnId, { status: 'done', turn });
  } catch (err: any) {
    console.log(JSON.stringify({ tag: 'agent-run', turnId: event.turnId, operator: operator.sub, status: 'error', error: err?.message || String(err), ms: Date.now() - startedAt }));
    await writeTurn(event.turnId, { status: 'error', error: err?.message || String(err) });
  }
}

/** Dispatcher: kick off the worker and return a turnId immediately. */
async function dispatch(event: AgentChatEvent): Promise<{ status: 'pending'; turnId: string }> {
  const turnId = randomUUID();
  const payload: WorkerEvent = { __worker: true, turnId, arguments: event.arguments, identity: event.identity };
  await lambda.send(new InvokeCommand({
    FunctionName: SELF_FN,
    InvocationType: 'Event', // async — returns immediately
    Payload: Buffer.from(JSON.stringify(payload)),
  }));
  return { status: 'pending', turnId };
}

/** Poll: read the stored turn result, or {status:'pending'} if not ready yet. */
async function pollTurn(turnId: string): Promise<Record<string, unknown>> {
  if (!turnId) return { status: 'error', error: 'turnId required' };
  try {
    const obj: any = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: turnKey(turnId) }));
    return JSON.parse(await obj.Body.transformToString());
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.Code === 'NoSuchKey') return { status: 'pending' };
    throw err;
  }
}

interface WorkerEvent {
  __worker: true;
  turnId: string;
  arguments: AgentChatEvent['arguments'];
  identity: AgentChatEvent['identity'];
}

/**
 * Entry point. Three modes:
 *   - worker (self async-invoke, __worker) → run the turn, persist result
 *   - getAgentTurn(turnId) AppSync query → poll the stored result
 *   - agentChat(...) AppSync mutation → dispatch + return {pending,turnId}
 */
export const handler = async (event: any): Promise<unknown> => {
  if (event?.__worker) {
    await runWorker(event as WorkerEvent);
    return {};
  }
  const field = event?.info?.fieldName;
  if (field === 'getAgentTurn' || (event?.arguments?.turnId && !event?.arguments?.messages)) {
    return pollTurn(event.arguments.turnId);
  }
  return dispatch(event as AgentChatEvent);
};
