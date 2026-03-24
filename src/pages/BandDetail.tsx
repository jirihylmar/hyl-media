import { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { getItem, listByPerformer, listByType, updateItem } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';
import { InlineEdit } from '../components/InlineEdit';
import { ExternalLinks } from '../components/ExternalLinks';
import { TagManager } from '../components/TagManager';
import { useUserId } from '../lib/UserContext';

// Used for bands and collaborations
export function BandDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const userId = useUserId();
  const [entity, setEntity] = useState<KnowledgeGraphItem | null>(null);
  const [recordings, setRecordings] = useState<KnowledgeGraphItem[]>([]);
  const [sheetMusic, setSheetMusic] = useState<KnowledgeGraphItem[]>([]);

  // Determine entity type from URL path
  const entityType = location.pathname.startsWith('/collaborations')
    ? 'collaboration'
    : 'band';

  useEffect(() => {
    if (!id) return;
    getItem(id, entityType).then(setEntity);
    listByPerformer(id).then(setRecordings);
    // Find sheet music where this band/collaboration is a performer
    listByType('sheet_music_performer').then(items => {
      setSheetMusic(items.filter(i => i.performerId === id));
    });
  }, [id, entityType]);

  if (!entity) return <p>Loading...</p>;

  const handleSave = async (field: string, value: string) => {
    const updated = await updateItem(id!, entityType, { [field]: value }, userId);
    if (updated) setEntity({ ...entity, ...updated });
  };

  return (
    <div>
      <InlineEdit value={entity.name || ''} onSave={v => handleSave('name', v)} as="h1" />
      <p><InlineEdit value={entity.language || ''} onSave={v => handleSave('language', v)} label="Language" /></p>
      {entity.updatedAt && (
        <p style={{ fontSize: '0.8em', color: '#888' }}>
          Last updated: {new Date(entity.updatedAt).toLocaleString()} by {entity.updatedBy}
        </p>
      )}

      <ExternalLinks
        id={id!} entityType={entityType}
        wikiUrl={entity.wikiUrl} imdbUrl={entity.imdbUrl}
        spotifyUrl={entity.spotifyUrl} youtubeUrl={entity.youtubeUrl}
        onUpdate={fields => setEntity({ ...entity, ...fields } as typeof entity)}
      />

      <TagManager
        id={id!} entityType={entityType}
        tags={(entity.tags as string[] | null) || []}
        onUpdate={tags => setEntity({ ...entity, tags } as typeof entity)}
      />

      {recordings.length > 0 && (
        <>
          <h2>Discography ({recordings.length})</h2>
          <ul>
            {recordings.map(r => (
              <li key={r.id}>
                <Link to={`/recordings/${r.recordingId}`}>{r.recordingName}</Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {sheetMusic.length > 0 && (
        <>
          <h2>Sheet Music ({sheetMusic.length})</h2>
          <ul>
            {sheetMusic.map(sm => (
              <li key={sm.id}>
                <Link to={`/sheet-music/${sm.sheetMusicId}`}>{sm.name}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
