import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItem, listByRecording } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';

export function RecordingDetail() {
  const { id } = useParams<{ id: string }>();
  const [recording, setRecording] = useState<KnowledgeGraphItem | null>(null);
  const [performers, setPerformers] = useState<KnowledgeGraphItem[]>([]);

  useEffect(() => {
    if (!id) return;
    getItem(id, 'recording').then(setRecording);
    listByRecording(id).then(setPerformers);
  }, [id]);

  if (!recording) return <p>Loading...</p>;

  const performerLinks = performers.filter(p => p.performerType !== 'tag');
  const movieLinks = performers.filter(p => p.entityType === 'recording_movie');

  return (
    <div>
      <h1>{recording.name}</h1>
      <p>Language: {recording.language}</p>

      {performerLinks.length > 0 && (
        <>
          <h2>Performers</h2>
          <ul>
            {performerLinks.map(p => {
              const path = p.performerType === 'band' ? '/bands' :
                          p.performerType === 'artist' ? '/artists' :
                          p.performerType === 'collaboration' ? '/collaborations' :
                          '/persons';
              return (
                <li key={p.id}>
                  <Link to={`${path}/${p.performerId}`}>{p.performerName}</Link>
                  <span style={{ color: '#888', marginLeft: 8 }}>({p.performerType})</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {movieLinks.length > 0 && (
        <>
          <h2>Featured in</h2>
          <ul>
            {movieLinks.map(m => (
              <li key={m.id}>
                <Link to={`/movies/${m.movieId}`}>{m.movieName}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
