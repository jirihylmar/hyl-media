/**
 * Phase 21.1 verification: round-trip an agent turn and prove the one read
 * tool (search_catalog) works against the LIVE hyl-media-metadata-repository.
 *
 * Drives the REAL runAssistantTurn loop (amplify/functions/agent/loop.ts) with
 * a mock Anthropic client so no API key/network is needed — the mock plays the
 * part of Claude: turn 1 emits a tool_use(search_catalog), turn 2 (after the
 * tool_result is fed back) emits a final text answer. This exercises the loop,
 * the registry, real DDB tool execution, the result feed-back, and the step log.
 *
 * Run: AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 npx tsx scripts/verify-agent-loop.mts
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { runAssistantTurn, type MessagesCreateClient } from '../amplify/functions/agent/loop.ts';
import { buildRegistry } from '../amplify/functions/agent/tools.ts';
import type { OperatorContext } from '../amplify/functions/agent/assistant.ts';

const TABLE = 'hyl-media-metadata-repository';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-central-1' }));
const registry = buildRegistry({ ddb, table: TABLE });
const operator: OperatorContext = { sub: 'verify-operator', groups: [] };

let lastToolResult = '';

// Mock Claude: first call → tool_use(search_catalog "Easy Virtue"); after the
// tool_result comes back → a final text turn. Mirrors the real Messages shape.
const mockClient: MessagesCreateClient = {
  messages: {
    async create(body) {
      const sawToolResult = body.messages.some(
        (m) => Array.isArray(m.content) && m.content.some((b: any) => b?.type === 'tool_result'),
      );
      if (!sawToolResult) {
        return {
          id: 'msg_1', type: 'message', role: 'assistant', model: 'mock', stop_reason: 'tool_use', stop_sequence: null,
          content: [
            { type: 'text', text: 'Let me check the catalog.' },
            { type: 'tool_use', id: 'toolu_1', name: 'search_catalog', input: { query: 'Easy Virtue' } },
          ],
          usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        } as any;
      }
      const tr = body.messages.flatMap((m: any) => (Array.isArray(m.content) ? m.content : []))
        .find((b: any) => b?.type === 'tool_result');
      lastToolResult = tr?.content ?? '';
      return {
        id: 'msg_2', type: 'message', role: 'assistant', model: 'mock', stop_reason: 'end_turn', stop_sequence: null,
        content: [{ type: 'text', text: 'Done — I searched the catalog.' }],
        usage: { input_tokens: 20, output_tokens: 8, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 },
      } as any;
    },
  },
};

const result = await runAssistantTurn({
  client: mockClient,
  model: 'mock',
  system: [{ type: 'text', text: 'system' }],
  registry,
  messages: [{ role: 'user', content: 'Is Easy Virtue in the catalog?' }],
  operator,
});

const parsed = lastToolResult ? JSON.parse(lastToolResult) : null;
const toolStep = result.steps.find((s) => s.tool === 'search_catalog');

console.log('status        :', result.status);
console.log('assistantText :', result.assistantText);
console.log('steps         :', JSON.stringify(result.steps));
console.log('usage         :', JSON.stringify(result.usage));
console.log('search hits   :', parsed ? `${parsed.total} total, ${parsed.returned} returned` : '(none)');
console.log('first results :', parsed ? JSON.stringify(parsed.results.slice(0, 3)) : '(none)');

const ok =
  result.status === 'completed' &&
  result.assistantText.length > 0 &&
  !!toolStep && !toolStep.isError &&
  parsed && typeof parsed.total === 'number' && Array.isArray(parsed.results) &&
  // usage aggregated across both mock turns
  result.usage.inputTokens === 30 && result.usage.outputTokens === 13 && result.usage.cacheReadInputTokens === 5;

console.log(ok ? '\n✓ PASS — loop round-tripped a turn; search_catalog executed against live DDB' : '\n✗ FAIL');
process.exit(ok ? 0 : 1);
