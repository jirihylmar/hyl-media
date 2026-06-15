import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { searchMetadata } from '../lib/dcClient';
import type { DcViewModel } from '../lib/dcMap';
import { TAG_COLORS, getTagCategory } from '../lib/tagDictionary';

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// entity kind → list group label + detail route.
const KIND_GROUP: Record<string, { label: string; path: string }> = {
  movie: { label: 'Movies', path: '/movies' },
  band: { label: 'Bands', path: '/bands' },
  person: { label: 'People', path: '/persons' },
  recording: { label: 'Recordings', path: '/recordings' },
  book: { label: 'Library', path: '/library' },
  sheet_music: { label: 'Sheet Music', path: '/sheet-music' },
  collaboration: { label: 'Collaborations', path: '/collaborations' },
};
const GROUP_ORDER = ['movie', 'band', 'person', 'recording', 'book', 'sheet_music', 'collaboration'];

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<DcViewModel[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounced server-side search via the DC searchMetadata query.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(() => {
      searchMetadata(q, 100).then((r) => {
        if (!cancelled) { setResults(r); setLoading(false); }
      }).catch(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  // Ctrl/Cmd+K focus, Escape close.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false); setQuery(''); inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Close on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchNorm = normalize(query);
  const grouped = GROUP_ORDER
    .map((kind) => ({ kind, ...KIND_GROUP[kind], matches: results.filter((r) => r.entityKind === kind) }))
    .filter((g) => g.matches.length > 0);
  const totalMatches = results.length;

  const handleResultClick = () => { setOpen(false); setQuery(''); };

  return (
    <div className="global-search" ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        className="global-search-input"
        placeholder="Search... (Ctrl+K)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
      />
      {query && (
        <button className="global-search-clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>&times;</button>
      )}
      {open && query.trim().length >= 2 && (
        <div className="global-search-dropdown">
          {loading ? (
            <p className="global-search-msg">Searching...</p>
          ) : totalMatches === 0 ? (
            <p className="global-search-msg">No results for "{query}"</p>
          ) : (
            <>
              <p className="global-search-count">{totalMatches} result{totalMatches !== 1 ? 's' : ''}</p>
              {grouped.map((group) => (
                <div key={group.kind} className="global-search-group">
                  <div className="global-search-group-label">{group.label} ({group.matches.length})</div>
                  {group.matches.slice(0, 10).map((item) => (
                    <Link
                      key={item.id}
                      to={`${group.path}/${item.legacyId}`}
                      className="global-search-result"
                      onClick={handleResultClick}
                    >
                      <span className="global-search-result-name">{item.name}</span>
                      {item.creators.length > 0 && <span className="global-search-result-meta"> — {item.creators[0]}</span>}
                      {renderMatchedTags(item.tags, searchNorm)}
                    </Link>
                  ))}
                  {group.matches.length > 10 && (
                    <p className="global-search-overflow">+{group.matches.length - 10} more</p>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function renderMatchedTags(tags: string[], searchNorm: string) {
  const matched = tags.filter((t) => t.toLowerCase().includes(searchNorm));
  if (matched.length === 0) return null;
  return (
    <span className="global-search-tags">
      {matched.map((tag) => {
        const cat = getTagCategory(tag);
        const color = cat ? TAG_COLORS[cat] : 'var(--text-dim)';
        return (
          <span key={tag} style={{
            padding: '0 4px', background: `${color}20`, color,
            fontSize: '0.65rem', border: `1px solid ${color}40`, marginLeft: 4,
          }}>{tag}</span>
        );
      })}
    </span>
  );
}
