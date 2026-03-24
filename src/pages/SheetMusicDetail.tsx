import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItem, listByType, listByPerformer, updateItem } from '../lib/queries';
import { getUrl } from 'aws-amplify/storage';
import type { KnowledgeGraphItem } from '../lib/client';
import { InlineEdit } from '../components/InlineEdit';
import { ExternalLinks } from '../components/ExternalLinks';
import { TagManager } from '../components/TagManager';
import { useUserId } from '../lib/UserContext';

export function SheetMusicDetail() {
  const { id } = useParams<{ id: string }>();
  const userId = useUserId();
  const [sheet, setSheet] = useState<KnowledgeGraphItem | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [crossRefs, setCrossRefs] = useState<KnowledgeGraphItem[]>([]);
  const [relatedRecordings, setRelatedRecordings] = useState<KnowledgeGraphItem[]>([]);

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
    // Find cross-references (sheet_music_performer links)
    listByType('sheet_music_performer').then(items => {
      const refs = items.filter(i => i.sheetMusicId === id);
      setCrossRefs(refs);
      // Find recordings by the same performers
      Promise.all(refs.map(ref => listByPerformer(ref.performerId!))).then(results => {
        const allRecordings = results.flat().filter(r => r.entityType === 'recording_performer');
        // Deduplicate by recordingId
        const seen = new Set<string>();
        setRelatedRecordings(allRecordings.filter(r => {
          if (seen.has(r.recordingId!)) return false;
          seen.add(r.recordingId!);
          return true;
        }));
      });
    });
  }, [id]);

  if (!sheet) return <p>Loading...</p>;

  const handleSave = async (field: string, value: string) => {
    const updated = await updateItem(id!, 'sheet_music', { [field]: value }, userId);
    if (updated) setSheet({ ...sheet, ...updated });
  };

  return (
    <div>
      <InlineEdit value={sheet.name || ''} onSave={v => handleSave('name', v)} as="h1" />
      {sheet.artistName && <p>Artist: {sheet.artistName}</p>}
      <p><InlineEdit value={sheet.language || ''} onSave={v => handleSave('language', v)} label="Language" /></p>
      {sheet.updatedAt && (
        <p style={{ fontSize: '0.8em', color: '#888' }}>
          Last updated: {new Date(sheet.updatedAt).toLocaleString()} by {sheet.updatedBy}
        </p>
      )}

      <ExternalLinks
        id={id!} entityType="sheet_music"
        wikiUrl={sheet.wikiUrl} imdbUrl={sheet.imdbUrl}
        spotifyUrl={sheet.spotifyUrl} youtubeUrl={sheet.youtubeUrl}
        onUpdate={fields => setSheet({ ...sheet, ...fields } as typeof sheet)}
      />

      <TagManager
        id={id!} entityType="sheet_music"
        tags={(sheet.tags as string[] | null) || []}
        onUpdate={tags => setSheet({ ...sheet, tags } as typeof sheet)}
      />

      {crossRefs.length > 0 && (
        <>
          <h2>Related Artists</h2>
          <ul>
            {crossRefs.map(ref => {
              const path = ref.performerType === 'band' ? '/bands' : '/persons';
              return (
                <li key={ref.id}>
                  <Link to={`${path}/${ref.performerId}`}>{ref.performerName}</Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {relatedRecordings.length > 0 && (
        <>
          <h2>Related Recordings ({relatedRecordings.length})</h2>
          <ul>
            {relatedRecordings.map(r => (
              <li key={r.id}>
                <Link to={`/recordings/${r.recordingId}`}>{r.recordingName}</Link>
              </li>
            ))}
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
