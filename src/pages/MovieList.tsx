import { useState } from 'react';
import { EntityList } from '../components/EntityList';
import type { KnowledgeGraphItem } from '../lib/client';

export function MovieList() {
  const [langFilter, setLangFilter] = useState('');

  const filterFn = langFilter
    ? (item: KnowledgeGraphItem) => item.language === langFilter
    : undefined;

  return (
    <EntityList
      entityType="movie"
      title="Movies"
      detailPath="/movies"
      dossierTab="movies"
      filterFn={filterFn}
      createFields={[
        { name: 'name', label: 'Movie Name', required: true },
        { name: 'language', label: 'Language', placeholder: 'en or cs' },
      ]}
      filters={
        <div style={{ marginBottom: '1rem' }}>
          <label>Language: </label>
          <select value={langFilter} onChange={e => setLangFilter(e.target.value)}>
            <option value="">All</option>
            <option value="en">English</option>
            <option value="cs">Czech</option>
          </select>
        </div>
      }
    />
  );
}
