import { EntityList } from '../components/EntityList';

export function CollaborationList() {
  return <EntityList entityType="collaboration" title="Collaborations" detailPath="/collaborations" dossierTab="bands" />;
}
