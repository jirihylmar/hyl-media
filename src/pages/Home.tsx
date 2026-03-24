import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listByType } from '../lib/queries';

const SECTIONS = [
  { type: 'movie', label: 'Movies', path: '/movies' },
  { type: 'person', label: 'People', path: '/persons' },
  { type: 'band', label: 'Bands', path: '/bands' },
  { type: 'recording', label: 'Recordings', path: '/recordings' },
  { type: 'book', label: 'Library', path: '/library' },
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
      <div className="dash-grid">
        {SECTIONS.map(s => (
          <Link key={s.type} to={s.path} className="card" style={{ textDecoration: 'none', color: '#333' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{counts[s.type] ?? '...'}</div>
            <div>{s.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
