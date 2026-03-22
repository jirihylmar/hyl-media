import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItem, listByCastMovie, listByType } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';

export function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const [movie, setMovie] = useState<KnowledgeGraphItem | null>(null);
  const [cast, setCast] = useState<KnowledgeGraphItem[]>([]);
  const [soundtracks, setSoundtracks] = useState<KnowledgeGraphItem[]>([]);

  useEffect(() => {
    if (!id) return;
    getItem(id, 'movie').then(setMovie);
    listByCastMovie(id).then(setCast);
    // Find soundtrack links (recording_movie where movie_id = this movie)
    listByType('recording_movie').then(items => {
      setSoundtracks(items.filter(i => i.movieId === id));
    });
  }, [id]);

  if (!movie) return <p>Loading...</p>;

  const directors = cast.filter(c => c.role === 'director');
  const actors = cast.filter(c => c.role === 'actor');

  return (
    <div>
      <h1>{movie.name}</h1>
      <p>Language: {movie.language}</p>

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
