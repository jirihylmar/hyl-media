/**
 * AssistPanel — the operator agent on the right (Phase 21.8).
 *
 * A collapsible, global right-side chat panel. The operator types an intent
 * ("add movie Easy Virtue"); the agent researches, proposes a plan, and on a
 * single Approve executes the batch (create + link + enrich + reconcile). The
 * conversation history is held CLIENT-SIDE (the backend is stateless) and the
 * full transcript is sent each turn. A per-turn step-log shows progress.
 */
import { useRef, useState } from 'react';
import {
  appendHistory,
  appendUserMessage,
  callAgent,
  describeProposed,
  pendingFromTurn,
  type AssistantStep,
  type Msg,
  type ProposedTool,
} from '../lib/agentClient';

interface DisplayEntry {
  role: 'user' | 'assistant';
  text: string;
  steps?: AssistantStep[];
}

/** Render the proposed commit_plan input as a readable plan; JSON fallback otherwise. */
function PlanPreview({ tool }: { tool: ProposedTool }) {
  if (tool.name !== 'commit_plan') {
    return <pre className="assist-preview">{JSON.stringify(tool.input, null, 2)}</pre>;
  }
  const r = (tool.input.resource ?? {}) as Record<string, any>;
  const agents = (Array.isArray(tool.input.agents) ? tool.input.agents : []) as Record<string, any>[];
  const links = (Array.isArray(r.external_links) ? r.external_links : []) as Record<string, any>[];
  return (
    <div className="assist-plan">
      <div className="assist-plan-row">
        <span className="assist-plan-kind">{r.kind}</span>
        <strong>{r.title}</strong>
        {r.year ? <span className="assist-plan-dim"> ({r.year})</span> : null}
      </div>
      {r.abstract ? <div className="assist-plan-abstract">{r.abstract}</div> : null}
      {agents.length > 0 && (
        <ul className="assist-plan-agents">
          {agents.map((a, i) => (
            <li key={i}>
              {a.name} <span className="assist-plan-dim">— {a.role}</span>{' '}
              <span className={a.existing_id ? 'assist-tag-reuse' : 'assist-tag-new'}>
                {a.existing_id ? 'reuse' : 'NEW'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {links.length > 0 && (
        <div className="assist-plan-links">links: {links.map((l) => l.type).join(', ')}</div>
      )}
    </div>
  );
}

export function AssistPanel() {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState<DisplayEntry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ProposedTool | null>(null);
  const historyRef = useRef<Msg[]>([]);

  const applyTurn = (turn: Parameters<typeof appendHistory>[1]) => {
    historyRef.current = appendHistory(historyRef.current, turn);
    setDisplay((d) => [
      ...d,
      { role: 'assistant', text: turn.assistantText, steps: turn.steps },
    ]);
    setPending(pendingFromTurn(turn));
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput('');
    setDisplay((d) => [...d, { role: 'user', text }]);
    historyRef.current = appendUserMessage(historyRef.current, text, pending?.id);
    if (pending) setPending(null);
    setBusy(true);
    try {
      applyTurn(await callAgent({ messages: historyRef.current, surfaceContext: pageContext() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: 'approve' | 'decline') => {
    if (!pending || busy) return;
    setError(null);
    setBusy(true);
    const toolUseId = pending.id;
    setPending(null);
    try {
      applyTurn(await callAgent({ messages: historyRef.current, approval: { toolUseId, decision }, surfaceContext: pageContext() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  if (!open) {
    return (
      <button className="assist-tab" onClick={() => setOpen(true)} data-testid="assist-open" title="Operator agent">
        ▸ AGENT
      </button>
    );
  }

  return (
    <aside className="assist-panel" data-testid="assist-panel">
      <div className="assist-header">
        <span>OPERATOR AGENT</span>
        <button className="assist-close" onClick={() => setOpen(false)} data-testid="assist-close">×</button>
      </div>

      <div className="assist-transcript" data-testid="assist-transcript">
        {display.length === 0 && (
          <p className="assist-empty">Type an intent, e.g. <em>add movie Easy Virtue</em>. I research, propose a plan, and on your approval create it.</p>
        )}
        {display.map((m, i) => (
          <div key={i} className={`assist-msg assist-msg-${m.role}`} data-testid={`assist-msg-${m.role}`}>
            {m.steps && m.steps.length > 0 && (
              <ul className="assist-steps">
                {m.steps.map((s, j) => (
                  <li key={j} className={s.isError ? 'assist-step-err' : ''}>
                    {s.type === 'plan' ? '◆' : '·'} {s.summary}
                  </li>
                ))}
              </ul>
            )}
            {m.text ? <div className="assist-text">{m.text}</div> : null}
          </div>
        ))}
        {busy && <p className="assist-busy" data-testid="assist-busy">working…</p>}
      </div>

      {pending && (
        <div className="assist-approve" data-testid="assist-approve">
          <p className="assist-approve-prompt">{describeProposed(pending)}?</p>
          <PlanPreview tool={pending} />
          <div className="assist-approve-btns">
            <button className="btn btn-sm" onClick={() => void decide('approve')} disabled={busy} data-testid="assist-approve-yes">Approve</button>
            <button className="btn btn-secondary btn-sm" onClick={() => void decide('decline')} disabled={busy} data-testid="assist-approve-no">Decline</button>
          </div>
        </div>
      )}

      {error && <p className="assist-error">{error}</p>}

      <div className="assist-input-row">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          placeholder="Ask the agent…"
          className="assist-input"
          data-testid="assist-input"
        />
        <button className="btn btn-sm" onClick={() => void send()} disabled={busy || !input.trim()} data-testid="assist-send">Send</button>
      </div>
    </aside>
  );
}

/** Minimal grounding for the agent: the current route. */
function pageContext(): string {
  if (typeof window === 'undefined') return '';
  return `The operator is on ${window.location.pathname} of the hyl-media catalog app.`;
}
