/**
 * Headless client for the operator agent (Phase 21.8).
 *
 * Adapts the Digital Horizon assistantChatClient to hyl-media's agentChat
 * mutation: stateless multi-turn (the frontend owns the history and sends the
 * full transcript each turn), a per-turn step-log, and a single propose→approve
 * gate. The AppSync call + history reduction are pure-ish functions so the React
 * panel stays thin glue.
 */
import { getClient } from './client';

/** Loose Anthropic message-param shape (frontend stores it opaquely). */
export type Msg = { role: string; content: unknown };

export interface ProposedTool {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AssistantStep {
  type: 'tool' | 'plan';
  tool: string;
  summary: string;
  isError?: boolean;
}

export interface AgentTurn {
  status: 'completed' | 'awaiting_approval';
  newMessages: Msg[];
  assistantText: string;
  steps: AssistantStep[];
  proposedTool?: ProposedTool;
}

export interface CallAgentInput {
  messages: Msg[];
  surfaceContext?: string;
  approval?: { toolUseId: string; decision: 'approve' | 'decline' };
}

const parseJson = (data: unknown): any =>
  data == null ? null : typeof data === 'string' ? JSON.parse(data) : data;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run one agent turn. A research-heavy turn exceeds AppSync's ~30s synchronous
 * limit, so agentChat is ASYNC: it returns {status:'pending', turnId} fast and
 * the worker persists the result. We then poll getAgentTurn(turnId) until ready.
 * messages/approval go as JSON strings (AWSJSON rejects a top-level array).
 */
export async function callAgent(
  input: CallAgentInput,
  { pollMs = 2000, timeoutMs = 280000 }: { pollMs?: number; timeoutMs?: number } = {},
): Promise<AgentTurn> {
  const res = await getClient().mutations.agentChat({
    messages: JSON.stringify(input.messages),
    surfaceContext: input.surfaceContext,
    approval: input.approval !== undefined ? JSON.stringify(input.approval) : undefined,
  });
  if (res.errors?.length) throw new Error(res.errors[0].message);
  const dispatch = parseJson(res.data);
  if (!dispatch?.turnId) throw new Error('agentChat did not return a turnId');

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await sleep(pollMs);
    const r = await getClient().queries.getAgentTurn({ turnId: dispatch.turnId });
    if (r.errors?.length) throw new Error(r.errors[0].message);
    const poll = parseJson(r.data);
    if (poll?.status === 'done') return normalizeTurn(poll.turn);
    if (poll?.status === 'error') throw new Error(poll.error || 'agent turn failed');
    if (Date.now() > deadline) throw new Error('agent turn timed out');
  }
}

function normalizeTurn(turn: Partial<AgentTurn> | null): AgentTurn {
  return {
    status: turn?.status ?? 'completed',
    newMessages: turn?.newMessages ?? [],
    assistantText: turn?.assistantText ?? '',
    steps: turn?.steps ?? [],
    proposedTool: turn?.proposedTool,
  };
}

/** Append the server-produced newMessages to the client history. */
export function appendHistory(history: Msg[], turn: AgentTurn): Msg[] {
  return [...history, ...turn.newMessages];
}

/** Answer a pending tool_use locally with a tool_result (keeps history valid). */
export function appendToolResult(history: Msg[], toolUseId: string, content: string): Msg[] {
  return [...history, { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content }] }];
}

/**
 * Append the operator's next user message. If a proposal is still pending and
 * the operator typed instead of approving/declining, first answer that tool_use
 * with a "not acted" tool_result — Anthropic requires every tool_use to be
 * immediately followed by its tool_result, or the API 400s.
 */
export function appendUserMessage(history: Msg[], text: string, pendingToolUseId?: string | null): Msg[] {
  const base = pendingToolUseId
    ? appendToolResult(
        history,
        pendingToolUseId,
        'The operator did not act on the proposed plan and sent a new message instead. Treat it as not performed.',
      )
    : history;
  return [...base, { role: 'user', content: text }];
}

/** The proposed tool awaiting approval, or null when the turn completed. */
export function pendingFromTurn(turn: AgentTurn): ProposedTool | null {
  return turn.status === 'awaiting_approval' ? turn.proposedTool ?? null : null;
}

/** Human label for a proposed action. */
export function describeProposed(p: ProposedTool): string {
  const label: Record<string, string> = {
    commit_plan: 'Create this resource and its agents/links',
    update_metadata: 'Update + pin these fields',
    regenerate: 'Regenerate metadata',
    approve: 'Approve this record',
  };
  return label[p.name] ?? p.name;
}
