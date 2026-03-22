import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listByType } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';

type Props = {
  entityType: string;
  title: string;
  detailPath: string;
  filterFn?: (item: KnowledgeGraphItem) => boolean;
  extraColumns?: { label: string; render: (item: KnowledgeGraphItem) => React.ReactNode }[];
  filters?: React.ReactNode;
};

export function EntityList({ entityType, title, detailPath, filterFn, extraColumns, filters }: Props) {
  const [items, setItems] = useState<KnowledgeGraphItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listByType(entityType).then(data => {
      setItems(data);
      setLoading(false);
    });
  }, [entityType]);

  const filtered = filterFn ? items.filter(filterFn) : items;

  return (
    <div>
      <h1>{title} ({loading ? '...' : filtered.length})</h1>
      {filters}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Name</th>
              <th style={{ padding: '0.5rem' }}>Language</th>
              {extraColumns?.map(col => (
                <th key={col.label} style={{ padding: '0.5rem' }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>
                  <Link to={`${detailPath}/${item.id}`}>{item.name}</Link>
                </td>
                <td style={{ padding: '0.5rem' }}>{item.language}</td>
                {extraColumns?.map(col => (
                  <td key={col.label} style={{ padding: '0.5rem' }}>{col.render(item)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
