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
      <div className="fbi-banner">HYL Media // Personal Archive System</div>
      <h1>System Status</h1>
      <div className="dash-grid">
        {SECTIONS.map(s => (
          <Link key={s.type} to={s.path} className="card" style={{ textDecoration: 'none' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--green)' }}>
              {counts[s.type] ?? <span className="loading" />}
            </div>
            <div style={{ color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.8rem' }}>
              {s.label}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
