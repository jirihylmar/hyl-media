/**
 * The agentic loop for the hyl-media operator agent (Phase 21.1).
 *
 * Stateless multi-turn: the frontend owns the conversation history and sends
 * the full `messages` array every call. This runs one "assistant turn" — it
 * may make several Anthropic Messages API calls internally, executing
 * non-mutating tools and feeding their results back, until either:
 *
 *   - the model stops calling tools (`stop_reason !== 'tool_use'`)  → completed
 *   - the model calls a MUTATING tool                              → STOP, propose
 *
 * Pillar #2 (propose → approve → execute): a mutating tool is NEVER executed
 * here. The loop returns `status:'awaiting_approval'` with the proposed tool,
 * leaving the assistant turn (containing the unanswered tool_use) at the tail
 * of `newMessages`. The approval round-trip (Phase 21.4) re-enters with that
 * history plus an approve/decline signal and executes it.
 *
 * `disable_parallel_tool_use` is set so each assistant turn contains AT MOST
 * one tool_use block — one pending tool_result, unambiguous approval.
 *
 * Ported from Digital Horizon's `_shared/assistant/loop.ts`, plus a per-turn
 * `steps` step-log (Phase 21.1 decision: "step log per turn now; live
 * streaming a later enhancement"). The Anthropic client is injected via a
 * minimal interface so the loop unit-tests with a mock — no network.
 */
import type Anthropic from '@anthropic-ai/sdk';

import type { OperatorContext, ToolResult, ToolRegistry } from './assistant';

/** Minimal slice of the Anthropic client the loop needs (mockable in tests). */
export interface MessagesCreateClient {
  messages: {
    create(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

export interface ProposedTool {
  /** The `tool_use` block id — the approval must answer THIS id. */
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Operator decision on a proposed mutating tool (Phase 21.4). The frontend
 * sends this alongside the history (which still carries the unanswered
 * `tool_use`); the Lambda — never the frontend — executes or declines.
 */
export interface ApprovalSignal {
  /** The `proposedTool.id` the operator is responding to. */
  toolUseId: string;
  decision: 'approve' | 'decline';
}

export interface AssistantUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

/**
 * One line in the operator-facing step log. `tool` steps record an executed
 * read tool; `plan` records a proposed mutating action awaiting approval.
 */
export interface AssistantStep {
  type: 'tool' | 'plan';
  tool: string;
  summary: string;
  isError?: boolean;
}

export interface AssistantTurnResult {
  status: 'completed' | 'awaiting_approval';
  /** Everything produced server-side this invocation, in order, for the frontend to append. */
  newMessages: Anthropic.MessageParam[];
  /** Set only when status === 'awaiting_approval'. */
  proposedTool?: ProposedTool;
  /** Concatenated text from the final assistant turn (convenience for the UI). */
  assistantText: string;
  /** Ordered step log for this turn. */
  steps: AssistantStep[];
  /** The Anthropic stop_reason of the final API call (for diagnostics). */
  stopReason: string | null;
  usage: AssistantUsage;
}

export interface RunAssistantTurnParams {
  client: MessagesCreateClient;
  model: string;
  /** System blocks (cache_control already applied by the caller). */
  system: Anthropic.TextBlockParam[];
  registry: ToolRegistry;
  /** Full conversation history from the frontend. Not mutated. */
  messages: Anthropic.MessageParam[];
  operator: OperatorContext;
  /**
   * When present, the operator has responded to a previously-proposed mutating
   * tool. The tool named by the pending `tool_use` (found in `messages`) is
   * executed under the operator's identity (approve) or skipped (decline), and
   * its `tool_result` is fed back. Idempotent: if a `tool_result` for
   * `toolUseId` already exists, nothing runs.
   */
  approval?: ApprovalSignal | null;
  /** Output cap per API call. Default 4096. */
  maxTokens?: number;
  /** Safety bound on internal tool-execution iterations. Default 8. */
  maxIterations?: number;
}

const TEXT = (blocks: Anthropic.ContentBlock[]): string =>
  blocks
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

const emptyUsage = (): AssistantUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
});

function addUsage(acc: AssistantUsage, u: Anthropic.Usage): void {
  acc.inputTokens += u.input_tokens ?? 0;
  acc.outputTokens += u.output_tokens ?? 0;
  acc.cacheReadInputTokens += u.cache_read_input_tokens ?? 0;
  acc.cacheCreationInputTokens += u.cache_creation_input_tokens ?? 0;
}

/** A short summary for the step log: the tool's own summary, or a truncation. */
function stepSummary(result: ToolResult): string {
  if (result.summary && result.summary.trim()) return result.summary.trim();
  const c = (result.content || '').replace(/\s+/g, ' ').trim();
  return c.length > 140 ? `${c.slice(0, 137)}…` : c;
}

/** All `tool_use_id`s already answered by a `tool_result` anywhere in history. */
function answeredToolUseIds(messages: Anthropic.MessageParam[]): Set<string> {
  const ids = new Set<string>();
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const block of m.content) {
      if (typeof block === 'object' && block !== null && (block as { type?: string }).type === 'tool_result') {
        const id = (block as { tool_use_id?: string }).tool_use_id;
        if (id) ids.add(id);
      }
    }
  }
  return ids;
}

/** Find an assistant `tool_use` block by id (the proposed action to approve). */
function findToolUseBlock(
  messages: Anthropic.MessageParam[],
  toolUseId: string,
): Anthropic.ToolUseBlock | undefined {
  for (const m of messages) {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    for (const block of m.content) {
      if (
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: string }).type === 'tool_use' &&
        (block as { id?: string }).id === toolUseId
      ) {
        return block as Anthropic.ToolUseBlock;
      }
    }
  }
  return undefined;
}

/**
 * Build the Anthropic `tools` array from the registry, applying a single
 * cache_control breakpoint on the LAST tool definition. Tools render before
 * system, so this caches the (stable) tool list as a prefix.
 */
export function toCachedToolParams(registry: ToolRegistry): Anthropic.ToolUnion[] {
  const defs = registry.toAnthropicToolDefs();
  return defs.map((d, i) => {
    const tool: Anthropic.Tool = {
      name: d.name,
      description: d.description,
      input_schema: d.input_schema as Anthropic.Tool.InputSchema,
    };
    if (i === defs.length - 1) {
      tool.cache_control = { type: 'ephemeral' };
    }
    return tool;
  });
}

export async function runAssistantTurn(
  params: RunAssistantTurnParams,
): Promise<AssistantTurnResult> {
  const {
    client,
    model,
    system,
    registry,
    operator,
    maxTokens = 4096,
    maxIterations = 8,
  } = params;

  const { approval } = params;
  const tools = toCachedToolParams(registry);
  const working: Anthropic.MessageParam[] = [...params.messages];
  const newMessages: Anthropic.MessageParam[] = [];
  const steps: AssistantStep[] = [];
  const usage = emptyUsage();
  let stopReason: string | null = null;

  const pushToolStep = (name: string, result: ToolResult): void => {
    steps.push({ type: 'tool', tool: name, summary: stepSummary(result), isError: result.isError });
  };

  // Phase 21.4 — propose → approve → execute. If the operator answered a
  // proposed mutating tool, resolve it BEFORE the normal loop. The tool's
  // name+input come from the proposal in the (signed) assistant history, never
  // from the frontend, so an approved action can't be widened beyond proposed.
  if (approval) {
    const alreadyAnswered = answeredToolUseIds(working).has(approval.toolUseId);
    const pending = findToolUseBlock(working, approval.toolUseId);
    if (pending && !alreadyAnswered) {
      let result: ToolResult;
      if (approval.decision === 'decline') {
        result = { content: 'The operator declined this action. It was not executed.' };
        steps.push({ type: 'plan', tool: pending.name, summary: 'declined by operator' });
      } else {
        const def = registry.lookup(pending.name);
        const input = (pending.input ?? {}) as Record<string, unknown>;
        result = def
          ? await def.handler(input, operator)
          : { content: `Unknown tool: ${pending.name}`, isError: true };
        pushToolStep(pending.name, result);
      }
      const resultTurn: Anthropic.MessageParam = {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: approval.toolUseId,
            is_error: result.isError ?? false,
            content: result.content,
          },
        ],
      };
      working.push(resultTurn);
      newMessages.push(resultTurn);
    }
    // If already answered (double-approve) or pending not found (stale), fall
    // through and let the model continue from the current history.
  }

  for (let i = 0; i < maxIterations; i++) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      tools,
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      messages: working,
    });
    addUsage(usage, response.usage);
    stopReason = response.stop_reason;

    const assistantTurn: Anthropic.MessageParam = {
      role: 'assistant',
      content: response.content,
    };
    working.push(assistantTurn);
    newMessages.push(assistantTurn);

    if (response.stop_reason !== 'tool_use') {
      return { status: 'completed', newMessages, assistantText: TEXT(response.content), steps, stopReason, usage };
    }

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!toolUse) {
      return { status: 'completed', newMessages, assistantText: TEXT(response.content), steps, stopReason, usage };
    }

    const def = registry.lookup(toolUse.name);
    const input = (toolUse.input ?? {}) as Record<string, unknown>;

    if (!def) {
      const errorResult: Anthropic.MessageParam = {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: `Unknown tool: ${toolUse.name}` }],
      };
      working.push(errorResult);
      newMessages.push(errorResult);
      steps.push({ type: 'tool', tool: toolUse.name, summary: `unknown tool`, isError: true });
      continue;
    }

    if (def.mutating) {
      // PILLAR #2: stop before executing. The assistant turn (with the
      // unanswered tool_use) is already in newMessages; approval resumes here.
      steps.push({ type: 'plan', tool: toolUse.name, summary: 'proposed — awaiting operator approval' });
      return {
        status: 'awaiting_approval',
        newMessages,
        proposedTool: { id: toolUse.id, name: toolUse.name, input },
        assistantText: TEXT(response.content),
        steps,
        stopReason,
        usage,
      };
    }

    // Non-mutating: execute under the operator's identity and feed back.
    const result = await def.handler(input, operator);
    pushToolStep(toolUse.name, result);
    const resultTurn: Anthropic.MessageParam = {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: toolUse.id, is_error: result.isError ?? false, content: result.content },
      ],
    };
    working.push(resultTurn);
    newMessages.push(resultTurn);
  }

  // Hit the iteration bound — return what we have rather than looping forever.
  const lastAssistant = [...newMessages].reverse().find((m) => m.role === 'assistant');
  const lastText =
    lastAssistant && Array.isArray(lastAssistant.content)
      ? TEXT(lastAssistant.content as Anthropic.ContentBlock[])
      : '';
  return { status: 'completed', newMessages, assistantText: lastText, steps, stopReason, usage };
}
