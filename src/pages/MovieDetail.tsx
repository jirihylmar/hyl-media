import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItem, listByCastMovie, listByType, updateItem } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';
import { InlineEdit } from '../components/InlineEdit';
import { CastManager } from '../components/CastManager';
import { useUserId } from '../lib/UserContext';

export function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const userId = useUserId();
  const [movie, setMovie] = useState<KnowledgeGraphItem | null>(null);
  const [cast, setCast] = useState<KnowledgeGraphItem[]>([]);
  const [soundtracks, setSoundtracks] = useState<KnowledgeGraphItem[]>([]);

  const refreshCast = useCallback(() => {
    if (!id) return;
    listByCastMovie(id).then(setCast);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getItem(id, 'movie').then(setMovie);
    refreshCast();
    listByType('recording_movie').then(items => {
      setSoundtracks(items.filter(i => i.movieId === id));
    });
  }, [id, refreshCast]);

  if (!movie) return <p>Loading...</p>;

  const handleSave = async (field: string, value: string) => {
    const updated = await updateItem(id!, 'movie', { [field]: value }, userId);
    if (updated) setMovie({ ...movie, ...updated });
  };

  return (
    <div>
      <InlineEdit value={movie.name || ''} onSave={v => handleSave('name', v)} as="h1" />
      <p><InlineEdit value={movie.language || ''} onSave={v => handleSave('language', v)} label="Language" /></p>
      {movie.updatedAt && (
        <p style={{ fontSize: '0.8em', color: '#888' }}>
          Last updated: {new Date(movie.updatedAt).toLocaleString()} by {movie.updatedBy}
        </p>
      )}

      <CastManager
        movieId={id!}
        movieName={movie.name || ''}
        cast={cast}
        onUpdate={refreshCast}
      />

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
