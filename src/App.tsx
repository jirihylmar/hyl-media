import { Authenticator } from '@aws-amplify/ui-react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { UserContext } from './lib/UserContext';
import { Home } from './pages/Home';
import { MovieList } from './pages/MovieList';
import { MovieDetail } from './pages/MovieDetail';
import { PersonList } from './pages/PersonList';
import { PersonDetail } from './pages/PersonDetail';
import { BandList } from './pages/BandList';
import { BandDetail } from './pages/BandDetail';
import { ArtistList } from './pages/ArtistList';
import { CollaborationList } from './pages/CollaborationList';
import { RecordingList } from './pages/RecordingList';
import { RecordingDetail } from './pages/RecordingDetail';
import { LibraryList } from './pages/LibraryList';
import { LibraryDetail } from './pages/LibraryDetail';
import { SheetMusicList } from './pages/SheetMusicList';
import { SheetMusicDetail } from './pages/SheetMusicDetail';
import '@aws-amplify/ui-react/styles.css';

function AuthenticatedApp() {
  return (
    <Authenticator>
      {({ signOut, user }) => {
        if (!user) return <></>;
        return (
        <UserContext.Provider value={user.signInDetails?.loginId || user.userId}>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout signOut={signOut} user={user} />}>
              <Route path="/" element={<Home />} />
              <Route path="/movies" element={<MovieList />} />
              <Route path="/movies/:id" element={<MovieDetail />} />
              <Route path="/persons" element={<PersonList />} />
              <Route path="/persons/:id" element={<PersonDetail />} />
              <Route path="/bands" element={<BandList />} />
              <Route path="/bands/:id" element={<BandDetail />} />
              <Route path="/artists" element={<ArtistList />} />
              <Route path="/artists/:id" element={<BandDetail />} />
              <Route path="/collaborations" element={<CollaborationList />} />
              <Route path="/collaborations/:id" element={<BandDetail />} />
              <Route path="/recordings" element={<RecordingList />} />
              <Route path="/recordings/:id" element={<RecordingDetail />} />
              <Route path="/library" element={<LibraryList />} />
              <Route path="/library/:id" element={<LibraryDetail />} />
              <Route path="/sheet-music" element={<SheetMusicList />} />
              <Route path="/sheet-music/:id" element={<SheetMusicDetail />} />
            </Route>
          </Routes>
        </BrowserRouter>
        </UserContext.Provider>
      );}}
    </Authenticator>
  );
}

function App() {
  return <AuthenticatedApp />;
}

export default App;
