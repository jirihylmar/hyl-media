import { useState } from 'react';
import { updateItem } from '../lib/queries';
import { useUserId } from '../lib/UserContext';

type Props = {
  id: string;
  entityType: string;
  wikiUrl?: string | null;
  imdbUrl?: string | null;
  spotifyUrl?: string | null;
  youtubeUrl?: string | null;
  onUpdate: (fields: Record<string, string | null>) => void;
};

const LINK_FIELDS = [
  { key: 'wikiUrl', label: 'Wikipedia', icon: 'W', color: '#636466' },
  { key: 'imdbUrl', label: 'IMDb', icon: 'i', color: '#f5c518' },
  { key: 'spotifyUrl', label: 'Spotify', icon: 'S', color: '#1db954' },
  { key: 'youtubeUrl', label: 'YouTube', icon: 'Y', color: '#ff0000' },
] as const;

export function ExternalLinks({ id, entityType, wikiUrl, imdbUrl, spotifyUrl, youtubeUrl, onUpdate }: Props) {
  const userId = useUserId();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const values: Record<string, string | null | undefined> = { wikiUrl, imdbUrl, spotifyUrl, youtubeUrl };

  const handleEdit = (key: string) => {
    setDraft(values[key] || '');
    setEditing(key);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    const value = draft.trim() || null;
    try {
      await updateItem(id, entityType, { [editing]: value }, userId);
      onUpdate({ [editing]: value });
      setEditing(null);
    } catch (e) {
      console.error('Save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(null);
  };

  return (
    <div style={{ margin: '12px 0' }}>
      <h3 style={{ fontSize: '0.95rem', color: '#555', marginBottom: 6 }}>External Links</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {LINK_FIELDS.map(({ key, label, icon, color }) => {
          const url = values[key];
          if (editing === key) {
            return (
              <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleSave}
                  placeholder={`${label} URL`}
                  autoFocus
                  disabled={saving}
                  style={{ padding: '3px 6px', fontSize: '0.85rem', border: '1px solid #4a90d9', borderRadius: 3, width: 250 }}
                />
              </span>
            );
          }
          if (url) {
            return (
              <a
                key={key}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => { if (e.altKey) { e.preventDefault(); handleEdit(key); } }}
                title={`${label} (Alt+click to edit)`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', background: color, color: '#fff',
                  borderRadius: 4, fontSize: '0.8rem', fontWeight: 'bold',
                  textDecoration: 'none',
                }}
              >
                {icon} {label}
              </a>
            );
          }
          return (
            <button
              key={key}
              onClick={() => handleEdit(key)}
              title={`Add ${label} link`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', background: '#eee', color: '#888',
                border: '1px dashed #ccc', borderRadius: 4, fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              {icon} + {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
