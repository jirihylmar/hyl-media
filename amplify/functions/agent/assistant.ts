/**
 * Core contract for the hyl-media operator agent (Phase 21.1).
 *
 * Pure, runtime-dependency-free types + a tool registry + the operator
 * authorization gate. Ported from the Digital Horizon assistant
 * (`_shared/assistant/{types,registry,auth}.ts`), trimmed to hyl-media's
 * single-tier auth model: the catalog is gated purely on Cognito
 * authentication (`allow.authenticated()` on every data operation), so any
 * authenticated operator may read and write. `groups` is still threaded for
 * the Phase 21.10 guardrails, but is not consulted yet.
 *
 * Imports NOTHING from the AWS or Anthropic SDKs so the loop unit-tests in
 * isolation. Two robustness pillars are encoded as types:
 *   1. Operator identity — every tool handler receives an OperatorContext
 *      (Cognito sub + groups), threaded from event.identity.
 *   2. Propose → approve → execute — every tool declares `mutating`. The loop
 *      runs non-mutating tools inline but STOPS on the first mutating tool,
 *      returning the proposed plan for one operator approval (Phase 21.4).
 */

/** Who the operator is: Cognito `sub` + group memberships (possibly empty). */
export interface OperatorContext {
  sub: string;
  groups: string[];
}

/** A JSON Schema object describing a tool's input (passed verbatim to the API). */
export type ToolInputSchema = Record<string, unknown>;

/**
 * Result returned by a tool handler. `content` is fed back to Claude as the
 * tool_result; `summary` is a short human line for the operator step-log
 * (falls back to a truncation of `content`); `isError` marks a handler-level
 * failure (auth denied, not-found, downstream error) without throwing.
 */
export interface ToolResult {
  content: string;
  summary?: string;
  isError?: boolean;
}

export type ToolHandler = (
  input: Record<string, unknown>,
  operator: OperatorContext,
) => Promise<ToolResult>;

/**
 * A registered tool. `mutating` is the propose→approve→execute pivot:
 * `false` runs inline in the loop, `true` stops the loop for operator approval
 * before the handler is ever called.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  mutating: boolean;
  handler: ToolHandler;
}

/** The shape the Anthropic Messages API expects per `tools` entry. */
export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
}

export interface ToolRegistry {
  /** Add a tool. Throws if `def.name` is already registered. */
  register(def: ToolDefinition): void;
  /** Resolve a tool by the name Claude emitted, or `undefined`. */
  lookup(name: string): ToolDefinition | undefined;
  /** All registered defs (insertion order), handlers included. */
  list(): ToolDefinition[];
  /** The Messages API `tools` array (no handler/mutating leaked to Claude). */
  toAnthropicToolDefs(): AnthropicToolDef[];
}

/** Build a fresh, empty registry (independent per call — tests never bleed). */
export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolDefinition>();
  return {
    register(def) {
      if (tools.has(def.name)) throw new Error(`Tool already registered: ${def.name}`);
      tools.set(def.name, def);
    },
    lookup(name) {
      return tools.get(name);
    },
    list() {
      return [...tools.values()];
    },
    toAnthropicToolDefs() {
      return [...tools.values()].map((def) => ({
        name: def.name,
        description: def.description,
        input_schema: def.inputSchema,
      }));
    },
  };
}

/** True when the request carries a resolved Cognito identity. */
export function isAuthenticated(operator: OperatorContext): boolean {
  return !!operator.sub && operator.sub !== 'unknown';
}

/**
 * hyl-media gates the catalog on authentication only (`allow.authenticated()`),
 * so reads and writes share one gate. Group-based tiering is reserved for a
 * later phase; until then these mirror the AppSync rule exactly.
 */
export const canRead = isAuthenticated;
export const canWrite = isAuthenticated;
