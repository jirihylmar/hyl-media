import { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { getItem, listByPerformer, updateItem } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';
import { InlineEdit } from '../components/InlineEdit';
import { useUserId } from '../lib/UserContext';

// Used for bands, artists, and collaborations
export function BandDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const userId = useUserId();
  const [entity, setEntity] = useState<KnowledgeGraphItem | null>(null);
  const [recordings, setRecordings] = useState<KnowledgeGraphItem[]>([]);

  // Determine entity type from URL path
  const entityType = location.pathname.startsWith('/artists')
    ? 'artist'
    : location.pathname.startsWith('/collaborations')
      ? 'collaboration'
      : 'band';

  useEffect(() => {
    if (!id) return;
    getItem(id, entityType).then(setEntity);
    listByPerformer(id).then(setRecordings);
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
    </div>
  );
}
