import { EntityList } from '../components/EntityList';

export function RecordingList() {
  return (
    <EntityList
      entityType="recording"
      title="Recordings"
      detailPath="/recordings"
      dossierTab="recordings"
      createFields={[
        { name: 'name', label: 'Recording Name', required: true },
        { name: 'language', label: 'Language', placeholder: 'en or cs' },
      ]}
    />
  );
}
