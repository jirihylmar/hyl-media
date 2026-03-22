import { getClient } from './client';

export async function listByType(entityType: string) {
  const result = await getClient().models.KnowledgeGraphItem
    .listKnowledgeGraphItemByEntityTypeAndName({ entityType });
  return result.data;
}

export async function getItem(id: string, entityType: string) {
  const result = await getClient().models.KnowledgeGraphItem
    .get({ id, entityType });
  return result.data;
}

export async function listByCastMovie(movieId: string) {
  const result = await getClient().models.KnowledgeGraphItem
    .listKnowledgeGraphItemByMovieIdAndRole({ movieId });
  return result.data;
}

export async function listByPersonFilm(personId: string) {
  const result = await getClient().models.KnowledgeGraphItem
    .listKnowledgeGraphItemByPersonIdAndMovieName({ personId });
  return result.data;
}

export async function listByRecording(recordingId: string) {
  const result = await getClient().models.KnowledgeGraphItem
    .listKnowledgeGraphItemByRecordingIdAndPerformerName({ recordingId });
  return result.data;
}

export async function listByPerformer(performerId: string) {
  const result = await getClient().models.KnowledgeGraphItem
    .listKnowledgeGraphItemByPerformerIdAndRecordingName({ performerId });
  return result.data;
}
