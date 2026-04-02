import { Link, Outlet } from 'react-router-dom';
import type { UseAuthenticator } from '@aws-amplify/ui-react';

type Props = {
  signOut?: UseAuthenticator['signOut'];
  user?: UseAuthenticator['user'];
};

export function Layout({ signOut, user }: Props) {
  return (
    <div className="app-layout">
      <header className="top-bar">
        <Link to="/" className="top-bar-logo">HYL Media</Link>
        <div className="top-bar-user">
          <span className="top-bar-user-id">{user?.signInDetails?.loginId}</span>
          <button onClick={signOut} className="btn btn-secondary btn-sm">Sign out</button>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
