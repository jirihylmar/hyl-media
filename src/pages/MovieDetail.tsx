import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getItem, listByCastMovie, listByType, updateItem } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';
import { InlineEdit } from '../components/InlineEdit';
import { CastManager } from '../components/CastManager';
import { SoundtrackManager } from '../components/SoundtrackManager';
import { ExternalLinks } from '../components/ExternalLinks';
import { TagManager } from '../components/TagManager';
import { useUserId } from '../lib/UserContext';
import { Breadcrumb } from '../components/Breadcrumb';

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

  const refreshSoundtracks = useCallback(() => {
    if (!id) return;
    listByType('recording_movie').then(items => {
      setSoundtracks(items.filter(i => i.movieId === id));
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getItem(id, 'movie').then(setMovie);
    refreshCast();
    refreshSoundtracks();
  }, [id, refreshCast, refreshSoundtracks]);

  if (!movie) return <p>Loading...</p>;

  const handleSave = async (field: string, value: string) => {
    const updated = await updateItem(id!, 'movie', { [field]: value }, userId);
    if (updated) setMovie({ ...movie, ...updated });
  };

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Dossier', to: '/?tab=movies' },
        { label: 'Movies', to: '/movies' },
        { label: movie.name || '' },
      ]} />
      <InlineEdit value={movie.name || ''} onSave={v => handleSave('name', v)} as="h1" />
      <p><InlineEdit value={movie.language || ''} onSave={v => handleSave('language', v)} label="Language" /></p>
      {movie.updatedAt && (
        <p className="meta">
          Last updated: {new Date(movie.updatedAt).toLocaleString()} by {movie.updatedBy}
        </p>
      )}

      <ExternalLinks
        id={id!} entityType="movie"
        externalLinks={movie.externalLinks}
        onUpdate={externalLinks => setMovie({ ...movie, externalLinks } as typeof movie)}
      />

      <TagManager
        id={id!} entityType="movie"
        tags={(movie.tags as string[] | null) || []}
        onUpdate={tags => setMovie({ ...movie, tags } as typeof movie)}
      />

      <CastManager
        movieId={id!}
        movieName={movie.name || ''}
        cast={cast}
        onUpdate={refreshCast}
      />

      <SoundtrackManager
        side="movie"
        movieId={id!}
        movieName={movie.name || ''}
        soundtracks={soundtracks}
        onUpdate={refreshSoundtracks}
      />
    </div>
  );
}
