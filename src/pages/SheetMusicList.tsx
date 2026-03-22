import { EntityList } from '../components/EntityList';

export function SheetMusicList() {
  return (
    <EntityList
      entityType="sheet_music"
      title="Sheet Music"
      detailPath="/sheet-music"
      extraColumns={[
        { label: 'Artist', render: item => item.artistName || '' },
      ]}
    />
  );
}
