import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listByType } from '../lib/queries';
import { listEntitiesForList } from '../lib/dcQueries';
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
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabId) || 'overview';
  const [tab, setTab] = useState<TabId>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    Promise.all([
      // Entity data from the DC store (drives counts/tags/links/tabs).
      listEntitiesForList('person'),
      listEntitiesForList('band'),
      listEntitiesForList('movie'),
      listEntitiesForList('recording'),
      listEntitiesForList('book'),
      listEntitiesForList('sheet_music'),
      // Relationship cross-refs stay on the (intact, read-only) legacy table for display.
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

  const TABS: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'movies', label: 'Movies' },
    { id: 'bands', label: 'Bands' },
    { id: 'people', label: 'People' },
    { id: 'recordings', label: 'Recordings' },
    { id: 'library', label: 'Library' },
    { id: 'sheets', label: 'Sheet Music' },
    { id: 'tags', label: 'Tags' },
  ];

  // Search across all entities
  const searchNorm = searchQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const SEARCH_ENTITY_GROUPS: { label: string; type: string; items: KnowledgeGraphItem[]; detailPath: string; tab: TabId }[] = [
    { label: 'Movies', type: 'movie', items: movies, detailPath: '/movies', tab: 'movies' },
    { label: 'Bands', type: 'band', items: bands, detailPath: '/bands', tab: 'bands' },
    { label: 'People', type: 'person', items: persons, detailPath: '/persons', tab: 'people' },
    { label: 'Recordings', type: 'recording', items: recordings, detailPath: '/recordings', tab: 'recordings' },
    { label: 'Library', type: 'book', items: bookItems, detailPath: '/library', tab: 'library' },
    { label: 'Sheet Music', type: 'sheet_music', items: sheetItems, detailPath: '/sheet-music', tab: 'sheets' },
  ];

  function matchesSearch(item: KnowledgeGraphItem): boolean {
    if (!searchNorm) return false;
    const fields = [item.name, item.author, item.artistName, item.givenName, item.familyName];
    return fields.some(f => f && f.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(searchNorm));
  }

  const searchResults = searchNorm.length >= 2
    ? SEARCH_ENTITY_GROUPS.map(g => ({
        ...g,
        matches: g.items.filter(matchesSearch),
      })).filter(g => g.matches.length > 0)
    : [];
  const totalMatches = searchResults.reduce((s, g) => s + g.matches.length, 0);

  return (
    <div>
      <div className="search-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Search all entities..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          autoFocus
        />
        {searchQuery && (
          <button className="search-clear" onClick={() => setSearchQuery('')}>&times;</button>
        )}
      </div>

      {searchNorm.length >= 2 && (
        <div className="search-results">
          {totalMatches === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No results for "{searchQuery}"</p>
          ) : (
            <>
              <p className="meta" style={{ marginBottom: 8 }}>{totalMatches} result{totalMatches !== 1 ? 's' : ''}</p>
              {searchResults.map(group => (
                <div key={group.type} style={{ marginBottom: 12 }}>
                  <h3 style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                    {group.label} ({group.matches.length})
                  </h3>
                  {group.matches.slice(0, 20).map(item => (
                    <div key={item.id} className="search-result-item">
                      <Link to={`${group.detailPath}/${item.id}`}>
                        {item.name}
                      </Link>
                      {item.author && <span className="search-result-meta"> — {item.author}</span>}
                      {item.artistName && <span className="search-result-meta"> — {item.artistName}</span>}
                      {item.roles?.length ? <span className="search-result-meta"> ({item.roles.join(', ')})</span> : null}
                    </div>
                  ))}
                  {group.matches.length > 20 && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>+{group.matches.length - 20} more</p>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ========== OVERVIEW ========== */}
      {tab === 'overview' && (
        <div>
          <h2>Entity Overview</h2>
          <div className="table-wrap">
          <table style={{ borderCollapse: 'collapse', marginBottom: 24, width: '100%' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-bright)' }}>
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
                    <td style={{ ...cellStyle, color: withLinks === total ? 'var(--green)' : withLinks > 0 ? 'var(--amber)' : 'var(--red)', fontWeight: 'bold' }}>
                      {withLinks}/{total} ({pct(withLinks, total)})
                      <span style={{ fontWeight: 'normal', color: 'var(--text-muted)', fontSize: '0.65rem', marginLeft: 6 }}>
                        {Object.entries(typeCounts).map(([t, c]) => `${t}:${c}`).join(' ')}
                      </span>
                    </td>
                    <td style={cellStyle}>{tagged}/{total}</td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 'bold', borderTop: '1px solid var(--border-bright)' }}>
                <td style={cellStyle}>Total</td>
                <td style={cellStyle}>{totalAll}</td>
                <td style={{ ...cellStyle, color: totalWithLinks === totalAll ? 'var(--green)' : 'var(--amber)' }}>
                  {totalWithLinks}/{totalAll} ({pct(totalWithLinks, totalAll)})
                </td>
                <td style={cellStyle}>{taggedItems.length}/{totalAll}</td>
              </tr>
            </tbody>
          </table>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            People roles: authors {roleCount('author')}, artists {roleCount('artist')}, actors {roleCount('actor')}, directors {roleCount('director')}, musicians {roleCount('musician')}
            &nbsp;|&nbsp; Cross-refs: {castRefs.length} cast, {perfRefs.length} rec. performers, {sheetPerfRefs.length} sheet performers
          </p>
        </div>
      )}

      {/* ========== MOVIES ========== */}
      {tab === 'movies' && (
        <div>
          <SummaryLine items={movies} label="Movies" createPath="/movies?create=1" />
          <div className="table-wrap">
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border-bright)' }}>
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
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>
                      }
                      {cast.length > 4 && <span style={{ color: 'var(--text-dim)' }}> +{cast.length - 4}</span>}
                    </td>
                    <td style={cellStyle}>{renderTags(m.tags as string[] | null)}</td>
                    <td style={cellStyle}>{renderLinkBadges(parseLinks(m.externalLinks as string | null))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* ========== BANDS ========== */}
      {tab === 'bands' && (
        <div>
          <SummaryLine items={bands} label="Bands" createPath="/bands?create=1" />
          <div className="table-wrap">
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border-bright)' }}>
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
        </div>
      )}

      {/* ========== PEOPLE ========== */}
      {tab === 'people' && (
        <div>
          <SummaryLine items={persons} label="People" createPath="/persons?create=1" />
          <div className="table-wrap">
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border-bright)' }}>
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
                        padding: '1px 4px', marginRight: 3, fontSize: '0.68rem',
                        border: `1px solid ${r === 'actor' ? '#4a8ab6' : r === 'director' ? '#b89e3b' : r === 'author' ? '#b64a4a' : r === 'artist' ? '#4ab6a6' : '#555'}40`,
                        color: r === 'actor' ? '#4a8ab6' : r === 'director' ? '#b89e3b' : r === 'author' ? '#b64a4a' : r === 'artist' ? '#4ab6a6' : '#555',
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
        </div>
      )}

      {/* ========== RECORDINGS ========== */}
      {tab === 'recordings' && (
        <div>
          <SummaryLine items={recordings} label="Recordings" createPath="/recordings?create=1" />
          <div className="table-wrap">
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border-bright)' }}>
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
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>
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
        </div>
      )}

      {/* ========== LIBRARY ========== */}
      {tab === 'library' && (
        <div>
          <SummaryLine items={bookItems} label="Library" createPath="/library?create=1" />
          <div className="table-wrap">
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border-bright)' }}>
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
                        ? <Link to={`/persons/${authorPerson.id}`} style={{ color: 'var(--green)' }}>{b.author}</Link>
                        : <span style={{ color: 'var(--text-dim)' }}>{b.author || '—'}</span>
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
        </div>
      )}

      {/* ========== SHEET MUSIC ========== */}
      {tab === 'sheets' && (
        <div>
          <SummaryLine items={sheetItems} label="Sheet Music" createPath="/sheet-music?create=1" />
          <div className="table-wrap">
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border-bright)' }}>
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
                        ? <Link to={route} style={{ color: 'var(--green)' }}>{perfName}</Link>
                        : <span style={{ color: 'var(--text-dim)' }}>{(perfName as string) || '—'}</span>
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
        </div>
      )}

      {/* ========== TAGS ========== */}
      {tab === 'tags' && (
        <div>
          <h2>Tag Dictionary</h2>
          {Object.entries(TAG_DICTIONARY).map(([catKey, cat]) => (
            <div key={catKey} style={{ marginBottom: 20 }}>
              <h3 style={{ color: TAG_COLORS[catKey], marginBottom: 4 }}>{cat.label}</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '0 0 8px', fontStyle: 'italic' }}>
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
          <div className="table-wrap">
          <table style={{ borderCollapse: 'collapse', marginBottom: 16 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-bright)' }}>
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
                    <td style={{ ...cellStyle, color: items.length - tagged > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 'bold' }}>
                      {items.length - tagged}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 'bold' }}>
                <td style={cellStyle}>Total</td>
                <td style={cellStyle}>{allItems.length}</td>
                <td style={cellStyle}>{taggedItems.length}</td>
                <td style={{ ...cellStyle, color: allItems.length - taggedItems.length > 0 ? 'var(--red)' : 'var(--green)' }}>
                  {allItems.length - taggedItems.length}
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Shared components ---

function SummaryLine({ items, label, createPath }: { items: KnowledgeGraphItem[]; label: string; createPath?: string }) {
  const withLinks = items.filter(i => parseLinks(i.externalLinks as string | null).length > 0).length;
  const tagged = items.filter(i => i.tags && (i.tags as string[]).length > 0).length;
  return (
    <>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {label} ({items.length})
        {createPath && <Link to={createPath} className="btn btn-primary btn-sm">+ New</Link>}
      </h2>
      <p className="meta" style={{ marginBottom: 12 }}>
        External links: {withLinks}/{items.length} | Tagged: {tagged}/{items.length}
      </p>
    </>
  );
}

// --- Styles & helpers ---

const cellStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderBottom: '1px solid var(--border)',
  textAlign: 'left',
  fontSize: '0.85rem',
};


function pct(a: number, b: number) {
  if (b === 0) return '0%';
  return `${Math.round((a / b) * 100)}%`;
}

const LINK_COLORS: Record<string, string> = {
  wikipedia: '#7a8a7a', imdb: '#d4a520', spotify: '#1db954', youtube: '#cc3333',
  nkp: '#4a7a9a', openlibrary: '#2a8a4a', musicbrainz: '#9a5a8a', supermusic: '#cc4a5a',
  discogs: '#6a6a6a', goodreads: '#8a7a3a',
};

function renderLinkBadges(links: { url: string; type: string }[]) {
  if (links.length === 0) return <span style={{ color: 'var(--text-muted)' }}>--</span>;
  return (
    <span style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {links.map((l, i) => (
        <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={{
          padding: '1px 5px', background: `${LINK_COLORS[l.type] || '#555'}20`,
          color: LINK_COLORS[l.type] || '#555', fontSize: '0.68rem',
          textDecoration: 'none', border: `1px solid ${LINK_COLORS[l.type] || '#555'}40`,
        }}>{l.type}</a>
      ))}
    </span>
  );
}

function renderTags(tags: string[] | null) {
  if (!tags || tags.length === 0) return <span style={{ color: 'var(--text-muted)' }}>--</span>;
  return (
    <span style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {tags.map(tag => {
        const cat = getTagCategory(tag);
        const color = cat ? TAG_COLORS[cat] : 'var(--text-dim)';
        return (
          <span key={tag} style={{
            padding: '1px 5px', background: `${color}15`, color,
            fontSize: '0.7rem', border: `1px solid ${color}30`,
          }}>{tag}</span>
        );
      })}
    </span>
  );
}
