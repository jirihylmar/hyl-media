import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listEntitiesForList } from '../lib/dcQueries';
import type { KnowledgeGraphItem } from '../lib/client';
import { Breadcrumb } from './Breadcrumb';

type Props = {
  entityType: string;
  title: string;
  detailPath: string;
  filterFn?: (item: KnowledgeGraphItem) => boolean;
  extraColumns?: { label: string; render: (item: KnowledgeGraphItem) => React.ReactNode }[];
  filters?: React.ReactNode;
  dossierTab?: string;
};

export function EntityList({ entityType, title, detailPath, filterFn, extraColumns, filters, dossierTab }: Props) {
  const [items, setItems] = useState<KnowledgeGraphItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    listEntitiesForList(entityType).then(data => {
      setItems(data);
      setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, [entityType]);

  const filtered = filterFn ? items.filter(filterFn) : items;

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Dossier', to: dossierTab ? `/?tab=${dossierTab}` : '/' },
        { label: title },
      ]} />
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {title} ({loading ? '...' : filtered.length})
      </h1>
      {filters}
      {loading ? (
        <p className="loading">Loading</p>
      ) : (
        <div className="table-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-bright)', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem 0.6rem', color: 'var(--text-bright)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 1 }}>Name</th>
              <th style={{ padding: '0.5rem 0.6rem', color: 'var(--text-bright)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 1 }}>Lang</th>
              {extraColumns?.map(col => (
                <th key={col.label} style={{ padding: '0.5rem 0.6rem', color: 'var(--text-bright)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 1 }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.4rem 0.6rem' }}>
                  <Link to={`${detailPath}/${item.id}`}>{item.name}</Link>
                </td>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>{item.language}</td>
                {extraColumns?.map(col => (
                  <td key={col.label} style={{ padding: '0.4rem 0.6rem' }}>{col.render(item)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
