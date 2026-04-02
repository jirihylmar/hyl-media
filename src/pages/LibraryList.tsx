import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EntityList } from '../components/EntityList';
import { AssetUpload } from '../components/AssetUpload';
import type { KnowledgeGraphItem } from '../lib/client';

export function LibraryList() {
  const [langFilter, setLangFilter] = useState('');
  const [searchParams] = useSearchParams();
  const [showUpload, setShowUpload] = useState(searchParams.get('create') === '1');

  const filterFn = langFilter
    ? (item: KnowledgeGraphItem) => item.language === langFilter
    : undefined;

  return (
    <>
      {showUpload && (
        <AssetUpload
          type="book"
          s3Prefix="library/"
          detailPath="/library"
          onCancel={() => setShowUpload(false)}
        />
      )}
      <EntityList
        entityType="book"
        title="Library"
        detailPath="/library"
        dossierTab="library"
        filterFn={filterFn}
        extraColumns={[
          { label: 'Author', render: item => item.author || '' },
          { label: 'Format', render: item => item.format || '' },
        ]}
        filters={
          <div style={{ marginBottom: '1rem', display: 'flex', gap: 16, alignItems: 'center' }}>
            <div>
              <label>Language: </label>
              <select value={langFilter} onChange={e => setLangFilter(e.target.value)}>
                <option value="">All</option>
                <option value="en">English</option>
                <option value="cs">Czech</option>
              </select>
            </div>
            {!showUpload && (
              <button onClick={() => setShowUpload(true)} className="btn btn-primary btn-sm">+ Upload Book</button>
            )}
          </div>
        }
      />
    </>
  );
}
