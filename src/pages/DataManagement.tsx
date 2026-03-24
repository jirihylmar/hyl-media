import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listByType } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';
import { TAG_DICTIONARY, TAG_COLORS, getTagCategory } from '../lib/tagDictionary';
import { parseLinks } from '../components/ExternalLinks';

type TabId = 'overview' | 'movies' | 'bands' | 'people' | 'recordings' | 'library' | 'sheets' | 'tags';

export function DataManagement() {
  const [persons, setPersons] = useState<KnowledgeGraphItem[]>([]);
  const [bands, setBands] = useState<KnowledgeGraphItem[]>([]);
  const [movies, setMovies] = useState<KnowledgeGraphItem[]>([]);
  const [recordings, setRecordings] = useState<KnowledgeGraphItem[]>([]);
  const [bookItems, setBookItems] = useState<KnowledgeGraphItem[]>([]);
  const [sheetItems, setSheetItems] = useState<KnowledgeGraphItem[]>([]);
  const [castRefs, setCastRefs] = useState<KnowledgeGraphItem[]>([]);
  const [perfRefs, setPerfRefs] = useState<KnowledgeGraphItem[]>([]);
  const [sheetPerfRefs, setSheetPerfRefs] = useState<KnowledgeGraphItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('overview');

  useEffect(() => {
    Promise.all([
      listByType('person'),
      listByType('band'),
      listByType('movie'),
      listByType('recording'),
      listByType('book'),
      listByType('sheet_music'),
      listByType('movie_cast'),
      listByType('recording_performer'),
      listByType('sheet_music_performer'),
    ]).then(([p, b, m, r, bk, sh, mc, rp, sp]) => {
      setPersons(p); setBands(b); setMovies(m); setRecordings(r);
      setBookItems(bk); setSheetItems(sh); setCastRefs(mc); setPerfRefs(rp); setSheetPerfRefs(sp);
      setLoading(false);
    });
  }, []);

  if (loading) return <p>Loading data...</p>;

  // Lookup maps
  const personById = new Map(persons.map(p => [p.id, p]));
  const personByName = new Map(persons.map(p => [p.name, p]));
  const bandByName = new Map(bands.map(b => [b.name, b]));

  // Helper: find person by name (fuzzy — strip diacritics for matching)
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const personByNorm = new Map(persons.map(p => [normalize(p.name || ''), p]));
  const bandByNorm = new Map(bands.map(b => [normalize(b.name || ''), b]));
  function findPerson(name: string) {
    return personByName.get(name) || personByNorm.get(normalize(name));
  }
  function findBandOrPerson(name: string) {
    return bandByName.get(name) || bandByNorm.get(normalize(name))
      || personByName.get(name) || personByNorm.get(normalize(name));
  }

  // Tag stats
  const allItems = [...movies, ...bands, ...persons, ...recordings, ...bookItems, ...sheetItems];
  const taggedItems = allItems.filter(i => i.tags && (i.tags as string[]).length > 0);
  const tagCounts: Record<string, number> = {};
  for (const item of allItems) {
    for (const tag of ((item.tags as string[] | null) || [])) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  // External link stats
  const entityGroups = [
    { label: 'Movies', items: movies },
    { label: 'Bands', items: bands },
    { label: 'People', items: persons },
    { label: 'Recordings', items: recordings },
    { label: 'Library', items: bookItems },
    { label: 'Sheet Music', items: sheetItems },
  ];
  const linkStats = entityGroups.map(({ label, items }) => {
    const withLinks = items.filter(i => parseLinks(i.externalLinks as string | null).length > 0);
    const typeCounts: Record<string, number> = {};
    for (const item of items) {
      for (const l of parseLinks(item.externalLinks as string | null)) {
        typeCounts[l.type] = (typeCounts[l.type] || 0) + 1;
      }
    }
    return { label, total: items.length, withLinks: withLinks.length, typeCounts };
  });
  const allLinkTypes = [...new Set(linkStats.flatMap(s => Object.keys(s.typeCounts)))].sort();
  const totalWithLinks = linkStats.reduce((s, r) => s + r.withLinks, 0);
  const totalAll = linkStats.reduce((s, r) => s + r.total, 0);

  // Person role stats
  const roleCount = (role: string) => persons.filter(p => (p.roles as string[] | null)?.includes(role)).length;

  // Cast and performer maps for movies/recordings
  const castByMovie = new Map<string, KnowledgeGraphItem[]>();
  for (const c of castRefs) {
    const arr = castByMovie.get(c.movieId as string) || [];
    arr.push(c);
    castByMovie.set(c.movieId as string, arr);
  }
  const perfByRecording = new Map<string, KnowledgeGraphItem[]>();
  for (const p of perfRefs) {
    const arr = perfByRecording.get(p.recordingId as string) || [];
    arr.push(p);
    perfByRecording.set(p.recordingId as string, arr);
  }
  const sheetPerfBySheet = new Map<string, string>();
  for (const sp of sheetPerfRefs) {
    sheetPerfBySheet.set(sp.sheetMusicId as string, sp.performerName as string);
  }

  const tabStyle = (t: string) => ({
    padding: '6px 12px',
    background: tab === t ? '#1a1a2e' : '#ddd',
    color: tab === t ? '#fff' : '#333',
    border: 'none',
    borderRadius: '4px 4px 0 0',
    cursor: 'pointer' as const,
    fontWeight: tab === t ? 'bold' as const : 'normal' as const,
    fontSize: '0.85rem',
  });

  return (
    <div>
      <h1>Data</h1>

      <div style={{ display: 'flex', gap: 3, marginBottom: 16, flexWrap: 'wrap' }}>
        <button style={tabStyle('overview')} onClick={() => setTab('overview')}>Overview</button>
        <button style={tabStyle('movies')} onClick={() => setTab('movies')}>Movies</button>
        <button style={tabStyle('bands')} onClick={() => setTab('bands')}>Bands</button>
        <button style={tabStyle('people')} onClick={() => setTab('people')}>People</button>
        <button style={tabStyle('recordings')} onClick={() => setTab('recordings')}>Recordings</button>
        <button style={tabStyle('library')} onClick={() => setTab('library')}>Library</button>
        <button style={tabStyle('sheets')} onClick={() => setTab('sheets')}>Sheet Music</button>
        <button style={tabStyle('tags')} onClick={() => setTab('tags')}>Tags</button>
      </div>

      {/* ========== OVERVIEW ========== */}
      {tab === 'overview' && (
        <div>
          <h2>Entity Overview</h2>
          <table style={{ borderCollapse: 'collapse', marginBottom: 24, width: '100%' }}>
            <thead>
              <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                <th style={cellStyle}>Entity</th>
                <th style={cellStyle}>Count</th>
                <th style={cellStyle}>External Links</th>
                <th style={cellStyle}>Tagged</th>
              </tr>
            </thead>
            <tbody>
              {linkStats.map(({ label, total, withLinks, typeCounts }) => {
                const items = entityGroups.find(g => g.label === label)?.items || [];
                const tagged = items.filter(i => i.tags && (i.tags as string[]).length > 0).length;
                return (
                  <tr key={label}>
                    <td style={cellStyle}>{label}</td>
                    <td style={cellStyle}>{total}</td>
                    <td style={{ ...cellStyle, color: withLinks === total ? '#059669' : withLinks > 0 ? '#d97706' : '#dc2626', fontWeight: 'bold' }}>
                      {withLinks}/{total} ({pct(withLinks, total)})
                      <span style={{ fontWeight: 'normal', color: '#888', fontSize: '0.7rem', marginLeft: 6 }}>
                        {Object.entries(typeCounts).map(([t, c]) => `${t}:${c}`).join(' ')}
                      </span>
                    </td>
                    <td style={cellStyle}>{tagged}/{total}</td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 'bold', background: '#f5f5f5' }}>
                <td style={cellStyle}>Total</td>
                <td style={cellStyle}>{totalAll}</td>
                <td style={{ ...cellStyle, color: totalWithLinks === totalAll ? '#059669' : '#d97706' }}>
                  {totalWithLinks}/{totalAll} ({pct(totalWithLinks, totalAll)})
                </td>
                <td style={cellStyle}>{taggedItems.length}/{totalAll}</td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: '0.8rem', color: '#888' }}>
            People roles: authors {roleCount('author')}, artists {roleCount('artist')}, actors {roleCount('actor')}, directors {roleCount('director')}, musicians {roleCount('musician')}
            &nbsp;|&nbsp; Cross-refs: {castRefs.length} cast, {perfRefs.length} rec. performers, {sheetPerfRefs.length} sheet performers
          </p>
        </div>
      )}

      {/* ========== MOVIES ========== */}
      {tab === 'movies' && (
        <div>
          <SummaryLine items={movies} label="Movies" />
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr style={{ background: '#1a1a2e', color: '#fff' }}>
              <th style={cellStyle}>Movie</th>
              <th style={cellStyle}>Language</th>
              <th style={cellStyle}>Cast</th>
              <th style={cellStyle}>Tags</th>
              <th style={cellStyle}>External Links</th>
            </tr></thead>
            <tbody>
              {movies.map(m => {
                const cast = castByMovie.get(m.id) || [];
                return (
                  <tr key={m.id}>
                    <td style={cellStyle}><Link to={`/movies/${m.id}`}>{m.name}</Link></td>
                    <td style={cellStyle}>{m.language || '—'}</td>
                    <td style={{ ...cellStyle, maxWidth: 200 }}>
                      {cast.length > 0
                        ? cast.slice(0, 4).map((c, i) => {
                            const p = personById.get(c.personId as string);
                            return <span key={i}>{i > 0 && ', '}{p ? <Link to={`/persons/${p.id}`}>{c.personName}</Link> : c.personName}</span>;
                          })
                        : <span style={{ color: '#ccc' }}>—</span>
                      }
                      {cast.length > 4 && <span style={{ color: '#888' }}> +{cast.length - 4}</span>}
                    </td>
                    <td style={cellStyle}>{renderTags(m.tags as string[] | null)}</td>
                    <td style={cellStyle}>{renderLinkBadges(parseLinks(m.externalLinks as string | null))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ========== BANDS ========== */}
      {tab === 'bands' && (
        <div>
          <SummaryLine items={bands} label="Bands" />
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr style={{ background: '#1a1a2e', color: '#fff' }}>
              <th style={cellStyle}>Band</th>
              <th style={cellStyle}>Tags</th>
              <th style={cellStyle}>External Links</th>
            </tr></thead>
            <tbody>
              {bands.map(b => (
                <tr key={b.id}>
                  <td style={cellStyle}><Link to={`/bands/${b.id}`}>{b.name}</Link></td>
                  <td style={cellStyle}>{renderTags(b.tags as string[] | null)}</td>
                  <td style={cellStyle}>{renderLinkBadges(parseLinks(b.externalLinks as string | null))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ========== PEOPLE ========== */}
      {tab === 'people' && (
        <div>
          <SummaryLine items={persons} label="People" />
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr style={{ background: '#1a1a2e', color: '#fff' }}>
              <th style={cellStyle}>Name</th>
              <th style={cellStyle}>Roles</th>
              <th style={cellStyle}>Tags</th>
              <th style={cellStyle}>External Links</th>
            </tr></thead>
            <tbody>
              {persons.map(p => (
                <tr key={p.id}>
                  <td style={cellStyle}><Link to={`/persons/${p.id}`}>{p.name}</Link></td>
                  <td style={cellStyle}>
                    {(p.roles as string[] | null)?.map(r => (
                      <span key={r} style={{
                        padding: '1px 5px', marginRight: 3, borderRadius: 8, fontSize: '0.7rem',
                        background: r === 'actor' ? '#3b82f620' : r === 'director' ? '#f59e0b20' : r === 'author' ? '#dc262620' : r === 'artist' ? '#0ea5e920' : '#66666620',
                        color: r === 'actor' ? '#3b82f6' : r === 'director' ? '#f59e0b' : r === 'author' ? '#dc2626' : r === 'artist' ? '#0ea5e9' : '#666',
                      }}>{r}</span>
                    )) || '—'}
                  </td>
                  <td style={cellStyle}>{renderTags(p.tags as string[] | null)}</td>
                  <td style={cellStyle}>{renderLinkBadges(parseLinks(p.externalLinks as string | null))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ========== RECORDINGS ========== */}
      {tab === 'recordings' && (
        <div>
          <SummaryLine items={recordings} label="Recordings" />
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr style={{ background: '#1a1a2e', color: '#fff' }}>
              <th style={cellStyle}>Recording</th>
              <th style={cellStyle}>Performer</th>
              <th style={cellStyle}>Tags</th>
              <th style={cellStyle}>External Links</th>
            </tr></thead>
            <tbody>
              {recordings.map(r => {
                const perfs = perfByRecording.get(r.id) || [];
                return (
                  <tr key={r.id}>
                    <td style={cellStyle}><Link to={`/recordings/${r.id}`}>{r.name}</Link></td>
                    <td style={cellStyle}>
                      {perfs.length > 0
                        ? perfs.map((pf, i) => {
                            const entity = findBandOrPerson(pf.performerName as string);
                            const route = entity ? ((entity as KnowledgeGraphItem).entityType === 'band' ? `/bands/${entity.id}` : `/persons/${entity.id}`) : null;
                            return <span key={i}>{i > 0 && ', '}{route ? <Link to={route}>{pf.performerName}</Link> : pf.performerName}</span>;
                          })
                        : <span style={{ color: '#ccc' }}>—</span>
                      }
                    </td>
                    <td style={cellStyle}>{renderTags(r.tags as string[] | null)}</td>
                    <td style={cellStyle}>{renderLinkBadges(parseLinks(r.externalLinks as string | null))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ========== LIBRARY ========== */}
      {tab === 'library' && (
        <div>
          <SummaryLine items={bookItems} label="Library" />
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr style={{ background: '#1a1a2e', color: '#fff' }}>
              <th style={cellStyle}>Title</th>
              <th style={cellStyle}>Author</th>
              <th style={cellStyle}>Tags</th>
              <th style={cellStyle}>External Links</th>
            </tr></thead>
            <tbody>
              {bookItems.map(b => {
                const authorPerson = b.author ? findPerson(b.author) : undefined;
                return (
                  <tr key={b.id}>
                    <td style={cellStyle}><Link to={`/library/${b.id}`}>{b.name}</Link></td>
                    <td style={cellStyle}>
                      {authorPerson
                        ? <Link to={`/persons/${authorPerson.id}`} style={{ color: '#059669' }}>{b.author}</Link>
                        : <span style={{ color: '#888' }}>{b.author || '—'}</span>
                      }
                    </td>
                    <td style={cellStyle}>{renderTags(b.tags as string[] | null)}</td>
                    <td style={cellStyle}>{renderLinkBadges(parseLinks(b.externalLinks as string | null))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ========== SHEET MUSIC ========== */}
      {tab === 'sheets' && (
        <div>
          <SummaryLine items={sheetItems} label="Sheet Music" />
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr style={{ background: '#1a1a2e', color: '#fff' }}>
              <th style={cellStyle}>Title</th>
              <th style={cellStyle}>Artist</th>
              <th style={cellStyle}>Tags</th>
              <th style={cellStyle}>External Links</th>
            </tr></thead>
            <tbody>
              {sheetItems.map(s => {
                const perfName = sheetPerfBySheet.get(s.id) || s.artistName;
                const entity = perfName ? findBandOrPerson(perfName as string) : undefined;
                const route = entity ? ((entity as KnowledgeGraphItem).entityType === 'band' ? `/bands/${entity.id}` : `/persons/${entity.id}`) : null;
                return (
                  <tr key={s.id}>
                    <td style={cellStyle}><Link to={`/sheet-music/${s.id}`}>{s.name}</Link></td>
                    <td style={cellStyle}>
                      {route
                        ? <Link to={route} style={{ color: '#059669' }}>{perfName}</Link>
                        : <span style={{ color: '#888' }}>{(perfName as string) || '—'}</span>
                      }
                    </td>
                    <td style={cellStyle}>{renderTags(s.tags as string[] | null)}</td>
                    <td style={cellStyle}>{renderLinkBadges(parseLinks(s.externalLinks as string | null))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ========== TAGS ========== */}
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
              {entityGroups.map(({ label, items }) => {
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

// --- Shared components ---

function SummaryLine({ items, label }: { items: KnowledgeGraphItem[]; label: string }) {
  const withLinks = items.filter(i => parseLinks(i.externalLinks as string | null).length > 0).length;
  const tagged = items.filter(i => i.tags && (i.tags as string[]).length > 0).length;
  return (
    <>
      <h2>{label} ({items.length})</h2>
      <p style={{ color: '#888', fontSize: '0.85em', marginBottom: 12 }}>
        External links: {withLinks}/{items.length} &nbsp;|&nbsp; Tagged: {tagged}/{items.length}
      </p>
    </>
  );
}

// --- Styles & helpers ---

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

const LINK_COLORS: Record<string, string> = {
  wikipedia: '#636466', imdb: '#f5c518', spotify: '#1db954', youtube: '#ff0000',
  nkp: '#1a3a6b', openlibrary: '#0b6623', musicbrainz: '#ba478f', supermusic: '#e63946',
  discogs: '#333', goodreads: '#553b08',
};

function renderLinkBadges(links: { url: string; type: string }[]) {
  if (links.length === 0) return <span style={{ color: '#ccc' }}>none</span>;
  return (
    <span style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {links.map((l, i) => (
        <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={{
          padding: '1px 6px', background: `${LINK_COLORS[l.type] || '#666'}20`,
          color: LINK_COLORS[l.type] || '#666', borderRadius: 10, fontSize: '0.7rem',
          textDecoration: 'none', border: `1px solid ${LINK_COLORS[l.type] || '#666'}40`,
        }}>{l.type}</a>
      ))}
    </span>
  );
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
