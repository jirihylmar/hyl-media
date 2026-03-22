import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listByType } from '../lib/queries';

const SECTIONS = [
  { type: 'movie', label: 'Movies', path: '/movies' },
  { type: 'person', label: 'Persons', path: '/persons' },
  { type: 'band', label: 'Bands', path: '/bands' },
  { type: 'artist', label: 'Artists', path: '/artists' },
  { type: 'recording', label: 'Recordings', path: '/recordings' },
  { type: 'book', label: 'Books', path: '/library' },
  { type: 'sheet_music', label: 'Sheet Music', path: '/sheet-music' },
];

export function Home() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    for (const s of SECTIONS) {
      listByType(s.type).then(data => {
        setCounts(prev => ({ ...prev, [s.type]: data.length }));
      });
    }
  }, []);

  return (
    <div>
      <h1>HYL Media</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
        {SECTIONS.map(s => (
          <Link key={s.type} to={s.path} style={{
            background: '#fff',
            padding: '1.5rem',
            borderRadius: 8,
            textDecoration: 'none',
            color: '#333',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{counts[s.type] ?? '...'}</div>
            <div>{s.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
