import { EntityList } from '../components/EntityList';

export function BandList() {
  return (
    <EntityList
      entityType="band"
      title="Bands"
      detailPath="/bands"
      dossierTab="bands"
    />
  );
}
