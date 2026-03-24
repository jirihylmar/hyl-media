import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItem, listByType, updateItem } from '../lib/queries';
import { getUrl } from 'aws-amplify/storage';
import type { KnowledgeGraphItem } from '../lib/client';
import { InlineEdit } from '../components/InlineEdit';
import { ExternalLinks } from '../components/ExternalLinks';
import { TagManager } from '../components/TagManager';
import { useUserId } from '../lib/UserContext';

export function LibraryDetail() {
  const { id } = useParams<{ id: string }>();
  const userId = useUserId();
  const [book, setBook] = useState<KnowledgeGraphItem | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [authorPerson, setAuthorPerson] = useState<KnowledgeGraphItem | null>(null);

  useEffect(() => {
    if (!id) return;
    getItem(id, 'book').then(data => {
      setBook(data);
      if (data?.s3Key) {
        getUrl({ path: data.s3Key }).then(result => {
          setDownloadUrl(result.url.toString());
        });
      }
      // Try to find author as a person entity
      if (data?.author) {
        listByType('person').then(persons => {
          const match = persons.find(p => p.name === data.author);
          if (match) setAuthorPerson(match);
        });
      }
    });
  }, [id]);

  if (!book) return <p>Loading...</p>;

  const handleSave = async (field: string, value: string) => {
    const updated = await updateItem(id!, 'book', { [field]: value }, userId);
    if (updated) setBook({ ...book, ...updated });
  };

  return (
    <div>
      <InlineEdit value={book.name || ''} onSave={v => handleSave('name', v)} as="h1" />
      {book.author && (
        <p>Author: {authorPerson
          ? <Link to={`/persons/${authorPerson.id}`}>{book.author}</Link>
          : book.author
        }</p>
      )}
      <p>Format: {book.format}</p>
      <p><InlineEdit value={book.language || ''} onSave={v => handleSave('language', v)} label="Language" /></p>
      {book.updatedAt && (
        <p style={{ fontSize: '0.8em', color: '#888' }}>
          Last updated: {new Date(book.updatedAt).toLocaleString()} by {book.updatedBy}
        </p>
      )}

      <ExternalLinks
        id={id!} entityType="book"
        wikiUrl={book.wikiUrl} imdbUrl={book.imdbUrl}
        spotifyUrl={book.spotifyUrl} youtubeUrl={book.youtubeUrl}
        onUpdate={fields => setBook({ ...book, ...fields } as typeof book)}
      />

      <TagManager
        id={id!} entityType="book"
        tags={(book.tags as string[] | null) || []}
        onUpdate={tags => setBook({ ...book, tags } as typeof book)}
      />

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
          Download / View
        </a>
      )}
    </div>
  );
}
