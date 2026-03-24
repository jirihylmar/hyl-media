import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadData } from 'aws-amplify/storage';
import { createItem } from '../lib/queries';

type Props = {
  type: 'book' | 'sheet_music';
  s3Prefix: string;
  detailPath: string;
  onCancel: () => void;
};

function slugify(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function shortHash(): string {
  return Math.random().toString(36).substring(2, 6);
}

export function AssetUpload({ type, s3Prefix, detailPath, onCancel }: Props) {
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
    const id = `${slugify(name)}_${shortHash()}`;
    const ext = file.name.split('.').pop() || 'pdf';
    const s3Key = `${s3Prefix}${id}.${ext}`;

    try {
      await uploadData({
        path: s3Key,
        data: file,
        options: {
          onProgress: ({ transferredBytes, totalBytes }) => {
            if (totalBytes) setProgress(Math.round((transferredBytes / totalBytes) * 100));
          },
        },
      }).result;

      const item: Record<string, unknown> = {
        id,
        entityType: type,
        name: name.trim(),
        language,
        s3Key,
        format: ext,
      };
      if (type === 'book' && author.trim()) item.author = author.trim();
      if (type === 'sheet_music' && artistName.trim()) item.artistName = artistName.trim();

      await createItem(item);
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
