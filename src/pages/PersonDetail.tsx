import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItem, listByPersonFilm, listByPerformer, updateItem } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';
import { InlineEdit } from '../components/InlineEdit';
import { ExternalLinks } from '../components/ExternalLinks';
import { TagManager } from '../components/TagManager';
import { useUserId } from '../lib/UserContext';

export function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const userId = useUserId();
  const [person, setPerson] = useState<KnowledgeGraphItem | null>(null);
  const [films, setFilms] = useState<KnowledgeGraphItem[]>([]);
  const [recordings, setRecordings] = useState<KnowledgeGraphItem[]>([]);

  useEffect(() => {
    if (!id) return;
    getItem(id, 'person').then(setPerson);
    listByPersonFilm(id).then(setFilms);
    listByPerformer(id).then(setRecordings);
  }, [id]);

  if (!person) return <p>Loading...</p>;

  const handleSave = async (field: string, value: string) => {
    const updated = await updateItem(id!, 'person', { [field]: value }, userId);
    if (updated) setPerson({ ...person, ...updated });
  };

  return (
    <div>
      <InlineEdit value={person.name || ''} onSave={v => handleSave('name', v)} as="h1" />
      <p>
        {person.givenName} {person.familyName}
        {person.roles?.length ? ` — ${person.roles.join(', ')}` : ''}
      </p>
      <p><InlineEdit value={person.language || ''} onSave={v => handleSave('language', v)} label="Language" /></p>
      {person.updatedAt && (
        <p style={{ fontSize: '0.8em', color: '#888' }}>
          Last updated: {new Date(person.updatedAt).toLocaleString()} by {person.updatedBy}
        </p>
      )}

      <ExternalLinks
        id={id!} entityType="person"
        wikiUrl={person.wikiUrl} imdbUrl={person.imdbUrl}
        spotifyUrl={person.spotifyUrl} youtubeUrl={person.youtubeUrl}
        onUpdate={fields => setPerson({ ...person, ...fields } as typeof person)}
      />

      <TagManager
        id={id!} entityType="person"
        tags={(person.tags as string[] | null) || []}
        onUpdate={tags => setPerson({ ...person, tags } as typeof person)}
      />

      {films.length > 0 && (
        <>
          <h2>Filmography ({films.length})</h2>
          <ul>
            {films.map(f => (
              <li key={f.id}>
                <Link to={`/movies/${f.movieId}`}>{f.movieName}</Link>
                <span style={{ color: '#888', marginLeft: 8 }}>({f.role})</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {recordings.length > 0 && (
        <>
          <h2>Recordings ({recordings.length})</h2>
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
