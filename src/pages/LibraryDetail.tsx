import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getItem } from '../lib/queries';
import { getUrl } from 'aws-amplify/storage';
import type { KnowledgeGraphItem } from '../lib/client';

export function LibraryDetail() {
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<KnowledgeGraphItem | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string>('');

  useEffect(() => {
    if (!id) return;
    getItem(id, 'book').then(data => {
      setBook(data);
      if (data?.s3Key) {
        getUrl({ path: data.s3Key }).then(result => {
          setDownloadUrl(result.url.toString());
        });
      }
    });
  }, [id]);

  if (!book) return <p>Loading...</p>;

  return (
    <div>
      <h1>{book.name}</h1>
      {book.author && <p>Author: {book.author}</p>}
      <p>Format: {book.format}</p>
      <p>Language: {book.language}</p>
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
