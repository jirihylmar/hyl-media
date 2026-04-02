import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EntityList } from '../components/EntityList';
import { AssetUpload } from '../components/AssetUpload';

export function SheetMusicList() {
  const [searchParams] = useSearchParams();
  const [showUpload, setShowUpload] = useState(searchParams.get('create') === '1');

  return (
    <>
      {showUpload && (
        <AssetUpload
          type="sheet_music"
          s3Prefix="sheet-music/"
          detailPath="/sheet-music"
          onCancel={() => setShowUpload(false)}
        />
      )}
      <EntityList
        entityType="sheet_music"
        title="Sheet Music"
        detailPath="/sheet-music"
        dossierTab="sheets"
        extraColumns={[
          { label: 'Artist', render: item => item.artistName || '' },
        ]}
        filters={
          !showUpload ? (
            <div style={{ marginBottom: '1rem' }}>
              <button onClick={() => setShowUpload(true)} className="btn btn-primary btn-sm">+ Upload Sheet Music</button>
            </div>
          ) : undefined
        }
      />
    </>
  );
}
