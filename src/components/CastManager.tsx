import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listByType, createItem, deleteItem } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';

type Props = {
  movieId: string;
  movieName: string;
  cast: KnowledgeGraphItem[];
  onUpdate: () => void;
};

export function CastManager({ movieId, movieName, cast, onUpdate }: Props) {
  const [adding, setAdding] = useState<'actor' | 'director' | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<KnowledgeGraphItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const existingPersonIds = new Set(cast.map(c => c.personId));

  const handleSearch = async (query: string) => {
    setSearch(query);
    if (query.length < 2) { setResults([]); return; }
    setSearching(true);
    const persons = await listByType('person');
    setResults(
      persons.filter(p =>
        p.name?.toLowerCase().includes(query.toLowerCase()) &&
        !existingPersonIds.has(p.id)
      ).slice(0, 10)
    );
    setSearching(false);
  };

  const handleAdd = async (person: KnowledgeGraphItem) => {
    if (!adding) return;
    const castId = `${movieId}___${adding}___${person.id}`;
    await createItem({
      id: castId,
      entityType: 'movie_cast',
      role: adding,
      movieId,
      movieName,
      personId: person.id,
      personName: person.name,
    });
    setAdding(null);
    setSearch('');
    setResults([]);
    onUpdate();
  };

  const handleRemove = async (castItem: KnowledgeGraphItem) => {
    setRemoving(castItem.id);
    await deleteItem(castItem.id, 'movie_cast');
    setRemoving(null);
    onUpdate();
  };

  const directors = cast.filter(c => c.role === 'director');
  const actors = cast.filter(c => c.role === 'actor');

  return (
    <div>
      {directors.length > 0 && (
        <>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Director{directors.length > 1 ? 's' : ''}
            <button onClick={() => setAdding('director')} style={addBtnStyle} title="Add director">+</button>
          </h2>
          <ul>
            {directors.map(d => (
              <li key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Link to={`/persons/${d.personId}`}>{d.personName}</Link>
                <button
                  onClick={() => handleRemove(d)}
                  disabled={removing === d.id}
                  style={removeBtnStyle}
                  title="Remove"
                >{removing === d.id ? '...' : '\u00d7'}</button>
              </li>
            ))}
          </ul>
        </>
      )}
      {directors.length === 0 && (
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Directors
          <button onClick={() => setAdding('director')} style={addBtnStyle} title="Add director">+</button>
        </h2>
      )}

      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        Cast ({actors.length})
        <button onClick={() => setAdding('actor')} style={addBtnStyle} title="Add actor">+</button>
      </h2>
      <ul>
        {actors.map(c => (
          <li key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link to={`/persons/${c.personId}`}>{c.personName}</Link>
            <button
              onClick={() => handleRemove(c)}
              disabled={removing === c.id}
              style={removeBtnStyle}
              title="Remove"
            >{removing === c.id ? '...' : '\u00d7'}</button>
          </li>
        ))}
      </ul>

      {adding && (
        <div style={{
          margin: '12px 0',
          padding: 12,
          background: '#fff',
          border: '2px solid #4a90d9',
          borderRadius: 6,
          maxWidth: 400,
        }}>
          <div style={{ marginBottom: 8, fontWeight: 'bold' }}>
            Add {adding}
            <button onClick={() => { setAdding(null); setSearch(''); setResults([]); }}
              style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1em' }}>
              {'\u00d7'}
            </button>
          </div>
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search persons..."
            autoFocus
            style={{ width: '100%', padding: '6px 8px', fontSize: '1rem', border: '1px solid #ccc', borderRadius: 4 }}
          />
          {searching && <p style={{ color: '#888', fontSize: '0.9em' }}>Searching...</p>}
          {results.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
              {results.map(p => (
                <li key={p.id}>
                  <button
                    onClick={() => handleAdd(p)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '6px 8px', margin: '2px 0', background: '#f8f8f8',
                      border: '1px solid #eee', borderRadius: 3, cursor: 'pointer',
                    }}
                  >
                    {p.name}
                    {p.roles?.length ? <span style={{ color: '#888', marginLeft: 8 }}>({p.roles.join(', ')})</span> : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {search.length >= 2 && !searching && results.length === 0 && (
            <p style={{ color: '#888', fontSize: '0.9em', margin: '8px 0 0' }}>No matching persons found</p>
          )}
        </div>
      )}
    </div>
  );
}

const addBtnStyle: React.CSSProperties = {
  background: '#4a90d9',
  color: '#fff',
  border: 'none',
  borderRadius: '50%',
  width: 24,
  height: 24,
  fontSize: '1.1rem',
  cursor: 'pointer',
  lineHeight: '1',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const removeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#c00',
  cursor: 'pointer',
  fontSize: '1.1em',
  padding: '0 4px',
};
