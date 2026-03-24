import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listByType } from '../lib/queries';
import type { KnowledgeGraphItem } from '../lib/client';
import { CreateEntityForm } from './CreateEntityForm';

type FieldDef = {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
};

type Props = {
  entityType: string;
  title: string;
  detailPath: string;
  filterFn?: (item: KnowledgeGraphItem) => boolean;
  extraColumns?: { label: string; render: (item: KnowledgeGraphItem) => React.ReactNode }[];
  filters?: React.ReactNode;
  createFields?: FieldDef[];
};

export function EntityList({ entityType, title, detailPath, filterFn, extraColumns, filters, createFields }: Props) {
  const [items, setItems] = useState<KnowledgeGraphItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = () => {
    listByType(entityType).then(data => {
      setItems(data);
      setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, [entityType]);

  const filtered = filterFn ? items.filter(filterFn) : items;

  return (
    <div>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {title} ({loading ? '...' : filtered.length})
        {createFields && !showCreate && (
          <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">+ New</button>
        )}
      </h1>
      {filters}
      {showCreate && createFields && (
        <CreateEntityForm
          entityType={entityType}
          title={title.replace(/s$/, '')}
          fields={createFields}
          detailPath={detailPath}
          onCancel={() => setShowCreate(false)}
        />
      )}
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
