import { Link, Outlet, useLocation } from 'react-router-dom';
import type { UseAuthenticator } from '@aws-amplify/ui-react';

type Props = {
  signOut?: UseAuthenticator['signOut'];
  user?: UseAuthenticator['user'];
};

const NAV_ITEMS = [
  { label: 'Movies', path: '/movies' },
  { label: 'People', path: '/persons' },
  { label: 'Bands', path: '/bands' },
  { label: 'Collaborations', path: '/collaborations' },
  { label: 'Recordings', path: '/recordings' },
  { label: 'Library', path: '/library' },
  { label: 'Sheet Music', path: '/sheet-music' },
  { label: 'Data', path: '/data' },
];

export function Layout({ signOut, user }: Props) {
  const location = useLocation();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{
        width: 200,
        background: '#1a1a2e',
        color: '#eee',
        padding: '1rem 0',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <Link to="/" style={{
          color: '#fff',
          textDecoration: 'none',
          fontSize: '1.2rem',
          fontWeight: 'bold',
          padding: '0 1rem 1rem',
          borderBottom: '1px solid #333',
        }}>
          HYL Media
        </Link>
        <div style={{ flex: 1, padding: '0.5rem 0' }}>
          {NAV_ITEMS.map(item => (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'block',
                padding: '0.5rem 1rem',
                color: location.pathname.startsWith(item.path) ? '#fff' : '#aaa',
                textDecoration: 'none',
                background: location.pathname.startsWith(item.path) ? '#16213e' : 'transparent',
                borderLeft: location.pathname.startsWith(item.path) ? '3px solid #e94560' : '3px solid transparent',
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid #333', fontSize: '0.8rem' }}>
          <div style={{ color: '#888', marginBottom: '0.5rem' }}>{user?.signInDetails?.loginId}</div>
          <button onClick={signOut} style={{
            background: 'none',
            border: '1px solid #666',
            color: '#aaa',
            padding: '0.3rem 0.8rem',
            cursor: 'pointer',
            borderRadius: 4,
          }}>
            Sign out
          </button>
        </div>
      </nav>
      <main style={{ flex: 1, padding: '1.5rem', background: '#f5f5f5', overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
