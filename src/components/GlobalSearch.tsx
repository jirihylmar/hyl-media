import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listByType } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';
import { TAG_COLORS, getTagCategory } from '../lib/tagDictionary';

type SearchGroup = {
  label: string;
  detailPath: string;
  matches: KnowledgeGraphItem[];
};

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const ENTITY_GROUPS = [
  { label: 'Movies', type: 'movie', detailPath: '/movies' },
  { label: 'Bands', type: 'band', detailPath: '/bands' },
  { label: 'People', type: 'person', detailPath: '/persons' },
  { label: 'Recordings', type: 'recording', detailPath: '/recordings' },
  { label: 'Library', type: 'book', detailPath: '/library' },
  { label: 'Sheet Music', type: 'sheet_music', detailPath: '/sheet-music' },
];

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [allItems, setAllItems] = useState<Map<string, KnowledgeGraphItem[]>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Load data on first focus
  const loadData = async () => {
    if (loaded) return;
    const results = await Promise.all(ENTITY_GROUPS.map(g => listByType(g.type)));
    const map = new Map<string, KnowledgeGraphItem[]>();
    ENTITY_GROUPS.forEach((g, i) => map.set(g.type, results[i]));
    setAllItems(map);
    setLoaded(true);
  };

  // Keyboard shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
        loadData();
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [loaded]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchNorm = normalize(query);

  function matchesSearch(item: KnowledgeGraphItem): boolean {
    if (!searchNorm || searchNorm.length < 2) return false;
    // Match name fields
    const fields = [item.name, item.author, item.artistName, item.givenName, item.familyName];
    const nameMatch = fields.some(f => f && normalize(String(f)).includes(searchNorm));
    if (nameMatch) return true;
    // Match tags
    const tags = (item.tags as string[] | null) || [];
    return tags.some(t => t.toLowerCase().includes(searchNorm));
  }

  const searchResults: SearchGroup[] = searchNorm.length >= 2
    ? ENTITY_GROUPS.map(g => ({
        label: g.label,
        detailPath: g.detailPath,
        matches: (allItems.get(g.type) || []).filter(matchesSearch),
      })).filter(g => g.matches.length > 0)
    : [];
  const totalMatches = searchResults.reduce((s, g) => s + g.matches.length, 0);

  const handleFocus = () => {
    setOpen(true);
    loadData();
  };

  const handleResultClick = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="global-search" ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        className="global-search-input"
        placeholder="Search... (Ctrl+K)"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={handleFocus}
      />
      {query && (
        <button className="global-search-clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>&times;</button>
      )}
      {open && searchNorm.length >= 2 && (
        <div className="global-search-dropdown">
          {!loaded ? (
            <p className="global-search-msg">Loading...</p>
          ) : totalMatches === 0 ? (
            <p className="global-search-msg">No results for "{query}"</p>
          ) : (
            <>
              <p className="global-search-count">{totalMatches} result{totalMatches !== 1 ? 's' : ''}</p>
              {searchResults.map(group => (
                <div key={group.label} className="global-search-group">
                  <div className="global-search-group-label">{group.label} ({group.matches.length})</div>
                  {group.matches.slice(0, 10).map(item => (
                    <Link
                      key={item.id}
                      to={`${group.detailPath}/${item.id}`}
                      className="global-search-result"
                      onClick={handleResultClick}
                    >
                      <span className="global-search-result-name">{item.name}</span>
                      {item.author && <span className="global-search-result-meta"> — {item.author}</span>}
                      {item.artistName && <span className="global-search-result-meta"> — {item.artistName as string}</span>}
                      {renderMatchedTags(item, searchNorm)}
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

function renderMatchedTags(item: KnowledgeGraphItem, searchNorm: string) {
  const tags = (item.tags as string[] | null) || [];
  const matched = tags.filter(t => t.toLowerCase().includes(searchNorm));
  if (matched.length === 0) return null;
  return (
    <span className="global-search-tags">
      {matched.map(tag => {
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
