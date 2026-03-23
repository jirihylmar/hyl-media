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

export async function createItem(fields: Record<string, unknown>) {
  const result = await getClient().models.KnowledgeGraphItem.create({
    ...fields,
    createdAt: new Date().toISOString(),
    __typename: 'KnowledgeGraphItem',
  } as never);
  if (result.errors?.length) {
    console.error('createItem errors:', result.errors);
    throw new Error(result.errors[0].message);
  }
  return result.data;
}

export async function deleteItem(id: string, entityType: string) {
  const result = await getClient().models.KnowledgeGraphItem.delete({ id, entityType });
  if (result.errors?.length) {
    console.error('deleteItem errors:', result.errors);
    throw new Error(result.errors[0].message);
  }
  return result.data;
}

export async function updateItem(
  id: string,
  entityType: string,
  fields: Record<string, string | null>,
  userId: string,
) {
  const result = await getClient().models.KnowledgeGraphItem.update({
    id,
    entityType,
    ...fields,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  });
  if (result.errors?.length) {
    console.error('updateItem errors:', result.errors);
    throw new Error(result.errors[0].message);
  }
  return result.data;
}
