import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItem, listByCastMovie, listByType, updateItem } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';
import { InlineEdit } from '../components/InlineEdit';
import { useUserId } from '../lib/UserContext';

export function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const userId = useUserId();
  const [movie, setMovie] = useState<KnowledgeGraphItem | null>(null);
  const [cast, setCast] = useState<KnowledgeGraphItem[]>([]);
  const [soundtracks, setSoundtracks] = useState<KnowledgeGraphItem[]>([]);

  useEffect(() => {
    if (!id) return;
    getItem(id, 'movie').then(setMovie);
    listByCastMovie(id).then(setCast);
    listByType('recording_movie').then(items => {
      setSoundtracks(items.filter(i => i.movieId === id));
    });
  }, [id]);

  if (!movie) return <p>Loading...</p>;

  const handleSave = async (field: string, value: string) => {
    const updated = await updateItem(id!, 'movie', { [field]: value }, userId);
    if (updated) setMovie({ ...movie, ...updated });
  };

  const directors = cast.filter(c => c.role === 'director');
  const actors = cast.filter(c => c.role === 'actor');

  return (
    <div>
      <InlineEdit value={movie.name || ''} onSave={v => handleSave('name', v)} as="h1" />
      <p><InlineEdit value={movie.language || ''} onSave={v => handleSave('language', v)} label="Language" /></p>
      {movie.updatedAt && (
        <p style={{ fontSize: '0.8em', color: '#888' }}>
          Last updated: {new Date(movie.updatedAt).toLocaleString()} by {movie.updatedBy}
        </p>
      )}

      {directors.length > 0 && (
        <>
          <h2>Director{directors.length > 1 ? 's' : ''}</h2>
          <ul>
            {directors.map(d => (
              <li key={d.id}>
                <Link to={`/persons/${d.personId}`}>{d.personName}</Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Cast ({actors.length})</h2>
      <ul>
        {actors.map(c => (
          <li key={c.id}>
            <Link to={`/persons/${c.personId}`}>{c.personName}</Link>
          </li>
        ))}
      </ul>

      {soundtracks.length > 0 && (
        <>
          <h2>Soundtrack</h2>
          <ul>
            {soundtracks.map(s => (
              <li key={s.id}>
                <Link to={`/recordings/${s.recordingId}`}>{s.recordingName}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
