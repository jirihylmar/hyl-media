import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import type { UseAuthenticator } from '@aws-amplify/ui-react';

type Props = {
  signOut?: UseAuthenticator['signOut'];
  user?: UseAuthenticator['user'];
};

export function Layout({ signOut, user }: Props) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app-layout">
      <button
        className="hamburger"
        onClick={() => setSidebarOpen(o => !o)}
        aria-label="Toggle navigation"
      >
        {sidebarOpen ? '\u2715' : '\u2630'}
      </button>

      <div
        className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`}
        onClick={closeSidebar}
      />

      <nav className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <Link to="/" className="sidebar-logo" onClick={closeSidebar}>
          HYL Media
        </Link>
        <div className="sidebar-nav">
          <Link
            to="/"
            className={location.pathname === '/' || location.pathname.startsWith('/dossier') ? 'active' : ''}
            onClick={closeSidebar}
          >
            Dossier
          </Link>
        </div>
        <div className="sidebar-user">
          <div className="sidebar-user-id">{user?.signInDetails?.loginId}</div>
          <button onClick={signOut} className="btn btn-secondary btn-sm">
            Sign out
          </button>
        </div>
      </nav>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
