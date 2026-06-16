import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadData } from 'aws-amplify/storage';
import { createDocument } from '../lib/dcQueries';

type Props = {
  type: 'book' | 'sheet_music';
  s3Prefix: string;   // legacy prop (kept for call-site compatibility; uploads now go to documents/)
  detailPath: string;
  onCancel: () => void;
};

function slugify(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function AssetUpload({ type, detailPath, onCancel }: Props) {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const [artistName, setArtistName] = useState('');
  const [language, setLanguage] = useState('en');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (!name) {
      const baseName = f.name.replace(/\.[^.]+$/, '');
      setName(baseName);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name.trim()) { setError('Name and file are required'); return; }

    setUploading(true);
    setError('');
    // DC layout (17.6c): the document is a real file → documents/<uuid>/<slug>.<ext>, with a
    // conformant sidecar + metadata-repo row created by createDocumentMetadata. uuid is the DC PK
    // and _legacy_id (so the detail route /library/<uuid> resolves via getMetadataByLegacyId).
    const id = crypto.randomUUID();
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    const filename = `${slugify(name) || 'document'}.${ext}`;

    try {
      await uploadData({
        path: `documents/${id}/${filename}`,
        data: file,
        options: {
          onProgress: ({ transferredBytes, totalBytes }) => {
            if (totalBytes) setProgress(Math.round((transferredBytes / totalBytes) * 100));
          },
        },
      }).result;

      const creator = type === 'book' ? author.trim() : artistName.trim();
      await createDocument({
        kind: type,
        id,
        filename,
        title: name.trim(),
        creator: creator || undefined,
        language,
        fileType: ext,
        sizeBytes: file.size,
      });
      navigate(`${detailPath}/${id}`);
    } catch (err) {
      setError(String(err));
      setUploading(false);
    }
  };

  return (
    <div style={{
      margin: '16px 0', padding: 16,
      background: 'var(--bg-card)', border: '1px solid var(--border-bright)', maxWidth: 500,
    }}>
      <h3 style={{ marginTop: 0 }}>Upload {type === 'book' ? 'Book' : 'Sheet Music'}</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>File *</label>
          <input ref={fileRef} type="file" accept=".pdf,.epub,.doc,.xps" onChange={handleFileChange}
            style={{ fontSize: '0.95rem' }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required style={inputStyle} />
        </div>
        {type === 'book' && (
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Author</label>
            <input value={author} onChange={e => setAuthor(e.target.value)} style={inputStyle} />
          </div>
        )}
        {type === 'sheet_music' && (
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Artist Name</label>
            <input value={artistName} onChange={e => setArtistName(e.target.value)} style={inputStyle} />
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Language</label>
          <select value={language} onChange={e => setLanguage(e.target.value)} style={inputStyle}>
            <option value="en">English</option>
            <option value="cs">Czech</option>
          </select>
        </div>
        {uploading && (
          <div style={{ marginBottom: 10 }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="meta">{progress}%</span>
          </div>
        )}
        {error && <p style={{ color: 'var(--red)', fontSize: '0.85em' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" disabled={uploading} className="btn btn-primary">{uploading ? 'Uploading...' : 'Upload'}</button>
          <button type="button" onClick={onCancel} className="btn btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 };
const inputStyle: React.CSSProperties = { width: '100%' };
