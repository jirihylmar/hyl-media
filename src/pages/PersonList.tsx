import { useState } from 'react';
import { EntityList } from '../components/EntityList';
import type { KnowledgeGraphItem } from '../lib/client';

export function PersonList() {
  const [roleFilter, setRoleFilter] = useState('');

  const filterFn = roleFilter
    ? (item: KnowledgeGraphItem) => item.roles?.includes(roleFilter) ?? false
    : undefined;

  return (
    <EntityList
      entityType="person"
      title="Persons"
      detailPath="/persons"
      filterFn={filterFn}
      extraColumns={[
        { label: 'Roles', render: item => item.roles?.join(', ') || '' },
      ]}
      filters={
        <div style={{ marginBottom: '1rem' }}>
          <label>Role: </label>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">All</option>
            <option value="actor">Actor</option>
            <option value="director">Director</option>
            <option value="musician">Musician</option>
          </select>
        </div>
      }
    />
  );
}
