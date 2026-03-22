import { EntityList } from '../components/EntityList';

export function ArtistList() {
  return <EntityList entityType="artist" title="Artists" detailPath="/artists" />;
}
