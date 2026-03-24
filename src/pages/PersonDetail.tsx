import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItem, listByPersonFilm, listByPerformer, listByType, updateItem } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';
import { InlineEdit } from '../components/InlineEdit';
import { ExternalLinks } from '../components/ExternalLinks';
import { TagManager } from '../components/TagManager';
import { useUserId } from '../lib/UserContext';

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const userId = useUserId();
  const [person, setPerson] = useState<KnowledgeGraphItem | null>(null);
  const [films, setFilms] = useState<KnowledgeGraphItem[]>([]);
  const [recordings, setRecordings] = useState<KnowledgeGraphItem[]>([]);
  const [sheetMusic, setSheetMusic] = useState<KnowledgeGraphItem[]>([]);
  const [books, setBooks] = useState<KnowledgeGraphItem[]>([]);

  useEffect(() => {
    if (!id) return;
    getItem(id, 'person').then(data => {
      setPerson(data);
      // Find books by this person (author name match)
      if (data?.name) {
        listByType('book').then(items => {
          const personNorm = normalize(data.name!);
          setBooks(items.filter(b => b.author && normalize(b.author) === personNorm));
        });
      }
    });
    listByPersonFilm(id).then(setFilms);
    listByPerformer(id).then(setRecordings);
    // Find sheet music by artistName match (handles diacritics)
    getItem(id, 'person').then(p => {
      if (!p?.name) return;
      const pNorm = normalize(p.name!);
      listByType('sheet_music').then(sheets => {
        setSheetMusic(sheets.filter(s =>
          s.artistName && normalize(s.artistName).includes(pNorm)
        ));
      });
    });
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
        <p className="meta">
          Last updated: {new Date(person.updatedAt).toLocaleString()} by {person.updatedBy}
        </p>
      )}

      <ExternalLinks
        id={id!} entityType="person"
        externalLinks={person.externalLinks}
        onUpdate={externalLinks => setPerson({ ...person, externalLinks } as typeof person)}
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

      {sheetMusic.length > 0 && (
        <>
          <h2>Sheet Music ({sheetMusic.length})</h2>
          <ul>
            {sheetMusic.map(sm => (
              <li key={sm.id}>
                <Link to={`/sheet-music/${sm.id}`}>{sm.name}</Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {books.length > 0 && (
        <>
          <h2>Books ({books.length})</h2>
          <ul>
            {books.map(b => (
              <li key={b.id}>
                <Link to={`/library/${b.id}`}>{b.name}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
