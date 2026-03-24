import { useState } from 'react';
import { updateItem } from '../lib/queries';
import { useUserId } from '../lib/UserContext';

export type ExternalLink = { url: string; type: string };

type Props = {
  id: string;
  entityType: string;
  externalLinks?: string | null;
  onUpdate: (externalLinks: string) => void;
};

const KNOWN_TYPES: Record<string, { label: string; icon: string; color: string }> = {
  wikipedia: { label: 'Wikipedia', icon: 'W', color: '#636466' },
  imdb: { label: 'IMDb', icon: 'i', color: '#f5c518' },
  spotify: { label: 'Spotify', icon: 'S', color: '#1db954' },
  youtube: { label: 'YouTube', icon: 'Y', color: '#ff0000' },
  discogs: { label: 'Discogs', icon: 'D', color: '#333' },
  goodreads: { label: 'Goodreads', icon: 'G', color: '#553b08' },
  musicbrainz: { label: 'MusicBrainz', icon: 'M', color: '#ba478f' },
};

export function parseLinks(raw?: string | null): ExternalLink[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function serializeLinks(links: ExternalLink[]): string {
  return JSON.stringify(links);
}

export function ExternalLinks({ id, entityType, externalLinks, onUpdate }: Props) {
  const userId = useUserId();
  const [editing, setEditing] = useState<{ index: number; url: string; type: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newType, setNewType] = useState('wikipedia');
  const [saving, setSaving] = useState(false);

  const links = parseLinks(externalLinks);

  const persist = async (updated: ExternalLink[]) => {
    setSaving(true);
    const json = serializeLinks(updated);
    try {
      await updateItem(id, entityType, { externalLinks: json }, userId);
      onUpdate(json);
    } catch (e) {
      console.error('Save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    const url = newUrl.trim();
    if (!url) return;
    const updated = [...links, { url, type: newType }];
    await persist(updated);
    setAdding(false);
    setNewUrl('');
    setNewType('wikipedia');
  };

  const handleEditSave = async () => {
    if (!editing) return;
    const url = editing.url.trim();
    if (!url) {
      // Remove the link
      const updated = links.filter((_, i) => i !== editing.index);
      await persist(updated);
    } else {
      const updated = links.map((l, i) => i === editing.index ? { url, type: editing.type } : l);
      await persist(updated);
    }
    setEditing(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') action();
    if (e.key === 'Escape') { setEditing(null); setAdding(false); }
  };

  const getTypeInfo = (type: string) => KNOWN_TYPES[type] || { label: type, icon: type[0]?.toUpperCase() || '?', color: '#666' };

  return (
    <div style={{ margin: '12px 0' }}>
      <h3 style={{ fontSize: '0.95rem', color: '#555', marginBottom: 6 }}>External Links</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {links.map((link, i) => {
          const info = getTypeInfo(link.type);
          if (editing?.index === i) {
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <select
                  value={editing.type}
                  onChange={e => setEditing({ ...editing, type: e.target.value })}
                  style={{ padding: '3px 4px', fontSize: '0.85rem', border: '1px solid #4a90d9', borderRadius: 3 }}
                >
                  {Object.entries(KNOWN_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                  {!KNOWN_TYPES[editing.type] && <option value={editing.type}>{editing.type}</option>}
                </select>
                <input
                  value={editing.url}
                  onChange={e => setEditing({ ...editing, url: e.target.value })}
                  onKeyDown={e => handleKeyDown(e, handleEditSave)}
                  onBlur={handleEditSave}
                  placeholder="URL (empty to remove)"
                  autoFocus
                  disabled={saving}
                  style={{ padding: '3px 6px', fontSize: '0.85rem', border: '1px solid #4a90d9', borderRadius: 3, width: 250 }}
                />
              </span>
            );
          }
          return (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => {
                if (e.altKey) { e.preventDefault(); setEditing({ index: i, url: link.url, type: link.type }); }
              }}
              title={`${info.label} (Alt+click to edit)`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', background: info.color, color: '#fff',
                borderRadius: 4, fontSize: '0.8rem', fontWeight: 'bold',
                textDecoration: 'none',
              }}
            >
              {info.icon} {info.label}
            </a>
          );
        })}

        {adding ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <select
              value={newType}
              onChange={e => setNewType(e.target.value)}
              style={{ padding: '3px 4px', fontSize: '0.85rem', border: '1px solid #4a90d9', borderRadius: 3 }}
            >
              {Object.entries(KNOWN_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => handleKeyDown(e, handleAdd)}
              placeholder="URL"
              autoFocus
              disabled={saving}
              style={{ padding: '3px 6px', fontSize: '0.85rem', border: '1px solid #4a90d9', borderRadius: 3, width: 250 }}
            />
          </span>
        ) : (
          <button
            onClick={() => setAdding(true)}
            title="Add link"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', background: '#eee', color: '#888',
              border: '1px dashed #ccc', borderRadius: 4, fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            + Add Link
          </button>
        )}
      </div>
    </div>
  );
}
