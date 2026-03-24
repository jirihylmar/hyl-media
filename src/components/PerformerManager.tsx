import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listByType, createItem, deleteItem } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';

type Props = {
  recordingId: string;
  recordingName: string;
  performers: KnowledgeGraphItem[];
  onUpdate: () => void;
};

type PerformerType = 'person' | 'band' | 'artist' | 'collaboration';

export function PerformerManager({ recordingId, recordingName, performers, onUpdate }: Props) {
  const [adding, setAdding] = useState(false);
  const [perfType, setPerfType] = useState<PerformerType>('person');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<KnowledgeGraphItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const performerLinks = performers.filter(p => p.entityType === 'recording_performer' && p.performerType !== 'tag');
  const existingPerformerIds = new Set(performerLinks.map(p => p.performerId));

  const handleSearch = async (query: string) => {
    setSearch(query);
    if (query.length < 2) { setResults([]); return; }
    setSearching(true);
    const items = await listByType(perfType);
    setResults(
      items.filter(i =>
        i.name?.toLowerCase().includes(query.toLowerCase()) &&
        !existingPerformerIds.has(i.id)
      ).slice(0, 10)
    );
    setSearching(false);
  };

  const handleAdd = async (performer: KnowledgeGraphItem) => {
    const linkId = `${recordingId}___performer___${performer.id}`;
    await createItem({
      id: linkId,
      entityType: 'recording_performer',
      recordingId,
      recordingName,
      performerId: performer.id,
      performerName: performer.name,
      performerType: perfType,
    });
    setAdding(false);
    setSearch('');
    setResults([]);
    onUpdate();
  };

  const handleRemove = async (item: KnowledgeGraphItem) => {
    setRemoving(item.id);
    await deleteItem(item.id, 'recording_performer');
    setRemoving(null);
    onUpdate();
  };

  const getPath = (type: string | null | undefined) =>
    type === 'band' ? '/bands' :
    type === 'artist' ? '/artists' :
    type === 'collaboration' ? '/collaborations' :
    '/persons';

  return (
    <div>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        Performers
        <button onClick={() => setAdding(true)} style={addBtnStyle} title="Add performer">+</button>
      </h2>
      <ul>
        {performerLinks.map(p => (
          <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link to={`${getPath(p.performerType)}/${p.performerId}`}>{p.performerName}</Link>
            <span style={{ color: 'var(--text-dim)' }}>({p.performerType})</span>
            <button
              onClick={() => handleRemove(p)}
              disabled={removing === p.id}
              style={removeBtnStyle}
              title="Remove"
            >{removing === p.id ? '...' : '\u00d7'}</button>
          </li>
        ))}
      </ul>

      {adding && (
        <div style={{
          margin: '12px 0', padding: 12,
          background: 'var(--bg-card)', border: '1px solid var(--border-bright)', maxWidth: 400,
        }}>
          <div style={{ marginBottom: 8, fontWeight: 'bold' }}>
            Add performer
            <button onClick={() => { setAdding(false); setSearch(''); setResults([]); }}
              style={{ float: 'right', background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '1.1em', fontFamily: 'var(--font-mono)' }}>
              {'\u00d7'}
            </button>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: '0.85em', color: 'var(--text-dim)' }}>Type: </label>
            {(['person', 'band', 'artist', 'collaboration'] as const).map(t => (
              <label key={t} style={{ marginRight: 12, fontSize: '0.9em' }}>
                <input type="radio" name="perfType" value={t}
                  checked={perfType === t}
                  onChange={() => { setPerfType(t); setSearch(''); setResults([]); }}
                /> {t}
              </label>
            ))}
          </div>
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder={`Search ${perfType}s...`}
            autoFocus
            style={{ width: '100%' }}
          />
          {searching && <p className="meta">Searching...</p>}
          {results.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
              {results.map(p => (
                <li key={p.id}>
                  <button
                    onClick={() => handleAdd(p)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '5px 8px', margin: '2px 0', background: 'var(--bg-input)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                      color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
                    }}
                  >{p.name}</button>
                </li>
              ))}
            </ul>
          )}
          {search.length >= 2 && !searching && results.length === 0 && (
            <p className="meta" style={{ margin: '8px 0 0' }}>No matches found</p>
          )}
        </div>
      )}
    </div>
  );
}

const addBtnStyle: React.CSSProperties = {
  background: 'rgba(0, 255, 65, 0.1)', color: 'var(--green)', border: '1px solid var(--green-dim)',
  width: 22, height: 22, fontSize: '1rem', cursor: 'pointer', lineHeight: '1',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)',
};

const removeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer',
  fontSize: '1.1em', padding: '0 4px', fontFamily: 'var(--font-mono)',
};
