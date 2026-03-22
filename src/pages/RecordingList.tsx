import { EntityList } from '../components/EntityList';

export function RecordingList() {
  return <EntityList entityType="recording" title="Recordings" detailPath="/recordings" />;
}
