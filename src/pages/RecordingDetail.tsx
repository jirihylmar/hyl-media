import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getItem, listByRecording, listByType, updateItem } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';
import { InlineEdit } from '../components/InlineEdit';
import { ExternalLinks } from '../components/ExternalLinks';
import { TagManager } from '../components/TagManager';
import { PerformerManager } from '../components/PerformerManager';
import { SoundtrackManager } from '../components/SoundtrackManager';
import { useUserId } from '../lib/UserContext';
import { Breadcrumb } from '../components/Breadcrumb';

export function RecordingDetail() {
  const { id } = useParams<{ id: string }>();
  const userId = useUserId();
  const [recording, setRecording] = useState<KnowledgeGraphItem | null>(null);
  const [performers, setPerformers] = useState<KnowledgeGraphItem[]>([]);
  const [movieLinks, setMovieLinks] = useState<KnowledgeGraphItem[]>([]);

  const refreshPerformers = useCallback(() => {
    if (!id) return;
    listByRecording(id).then(setPerformers);
  }, [id]);

  const refreshMovieLinks = useCallback(() => {
    if (!id) return;
    listByType('recording_movie').then(items => {
      setMovieLinks(items.filter(i => i.recordingId === id));
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getItem(id, 'recording').then(setRecording);
    refreshPerformers();
    refreshMovieLinks();
  }, [id, refreshPerformers, refreshMovieLinks]);

  if (!recording) return <p>Loading...</p>;

  const handleSave = async (field: string, value: string) => {
    const updated = await updateItem(id!, 'recording', { [field]: value }, userId);
    if (updated) setRecording({ ...recording, ...updated });
  };

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Dossier', to: '/?tab=recordings' },
        { label: 'Recordings', to: '/recordings' },
        { label: recording.name || '' },
      ]} />
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

      <SoundtrackManager
        side="recording"
        recordingId={id!}
        recordingName={recording.name || ''}
        movieLinks={movieLinks}
        onUpdate={refreshMovieLinks}
      />
    </div>
  );
}
