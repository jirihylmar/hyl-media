import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listByType, createItem, deleteItem } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';

type MovieSideProps = {
  side: 'movie';
  movieId: string;
  movieName: string;
  soundtracks: KnowledgeGraphItem[];
  onUpdate: () => void;
};

type RecordingSideProps = {
  side: 'recording';
  recordingId: string;
  recordingName: string;
  movieLinks: KnowledgeGraphItem[];
  onUpdate: () => void;
};

type Props = MovieSideProps | RecordingSideProps;

export function SoundtrackManager(props: Props) {
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<KnowledgeGraphItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const isMovieSide = props.side === 'movie';
  const items = isMovieSide ? props.soundtracks : props.movieLinks;

  const existingIds = new Set(
    items.map(i => isMovieSide ? i.recordingId as string : i.movieId as string)
  );

  const handleSearch = async (query: string) => {
    setSearch(query);
    if (query.length < 2) { setResults([]); return; }
    setSearching(true);
    const searchType = isMovieSide ? 'recording' : 'movie';
    const allItems = await listByType(searchType);
    setResults(
      allItems.filter(i =>
        i.name?.toLowerCase().includes(query.toLowerCase()) &&
        !existingIds.has(i.id)
      ).slice(0, 10)
    );
    setSearching(false);
  };

  const handleAdd = async (target: KnowledgeGraphItem) => {
    const movieId = isMovieSide ? props.movieId : target.id;
    const movieName = isMovieSide ? props.movieName : (target.name || '');
    const recordingId = isMovieSide ? target.id : (props as RecordingSideProps).recordingId;
    const recordingName = isMovieSide ? (target.name || '') : (props as RecordingSideProps).recordingName;

    const linkId = `${recordingId}___movie___${movieId}`;
    await createItem({
      id: linkId,
      entityType: 'recording_movie',
      movieId,
      movieName,
      recordingId,
      recordingName,
    });
    setAdding(false);
    setSearch('');
    setResults([]);
    props.onUpdate();
  };

  const handleRemove = async (item: KnowledgeGraphItem) => {
    setRemoving(item.id);
    await deleteItem(item.id, 'recording_movie');
    setRemoving(null);
    props.onUpdate();
  };

  const title = isMovieSide ? 'Soundtrack' : 'Featured in';
  const searchPlaceholder = isMovieSide ? 'Search recordings...' : 'Search movies...';

  return (
    <div>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {title} ({items.length})
        <button onClick={() => setAdding(true)} style={addBtnStyle} title={`Add ${isMovieSide ? 'recording' : 'movie'}`}>+</button>
      </h2>
      <ul>
        {items.map(item => (
          <li key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isMovieSide ? (
              <Link to={`/recordings/${item.recordingId}`}>{item.recordingName}</Link>
            ) : (
              <Link to={`/movies/${item.movieId}`}>{item.movieName}</Link>
            )}
            <button
              onClick={() => handleRemove(item)}
              disabled={removing === item.id}
              style={removeBtnStyle}
              title="Remove"
            >{removing === item.id ? '...' : '\u00d7'}</button>
          </li>
        ))}
      </ul>

      {adding && (
        <div style={{
          margin: '12px 0', padding: 12,
          background: 'var(--bg-card)', border: '1px solid var(--border-bright)', maxWidth: 400,
        }}>
          <div style={{ marginBottom: 8, fontWeight: 'bold' }}>
            Add {isMovieSide ? 'recording to soundtrack' : 'movie'}
            <button onClick={() => { setAdding(false); setSearch(''); setResults([]); }}
              style={{ float: 'right', background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '1.1em', fontFamily: 'var(--font-mono)' }}>
              {'\u00d7'}
            </button>
          </div>
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder={searchPlaceholder}
            autoFocus
            style={{ width: '100%' }}
          />
          {searching && <p className="meta">Searching...</p>}
          {results.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
              {results.map(r => (
                <li key={r.id}>
                  <button
                    onClick={() => handleAdd(r)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '5px 8px', margin: '2px 0', background: 'var(--bg-input)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                      color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
                    }}
                  >{r.name}</button>
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
