import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItem, listByType, listByPerformer, updateItem } from '../lib/queries';
import { getUrl } from 'aws-amplify/storage';
import type { KnowledgeGraphItem } from '../lib/client';
import { InlineEdit } from '../components/InlineEdit';
import { ExternalLinks } from '../components/ExternalLinks';
import { TagManager } from '../components/TagManager';
import { useUserId } from '../lib/UserContext';

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function fuzzyMatch(artistName: string, entityName: string): boolean {
  const a = normalize(artistName);
  const b = normalize(entityName);
  if (a === b) return true;
  // "Rolling Stones" matches "The Rolling Stones"
  if (b.includes(a) || a.includes(b)) return true;
  return false;
}

export function SheetMusicDetail() {
  const { id } = useParams<{ id: string }>();
  const userId = useUserId();
  const [sheet, setSheet] = useState<KnowledgeGraphItem | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [artistEntity, setArtistEntity] = useState<{ id: string; path: string; name: string } | null>(null);
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
      // Find the artist entity by name match (person or band)
      if (data?.artistName) {
        const name = data.artistName;
        Promise.all([listByType('person'), listByType('band')]).then(([persons, bands]) => {
          const person = persons.find(p => p.name && fuzzyMatch(name, p.name));
          if (person) {
            setArtistEntity({ id: person.id!, path: '/persons', name: person.name! });
            // Load their recordings
            listByPerformer(person.id!).then(recs => {
              const recordings = recs.filter(r => r.entityType === 'recording_performer');
              const seen = new Set<string>();
              setRelatedRecordings(recordings.filter(r => {
                if (seen.has(r.recordingId!)) return false;
                seen.add(r.recordingId!);
                return true;
              }));
            });
            return;
          }
          const band = bands.find(b => b.name && fuzzyMatch(name, b.name));
          if (band) {
            setArtistEntity({ id: band.id!, path: '/bands', name: band.name! });
            listByPerformer(band.id!).then(recs => {
              const recordings = recs.filter(r => r.entityType === 'recording_performer');
              const seen = new Set<string>();
              setRelatedRecordings(recordings.filter(r => {
                if (seen.has(r.recordingId!)) return false;
                seen.add(r.recordingId!);
                return true;
              }));
            });
          }
        });
      }
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
      {sheet.artistName && (
        <p>Artist: {artistEntity
          ? <Link to={`${artistEntity.path}/${artistEntity.id}`}>{sheet.artistName}</Link>
          : sheet.artistName
        }</p>
      )}
      <p><InlineEdit value={sheet.language || ''} onSave={v => handleSave('language', v)} label="Language" /></p>
      {sheet.updatedAt && (
        <p className="meta">
          Last updated: {new Date(sheet.updatedAt).toLocaleString()} by {sheet.updatedBy}
        </p>
      )}

      <ExternalLinks
        id={id!} entityType="sheet_music"
        externalLinks={sheet.externalLinks}
        onUpdate={externalLinks => setSheet({ ...sheet, externalLinks } as typeof sheet)}
      />

      <TagManager
        id={id!} entityType="sheet_music"
        tags={(sheet.tags as string[] | null) || []}
        onUpdate={tags => setSheet({ ...sheet, tags } as typeof sheet)}
      />

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
