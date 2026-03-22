import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItem, listByType } from '../lib/queries';
import { getUrl } from 'aws-amplify/storage';
import type { KnowledgeGraphItem } from '../lib/client';

export function SheetMusicDetail() {
  const { id } = useParams<{ id: string }>();
  const [sheet, setSheet] = useState<KnowledgeGraphItem | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [crossRefs, setCrossRefs] = useState<KnowledgeGraphItem[]>([]);

  useEffect(() => {
    if (!id) return;
    getItem(id, 'sheet_music').then(data => {
      setSheet(data);
      if (data?.s3Key) {
        getUrl({ path: data.s3Key }).then(result => {
          setDownloadUrl(result.url.toString());
        });
      }
    });
    // Find cross-references
    listByType('sheet_music_performer').then(items => {
      setCrossRefs(items.filter(i => i.sheetMusicId === id));
    });
  }, [id]);

  if (!sheet) return <p>Loading...</p>;

  return (
    <div>
      <h1>{sheet.name}</h1>
      {sheet.artistName && <p>Artist: {sheet.artistName}</p>}
      <p>Language: {sheet.language}</p>

      {crossRefs.length > 0 && (
        <>
          <h2>Related Artists</h2>
          <ul>
            {crossRefs.map(ref => {
              const path = ref.performerType === 'band' ? '/bands' :
                          ref.performerType === 'artist' ? '/artists' : '/persons';
              return (
                <li key={ref.id}>
                  <Link to={`${path}/${ref.performerId}`}>{ref.performerName}</Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {downloadUrl && (
        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" style={{
          display: 'inline-block',
          marginTop: '1rem',
          padding: '0.5rem 1rem',
          background: '#1a1a2e',
          color: '#fff',
          textDecoration: 'none',
          borderRadius: 4,
        }}>
          View PDF
        </a>
      )}
    </div>
  );
}
