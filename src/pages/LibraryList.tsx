import { useState } from 'react';
import { EntityList } from '../components/EntityList';
import type { KnowledgeGraphItem } from '../lib/client';

export function LibraryList() {
  const [langFilter, setLangFilter] = useState('');

  const filterFn = langFilter
    ? (item: KnowledgeGraphItem) => item.language === langFilter
    : undefined;

  return (
    <EntityList
      entityType="book"
      title="Library"
      detailPath="/library"
      filterFn={filterFn}
      extraColumns={[
        { label: 'Author', render: item => item.author || '' },
        { label: 'Format', render: item => item.format || '' },
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
