import { useState } from 'react';
import { EntityList } from '../components/EntityList';
import { AssetUpload } from '../components/AssetUpload';

export function SheetMusicList() {
  const [showUpload, setShowUpload] = useState(false);

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
