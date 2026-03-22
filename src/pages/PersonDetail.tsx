import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItem, listByPersonFilm, listByPerformer } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';

export function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const [person, setPerson] = useState<KnowledgeGraphItem | null>(null);
  const [films, setFilms] = useState<KnowledgeGraphItem[]>([]);
  const [recordings, setRecordings] = useState<KnowledgeGraphItem[]>([]);

  useEffect(() => {
    if (!id) return;
    getItem(id, 'person').then(setPerson);
    listByPersonFilm(id).then(setFilms);
    listByPerformer(id).then(setRecordings);
  }, [id]);

  if (!person) return <p>Loading...</p>;

  return (
    <div>
      <h1>{person.name}</h1>
      <p>
        {person.givenName} {person.familyName}
        {person.roles?.length ? ` — ${person.roles.join(', ')}` : ''}
      </p>
      <p>Language: {person.language}</p>

      {films.length > 0 && (
        <>
          <h2>Filmography ({films.length})</h2>
          <ul>
            {films.map(f => (
              <li key={f.id}>
                <Link to={`/movies/${f.movieId}`}>{f.movieName}</Link>
                <span style={{ color: '#888', marginLeft: 8 }}>({f.role})</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {recordings.length > 0 && (
        <>
          <h2>Recordings ({recordings.length})</h2>
          <ul>
            {recordings.map(r => (
              <li key={r.id}>
                <Link to={`/recordings/${r.recordingId}`}>{r.recordingName}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
