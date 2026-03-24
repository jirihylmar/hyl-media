import { useState } from 'react';

type Props = {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  label?: string;
  as?: 'h1' | 'span';
};

export function InlineEdit({ value, onSave, label, as = 'span' }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      console.error('Save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
  };

  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {label && <span style={{ color: 'var(--text-dim)', fontSize: '0.9em' }}>{label}: </span>}
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          autoFocus
          disabled={saving}
          style={{
            fontSize: as === 'h1' ? '1.3rem' : '0.9rem',
            fontWeight: as === 'h1' ? 'bold' : 'normal',
            padding: '2px 6px',
            minWidth: 120,
          }}
        />
        {saving && <span className="meta">saving...</span>}
      </span>
    );
  }

  const Tag = as;
  const displayContent = (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Click to edit"
      style={{
        cursor: 'pointer',
        borderBottom: '1px dashed var(--border)',
        paddingBottom: 1,
      }}
    >
      {label && <span style={{ color: 'var(--text-dim)', fontSize: '0.9em', fontWeight: 'normal' }}>{label}: </span>}
      {value || <em style={{ color: 'var(--text-muted)' }}>empty</em>}
      <span style={{ color: 'var(--text-muted)', fontSize: '0.7em', marginLeft: 6 }}>&#9998;</span>
    </span>
  );

  if (as === 'h1') {
    return <Tag style={{ display: 'flex', alignItems: 'center' }}>{displayContent}</Tag>;
  }
  return displayContent;
}
