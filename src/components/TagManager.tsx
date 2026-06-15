import { useState } from 'react';
import { updateItem } from '../lib/queries';
import { useUserId } from '../lib/UserContext';
import { TAG_DICTIONARY, TAG_COLORS, getTagCategory } from '../lib/tagDictionary';

type Props = {
  id: string;
  entityType: string;
  tags: string[];
  onUpdate: (tags: string[]) => void;
  // When provided (DC-backed pages), persist via this instead of the legacy updateItem.
  save?: (tags: string[]) => Promise<void>;
};

export function TagManager({ id, entityType, tags, onUpdate, save }: Props) {
  const userId = useUserId();
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const persist = async (newTags: string[]) => {
    if (save) await save(newTags);
    else await updateItem(id, entityType, { tags: newTags as unknown as string }, userId);
    onUpdate(newTags);
  };

  const handleToggle = async (tag: string) => {
    setSaving(true);
    const newTags = tags.includes(tag)
      ? tags.filter(t => t !== tag)
      : [...tags, tag];
    try {
      await persist(newTags);
    } catch (e) {
      console.error('Tag update failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (tag: string) => {
    setSaving(true);
    const newTags = tags.filter(t => t !== tag);
    try {
      await persist(newTags);
    } catch (e) {
      console.error('Tag remove failed:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ margin: '12px 0' }}>
      <h3 style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        Tags
        <button onClick={() => setShowPicker(!showPicker)} className="btn btn-primary btn-sm">
          {showPicker ? '\u2212' : '+'}
        </button>
      </h3>

      {/* Current tags */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {tags.length === 0 && !showPicker && (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>No tags assigned</span>
        )}
        {tags.map(tag => {
          const cat = getTagCategory(tag);
          const color = cat ? TAG_COLORS[cat] : '#666';
          return (
            <span key={tag} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 6px', background: `${color}15`, color,
              fontSize: '0.78rem', fontWeight: 500,
              border: `1px solid ${color}30`,
            }}>
              {tag}
              <button
                onClick={() => handleRemove(tag)}
                disabled={saving}
                style={{
                  background: 'none', border: 'none', color, cursor: 'pointer',
                  fontSize: '0.9em', padding: 0, marginLeft: 2,
                }}
              >{'\u00d7'}</button>
            </span>
          );
        })}
      </div>

      {/* Tag picker */}
      {showPicker && (
        <div style={{
          padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
          maxWidth: 500,
        }}>
          {Object.entries(TAG_DICTIONARY).map(([catKey, cat]) => (
            <div key={catKey} style={{ marginBottom: 10 }}>
              <div style={{
                fontSize: '0.8rem', fontWeight: 'bold',
                color: TAG_COLORS[catKey], marginBottom: 4,
              }}>{cat.label}</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {cat.tags.map(tag => {
                  const active = tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => handleToggle(tag)}
                      disabled={saving}
                      style={{
                        padding: '2px 6px', fontSize: '0.73rem',
                        cursor: 'pointer', fontFamily: 'var(--font-mono)',
                        background: active ? `${TAG_COLORS[catKey]}30` : 'transparent',
                        color: active ? TAG_COLORS[catKey] : 'var(--text-muted)',
                        border: `1px solid ${active ? TAG_COLORS[catKey] : 'var(--border)'}`,
                      }}
                    >{tag}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
