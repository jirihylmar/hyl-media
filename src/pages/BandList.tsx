import { EntityList } from '../components/EntityList';

export function BandList() {
  return (
    <EntityList
      entityType="band"
      title="Bands"
      detailPath="/bands"
      createFields={[
        { name: 'name', label: 'Band Name', required: true },
        { name: 'language', label: 'Language', placeholder: 'en or cs' },
      ]}
    />
  );
}
