import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listByType } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';
import { TAG_DICTIONARY, TAG_COLORS, getTagCategory } from '../lib/tagDictionary';

type LinkStatus = {
  item: KnowledgeGraphItem;
  linked: boolean;
  linkedTo?: string | null;
};

export function DataManagement() {
  const [books, setBooks] = useState<LinkStatus[]>([]);
  const [sheets, setSheets] = useState<LinkStatus[]>([]);
  const [persons, setPersons] = useState<KnowledgeGraphItem[]>([]);
  const [bands, setBands] = useState<KnowledgeGraphItem[]>([]);
  const [movies, setMovies] = useState<KnowledgeGraphItem[]>([]);
  const [recordings, setRecordings] = useState<KnowledgeGraphItem[]>([]);
  const [crossRefs, setCrossRefs] = useState<KnowledgeGraphItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'books' | 'sheets' | 'tags' | 'persons'>('overview');

  useEffect(() => {
    Promise.all([
      listByType('book'),
      listByType('sheet_music'),
      listByType('person'),
      listByType('band'),
      listByType('movie'),
      listByType('recording'),
      listByType('sheet_music_performer'),
    ]).then(([bookItems, sheetItems, personItems, bandItems, movieItems, recordingItems, crossRefItems]) => {
      setPersons(personItems);
      setBands(bandItems);
      setMovies(movieItems);
      setRecordings(recordingItems);
      setCrossRefs(crossRefItems);

      // Check book author → person links
      const personNames = new Set(personItems.map(p => p.name));
      setBooks(bookItems.map(b => ({
        item: b,
        linked: !!b.author && personNames.has(b.author),
        linkedTo: b.author && personNames.has(b.author) ? b.author : undefined,
      })));

      // Check sheet music → performer links
      const sheetCrossRefIds = new Set(crossRefItems.map(cr => cr.sheetMusicId));
      setSheets(sheetItems.map(s => ({
        item: s,
        linked: sheetCrossRefIds.has(s.id),
        linkedTo: crossRefItems.find(cr => cr.sheetMusicId === s.id)?.performerName,
      })));

      setLoading(false);
    });
  }, []);

  if (loading) return <p>Loading data...</p>;

  const linkedBooks = books.filter(b => b.linked);
  const unlinkedBooks = books.filter(b => !b.linked);
  const linkedSheets = sheets.filter(s => s.linked);
  const unlinkedSheets = sheets.filter(s => !s.linked);

  // Tag stats — all entity types
  const allItems = [
    ...books.map(b => b.item), ...sheets.map(s => s.item),
    ...persons, ...bands, ...movies, ...recordings,
  ];
  const taggedItems = allItems.filter(i => i.tags && (i.tags as string[]).length > 0);
  const tagCounts: Record<string, number> = {};
  for (const item of allItems) {
    for (const tag of ((item.tags as string[] | null) || [])) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  // Person role stats
  const authorPersons = persons.filter(p => p.roles && (p.roles as string[]).includes('author'));
  const artistPersons = persons.filter(p => p.roles && (p.roles as string[]).includes('artist'));
  const actorPersons = persons.filter(p => p.roles && (p.roles as string[]).includes('actor'));
  const directorPersons = persons.filter(p => p.roles && (p.roles as string[]).includes('director'));

  const tabStyle = (t: string) => ({
    padding: '8px 16px',
    background: tab === t ? '#1a1a2e' : '#ddd',
    color: tab === t ? '#fff' : '#333',
    border: 'none',
    borderRadius: '4px 4px 0 0',
    cursor: 'pointer' as const,
    fontWeight: tab === t ? 'bold' as const : 'normal' as const,
  });

  return (
    <div>
      <h1>Data Management</h1>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        <button style={tabStyle('overview')} onClick={() => setTab('overview')}>Overview</button>
        <button style={tabStyle('books')} onClick={() => setTab('books')}>Books</button>
        <button style={tabStyle('sheets')} onClick={() => setTab('sheets')}>Sheet Music</button>
        <button style={tabStyle('persons')} onClick={() => setTab('persons')}>Persons</button>
        <button style={tabStyle('tags')} onClick={() => setTab('tags')}>Tags</button>
      </div>

      {tab === 'overview' && (
        <div>
          <h2>Entity Counts</h2>
          <table style={{ borderCollapse: 'collapse', marginBottom: 24 }}>
            <thead>
              <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                <th style={cellStyle}>Entity</th>
                <th style={cellStyle}>Count</th>
                <th style={cellStyle}>Linked</th>
                <th style={cellStyle}>Tagged</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={cellStyle}>Books</td>
                <td style={cellStyle}>{books.length}</td>
                <td style={cellStyle}>{linkedBooks.length} / {books.length} ({pct(linkedBooks.length, books.length)})</td>
                <td style={cellStyle}>{books.filter(b => b.item.tags && (b.item.tags as string[]).length > 0).length} / {books.length}</td>
              </tr>
              <tr>
                <td style={cellStyle}>Sheet Music</td>
                <td style={cellStyle}>{sheets.length}</td>
                <td style={cellStyle}>{linkedSheets.length} / {sheets.length} ({pct(linkedSheets.length, sheets.length)})</td>
                <td style={cellStyle}>{sheets.filter(s => s.item.tags && (s.item.tags as string[]).length > 0).length} / {sheets.length}</td>
              </tr>
              <tr>
                <td style={cellStyle}>Persons</td>
                <td style={cellStyle}>{persons.length}</td>
                <td style={cellStyle} colSpan={2}>
                  authors: {authorPersons.length}, artists: {artistPersons.length}, actors: {actorPersons.length}, directors: {directorPersons.length}
                </td>
              </tr>
              <tr>
                <td style={cellStyle}>Bands</td>
                <td style={cellStyle}>{bands.length}</td>
                <td style={cellStyle} colSpan={2}>—</td>
              </tr>
              <tr>
                <td style={cellStyle}>Cross-refs (sheet_music_performer)</td>
                <td style={cellStyle}>{crossRefs.length}</td>
                <td style={cellStyle} colSpan={2}>—</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === 'books' && (
        <div>
          <h2>Unlinked Books ({unlinkedBooks.length})</h2>
          <p style={{ color: '#888', fontSize: '0.85em' }}>Books whose author does not match any person entity</p>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                <th style={cellStyle}>Book</th>
                <th style={cellStyle}>Author</th>
                <th style={cellStyle}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {unlinkedBooks.map(b => (
                <tr key={b.item.id}>
                  <td style={cellStyle}><Link to={`/library/${b.item.id}`}>{b.item.name}</Link></td>
                  <td style={cellStyle}>{b.item.author || '—'}</td>
                  <td style={cellStyle}>{renderTags(b.item.tags as string[] | null)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 style={{ marginTop: 24 }}>Linked Books ({linkedBooks.length})</h2>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                <th style={cellStyle}>Book</th>
                <th style={cellStyle}>Author (linked)</th>
                <th style={cellStyle}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {linkedBooks.map(b => (
                <tr key={b.item.id}>
                  <td style={cellStyle}><Link to={`/library/${b.item.id}`}>{b.item.name}</Link></td>
                  <td style={cellStyle}>{b.linkedTo}</td>
                  <td style={cellStyle}>{renderTags(b.item.tags as string[] | null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sheets' && (
        <div>
          <h2>Unlinked Sheet Music ({unlinkedSheets.length})</h2>
          <p style={{ color: '#888', fontSize: '0.85em' }}>Sheet music with no performer cross-reference</p>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                <th style={cellStyle}>Title</th>
                <th style={cellStyle}>Artist</th>
                <th style={cellStyle}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {unlinkedSheets.map(s => (
                <tr key={s.item.id}>
                  <td style={cellStyle}><Link to={`/sheet-music/${s.item.id}`}>{s.item.name}</Link></td>
                  <td style={cellStyle}>{s.item.artistName || '—'}</td>
                  <td style={cellStyle}>{renderTags(s.item.tags as string[] | null)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 style={{ marginTop: 24 }}>Linked Sheet Music ({linkedSheets.length})</h2>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                <th style={cellStyle}>Title</th>
                <th style={cellStyle}>Performer (linked)</th>
                <th style={cellStyle}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {linkedSheets.map(s => (
                <tr key={s.item.id}>
                  <td style={cellStyle}><Link to={`/sheet-music/${s.item.id}`}>{s.item.name}</Link></td>
                  <td style={cellStyle}>{s.linkedTo}</td>
                  <td style={cellStyle}>{renderTags(s.item.tags as string[] | null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'persons' && (
        <div>
          <h2>Persons by Role</h2>
          <h3>Authors ({authorPersons.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {authorPersons.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(p => (
              <Link key={p.id} to={`/persons/${p.id}`} style={{
                padding: '2px 8px', background: '#dc262620', color: '#dc2626',
                borderRadius: 12, fontSize: '0.8rem', textDecoration: 'none',
                border: '1px solid #dc262640',
              }}>{p.name}</Link>
            ))}
          </div>
          <h3>Artists ({artistPersons.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {artistPersons.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(p => (
              <Link key={p.id} to={`/persons/${p.id}`} style={{
                padding: '2px 8px', background: '#0ea5e920', color: '#0ea5e9',
                borderRadius: 12, fontSize: '0.8rem', textDecoration: 'none',
                border: '1px solid #0ea5e940',
              }}>{p.name}</Link>
            ))}
          </div>
          <h3>Bands ({bands.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {bands.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(b => (
              <Link key={b.id} to={`/bands/${b.id}`} style={{
                padding: '2px 8px', background: '#8b5cf620', color: '#8b5cf6',
                borderRadius: 12, fontSize: '0.8rem', textDecoration: 'none',
                border: '1px solid #8b5cf640',
              }}>{b.name}</Link>
            ))}
          </div>
        </div>
      )}

      {tab === 'tags' && (
        <div>
          <h2>Tag Dictionary</h2>
          {Object.entries(TAG_DICTIONARY).map(([catKey, cat]) => (
            <div key={catKey} style={{ marginBottom: 20 }}>
              <h3 style={{ color: TAG_COLORS[catKey], marginBottom: 4 }}>{cat.label}</h3>
              <p style={{ fontSize: '0.8rem', color: '#888', margin: '0 0 8px', fontStyle: 'italic' }}>
                Method: {cat.method}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {cat.tags.map(tag => (
                  <span key={tag} style={{
                    padding: '3px 10px',
                    background: `${TAG_COLORS[catKey]}20`,
                    color: TAG_COLORS[catKey],
                    borderRadius: 12, fontSize: '0.85rem',
                    border: `1px solid ${TAG_COLORS[catKey]}40`,
                  }}>
                    {tag} <span style={{ opacity: 0.6 }}>({tagCounts[tag] || 0})</span>
                  </span>
                ))}
              </div>
            </div>
          ))}

          <h2 style={{ marginTop: 24 }}>Tag Coverage</h2>
          <table style={{ borderCollapse: 'collapse', marginBottom: 16 }}>
            <thead>
              <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                <th style={cellStyle}>Entity Type</th>
                <th style={cellStyle}>Total</th>
                <th style={cellStyle}>Tagged</th>
                <th style={cellStyle}>Untagged</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Books', items: books.map(b => b.item) },
                { label: 'Sheet Music', items: sheets.map(s => s.item) },
                { label: 'People', items: persons },
                { label: 'Bands', items: bands },
                { label: 'Movies', items: movies },
                { label: 'Recordings', items: recordings },
              ].map(({ label, items }) => {
                const tagged = items.filter(i => i.tags && (i.tags as string[]).length > 0).length;
                return (
                  <tr key={label}>
                    <td style={cellStyle}>{label}</td>
                    <td style={cellStyle}>{items.length}</td>
                    <td style={cellStyle}>{tagged}</td>
                    <td style={{ ...cellStyle, color: items.length - tagged > 0 ? '#dc2626' : '#059669', fontWeight: 'bold' }}>
                      {items.length - tagged}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 'bold' }}>
                <td style={cellStyle}>Total</td>
                <td style={cellStyle}>{allItems.length}</td>
                <td style={cellStyle}>{taggedItems.length}</td>
                <td style={{ ...cellStyle, color: allItems.length - taggedItems.length > 0 ? '#dc2626' : '#059669' }}>
                  {allItems.length - taggedItems.length}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  padding: '6px 12px',
  border: '1px solid #ddd',
  textAlign: 'left',
  fontSize: '0.85rem',
};

function pct(a: number, b: number) {
  if (b === 0) return '0%';
  return `${Math.round((a / b) * 100)}%`;
}

function renderTags(tags: string[] | null) {
  if (!tags || tags.length === 0) return <span style={{ color: '#ccc' }}>none</span>;
  return (
    <span style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {tags.map(tag => {
        const cat = getTagCategory(tag);
        const color = cat ? TAG_COLORS[cat] : '#666';
        return (
          <span key={tag} style={{
            padding: '1px 6px', background: `${color}20`, color,
            borderRadius: 10, fontSize: '0.75rem',
          }}>{tag}</span>
        );
      })}
    </span>
  );
}
