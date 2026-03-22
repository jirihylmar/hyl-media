import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItem, listByPerformer } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';

export function BandDetail() {
  const { id } = useParams<{ id: string }>();
  const [band, setBand] = useState<KnowledgeGraphItem | null>(null);
  const [recordings, setRecordings] = useState<KnowledgeGraphItem[]>([]);

  useEffect(() => {
    if (!id) return;
    getItem(id, 'band').then(setBand);
    listByPerformer(id).then(setRecordings);
  }, [id]);

  if (!band) return <p>Loading...</p>;

  return (
    <div>
      <h1>{band.name}</h1>
      <p>Language: {band.language}</p>

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
