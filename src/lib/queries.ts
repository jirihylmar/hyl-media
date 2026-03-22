import { getClient } from './client';
import type { KnowledgeGraphItem } from './client';

function filterNulls(data: (KnowledgeGraphItem | null)[]): KnowledgeGraphItem[] {
  return data.filter((item): item is KnowledgeGraphItem => item !== null);
}

export async function listByType(entityType: string) {
  const result = await getClient().models.KnowledgeGraphItem
    .listKnowledgeGraphItemByEntityTypeAndName(
      { entityType },
      { limit: 1000 },
    );
  if (result.errors?.length) {
    console.error('listByType errors:', result.errors);
  }
  return filterNulls(result.data);
}

export async function getItem(id: string, entityType: string) {
  const result = await getClient().models.KnowledgeGraphItem
    .get({ id, entityType });
  return result.data;
}

export async function listByCastMovie(movieId: string) {
  const result = await getClient().models.KnowledgeGraphItem
    .listKnowledgeGraphItemByMovieIdAndRole({ movieId });
  return filterNulls(result.data);
}

export async function listByPersonFilm(personId: string) {
  const result = await getClient().models.KnowledgeGraphItem
    .listKnowledgeGraphItemByPersonIdAndMovieName({ personId });
  return filterNulls(result.data);
}

export async function listByRecording(recordingId: string) {
  const result = await getClient().models.KnowledgeGraphItem
    .listKnowledgeGraphItemByRecordingIdAndPerformerName({ recordingId });
  return filterNulls(result.data);
}

export async function listByPerformer(performerId: string) {
  const result = await getClient().models.KnowledgeGraphItem
    .listKnowledgeGraphItemByPerformerIdAndRecordingName({ performerId });
  return filterNulls(result.data);
}
