import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItem, listByRecording, updateItem } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';
import { InlineEdit } from '../components/InlineEdit';
import { ExternalLinks } from '../components/ExternalLinks';
import { TagManager } from '../components/TagManager';
import { PerformerManager } from '../components/PerformerManager';
import { useUserId } from '../lib/UserContext';

export function RecordingDetail() {
  const { id } = useParams<{ id: string }>();
  const userId = useUserId();
  const [recording, setRecording] = useState<KnowledgeGraphItem | null>(null);
  const [performers, setPerformers] = useState<KnowledgeGraphItem[]>([]);

  const refreshPerformers = useCallback(() => {
    if (!id) return;
    listByRecording(id).then(setPerformers);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getItem(id, 'recording').then(setRecording);
    refreshPerformers();
  }, [id, refreshPerformers]);

  if (!recording) return <p>Loading...</p>;

  const handleSave = async (field: string, value: string) => {
    const updated = await updateItem(id!, 'recording', { [field]: value }, userId);
    if (updated) setRecording({ ...recording, ...updated });
  };

  const movieLinks = performers.filter(p => p.entityType === 'recording_movie');

  return (
    <div>
      <InlineEdit value={recording.name || ''} onSave={v => handleSave('name', v)} as="h1" />
      <p><InlineEdit value={recording.language || ''} onSave={v => handleSave('language', v)} label="Language" /></p>
      {recording.updatedAt && (
        <p className="meta">
          Last updated: {new Date(recording.updatedAt).toLocaleString()} by {recording.updatedBy}
        </p>
      )}

      <ExternalLinks
        id={id!} entityType="recording"
        externalLinks={recording.externalLinks}
        onUpdate={externalLinks => setRecording({ ...recording, externalLinks } as typeof recording)}
      />

      <TagManager
        id={id!} entityType="recording"
        tags={(recording.tags as string[] | null) || []}
        onUpdate={tags => setRecording({ ...recording, tags } as typeof recording)}
      />

      <PerformerManager
        recordingId={id!}
        recordingName={recording.name || ''}
        performers={performers}
        onUpdate={refreshPerformers}
      />

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
